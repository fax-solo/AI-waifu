import os
import sys
import json
import base64
import io
import time
import subprocess
import tempfile
import re

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import mss
from PIL import Image

SCREENSHOT_WIDTH = 1280
SCREENSHOT_HEIGHT = 720
MAX_ITERATIONS = 15

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AgentRunRequest(BaseModel):
    goal: str
    api_key: str = ""
    model: str = "gemini-2.0-flash-lite"


class AgentStepRequest(BaseModel):
    goal: str
    history: list = []
    api_key: str = ""
    model: str = "gemini-2.0-flash-lite"


class ExecuteRequest(BaseModel):
    action: dict


class AgentStatusRequest(BaseModel):
    action: str
    params: dict = {}


def get_screen_size():
    with mss.MSS() as sct:
        monitor = sct.monitors[1]
        return monitor["width"], monitor["height"]


def capture_screenshot(target_width=SCREENSHOT_WIDTH, target_height=SCREENSHOT_HEIGHT):
    with mss.MSS() as sct:
        monitor = sct.monitors[1]
        raw = sct.grab(monitor)
        img = Image.frombytes("RGB", (raw.width, raw.height), raw.rgb)
        img = img.resize((target_width, target_height), Image.LANCZOS)

        buf = io.BytesIO()
        img.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

        actual_w, actual_h = get_screen_size()
        return {
            "base64": b64,
            "width": target_width,
            "height": target_height,
            "actual_width": actual_w,
            "actual_height": actual_h,
        }


def validate_coords(x, y, actual_w, actual_h):
    if x < 0 or y < 0 or x > actual_w or y > actual_h:
        raise ValueError(
            f"Coordinates ({x}, {y}) out of bounds for screen ({actual_w}x{actual_h})"
        )


def scale_coords(x, y, capture_w, capture_h, actual_w, actual_h):
    sx = actual_w / capture_w
    sy = actual_h / capture_h
    return int(x * sx), int(y * sy)


SYSTEM_PROMPT = """You are a desktop automation agent. Your task is to help the user achieve their goal by controlling the mouse and keyboard.

You will receive a screenshot of the user's desktop. Based on the screenshot, decide what action to take next.

Respond ONLY with a valid JSON object. No markdown, no code fences, no other text.

## Action Types:

### mouse_move
Move the mouse cursor to specific coordinates.
{"action": "mouse_move", "x": <int>, "y": <int>, "reasoning": "<brief explanation>"}

### mouse_click
Click at current position or specific coordinates.
{"action": "mouse_click", "x": <int>, "y": <int>, "button": "left"|"right", "reasoning": "<explanation>"}

### double_click
Double-click at position.
{"action": "double_click", "x": <int>, "y": <int>, "reasoning": "<explanation>"}

### type_text
Type text at the current cursor position.
{"action": "type_text", "text": "<string>", "reasoning": "<explanation>"}

### key_press
Press a keyboard key or shortcut.
{"action": "key_press", "keys": ["ctrl", "c"], "reasoning": "<explanation>"}
For single keys like Enter: {"action": "key_press", "keys": ["enter"], "reasoning": "<explanation>"}

### scroll
Scroll the mouse wheel.
{"action": "scroll", "clicks": <int>, "reasoning": "<explanation>"}
Positive clicks = scroll down, negative = scroll up.

### wait
Wait for a moment (e.g. for a page to load).
{"action": "wait", "seconds": <float>, "reasoning": "<explanation>"}

### screenshot
Take a new screenshot (done automatically each step, but you can request it).
{"action": "screenshot", "reasoning": "<explanation>"}

### done
The goal is complete.
{"action": "done", "summary": "<what was accomplished>", "reasoning": "<explanation>"}

### error
Something went wrong or the goal cannot be achieved.
{"action": "error", "message": "<what went wrong>", "reasoning": "<explanation>"}

## Coordinate System:
The screenshot you receive is {width}x{height}. All coordinates in your response should be relative to this {width}x{height} image. They will be automatically scaled to the actual screen resolution.

## Rules:
1. Always look at the screenshot carefully before each action.
2. Use mouse_move + mouse_click for clicking UI elements.
3. Use type_text for entering text into fields.
4. Use key_press for keyboard shortcuts like Ctrl+C, Enter, Tab, etc.
5. Use wait after actions that need time to complete (page loads, animations).
6. If you need to see the result of your action, use screenshot first, then do the next action.
7. When the goal is complete, respond with {"action": "done", ...}.
8. If you cannot achieve the goal, respond with {"action": "error", ...}.
9. Keep track of what you've done. Do not repeat the same action.
10. Maximum {max_iterations} steps allowed.
11. Coordinates must be within the {width}x{height} image bounds.
12. Before clicking anything important, verify by describing what you see at those coordinates in your reasoning.
"""


def build_prompt(goal, history):
    w = SCREENSHOT_WIDTH
    h = SCREENSHOT_HEIGHT
    prompt = SYSTEM_PROMPT.format(width=w, height=h, max_iterations=MAX_ITERATIONS)
    prompt += f"\n\n## User Goal\n{goal}\n"
    if history:
        prompt += "\n## Previous Actions\n"
        for i, step in enumerate(history):
            prompt += f"{i+1}. {json.dumps(step)}\n"
        prompt += "\n## Current Screenshot\nLook at the screenshot above and decide the next action."
    return prompt


def call_gemini(prompt, screenshot_b64, api_key, model="gemini-2.0-flash-lite"):
    key = api_key or os.environ.get("GEMINI_API_KEY", "")
    if not key:
        raise HTTPException(status_code=400, detail="No Gemini API key configured")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
    body = {
        "contents": [{
            "parts": [
                {"text": prompt},
                {"inline_data": {"mime_type": "image/png", "data": screenshot_b64}}
            ]
        }],
        "generationConfig": {
            "temperature": 0.2,
            "topP": 0.95,
            "maxOutputTokens": 1024,
        }
    }

    resp = _http_post(url, body)

    candidates = resp.get("candidates", [])
    if not candidates:
        raise HTTPException(status_code=502, detail="No candidates from Gemini")

    text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
    if not text:
        raise HTTPException(status_code=502, detail="Empty response from Gemini")

    parsed = _extract_json(text)
    if not parsed.get("action"):
        raise HTTPException(status_code=502, detail=f"Gemini response missing 'action' field: {text[:200]}")
    return parsed


def _http_post(url, body):
    import http.client
    import ssl

    parsed = url.split("/", 3)
    host = parsed[2]
    path = "/" + parsed[3] if len(parsed) > 3 else "/"

    ctx = ssl.create_default_context()
    conn = http.client.HTTPSConnection(host, context=ctx)
    conn.request(
        "POST",
        path,
        body=json.dumps(body),
        headers={"Content-Type": "application/json"},
    )
    resp = conn.getresponse()
    raw = resp.read().decode("utf-8")
    conn.close()
    data = json.loads(raw)
    if "error" in data:
        raise HTTPException(status_code=502, detail=data["error"].get("message", str(data["error"])))
    return data


def _extract_json(text):
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    obj = re.search(r"\{[\s\S]*\}", text)
    if obj:
        try:
            return json.loads(obj.group())
        except json.JSONDecodeError:
            pass
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {"action": "error", "message": f"Could not parse JSON from Gemini", "raw": text[:200]}


def execute_action(action, capture_info):
    action_type = action.get("action", "")
    actual_w = capture_info["actual_width"]
    actual_h = capture_info["actual_height"]
    cap_w = capture_info["width"]
    cap_h = capture_info["height"]

    if action_type == "mouse_move":
        x, y = scale_coords(action["x"], action["y"], cap_w, cap_h, actual_w, actual_h)
        validate_coords(x, y, actual_w, actual_h)
        _pyautogui_moveTo(x, y)

    elif action_type == "mouse_click":
        x = action.get("x")
        y = action.get("y")
        if x is not None and y is not None:
            x, y = scale_coords(x, y, cap_w, cap_h, actual_w, actual_h)
            validate_coords(x, y, actual_w, actual_h)
            _pyautogui_moveTo(x, y)
        button = action.get("button", "left")
        _pyautogui_click(button=button)

    elif action_type == "double_click":
        x = action.get("x")
        y = action.get("y")
        if x is not None and y is not None:
            x, y = scale_coords(x, y, cap_w, cap_h, actual_w, actual_h)
            validate_coords(x, y, actual_w, actual_h)
            _pyautogui_moveTo(x, y)
        _pyautogui_doubleClick()

    elif action_type == "type_text":
        text = action.get("text", "")
        _pyautogui_write(text)

    elif action_type == "key_press":
        keys = action.get("keys", [])
        if len(keys) == 1:
            _pyautogui_press(keys[0])
        else:
            _pyautogui_hotkey(*keys)

    elif action_type == "scroll":
        clicks = action.get("clicks", 0)
        _pyautogui_scroll(clicks)

    elif action_type == "wait":
        seconds = action.get("seconds", 0.5)
        time.sleep(seconds)

    elif action_type in ("screenshot", "done", "error"):
        pass

    else:
        raise ValueError(f"Unknown action type: {action_type}")


def _pyautogui_moveTo(x, y):
    try:
        import pyautogui
        pyautogui.FAILSAFE = True
        pyautogui.moveTo(x, y, duration=0.3)
    except ImportError:
        print(f"[DesktopAgent] pyautogui not available, mock moveTo({x}, {y})")


def _pyautogui_click(button="left"):
    try:
        import pyautogui
        pyautogui.FAILSAFE = True
        pyautogui.click(button=button)
    except ImportError:
        print(f"[DesktopAgent] pyautogui not available, mock click({button})")


def _pyautogui_doubleClick():
    try:
        import pyautogui
        pyautogui.FAILSAFE = True
        pyautogui.doubleClick()
    except ImportError:
        print("[DesktopAgent] pyautogui not available, mock doubleClick")


def _pyautogui_write(text):
    try:
        import pyautogui
        pyautogui.FAILSAFE = True
        pyautogui.write(text, interval=0.05)
    except ImportError:
        print(f"[DesktopAgent] pyautogui not available, mock write({text[:30]}...)")


def _pyautogui_press(key):
    try:
        import pyautogui
        pyautogui.FAILSAFE = True
        pyautogui.press(key)
    except ImportError:
        print(f"[DesktopAgent] pyautogui not available, mock press({key})")


def _pyautogui_hotkey(*keys):
    try:
        import pyautogui
        pyautogui.FAILSAFE = True
        pyautogui.hotkey(*keys)
    except ImportError:
        print(f"[DesktopAgent] pyautogui not available, mock hotkey({keys})")


def _pyautogui_scroll(clicks):
    try:
        import pyautogui
        pyautogui.FAILSAFE = True
        pyautogui.scroll(clicks)
    except ImportError:
        print(f"[DesktopAgent] pyautogui not available, mock scroll({clicks})")


@app.get("/health")
async def health():
    import importlib
    has_pyautogui = importlib.util.find_spec("pyautogui") is not None
    has_mss = importlib.util.find_spec("mss") is not None
    w, h = get_screen_size()
    has_key = bool(os.environ.get("GEMINI_API_KEY"))
    return {
        "status": "ok",
        "screen_size": f"{w}x{h}",
        "has_pyautogui": has_pyautogui,
        "has_mss": has_mss,
        "has_api_key": has_key,
        "max_iterations": MAX_ITERATIONS,
    }


@app.get("/screen-size")
async def screen_size():
    w, h = get_screen_size()
    return {"width": w, "height": h}


@app.get("/screenshot")
async def get_screenshot():
    try:
        result = capture_screenshot()
        return {
            "base64": result["base64"],
            "width": result["width"],
            "height": result["height"],
            "actual_width": result["actual_width"],
            "actual_height": result["actual_height"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/agent/step")
async def agent_step(req: AgentStepRequest):
    try:
        capture = capture_screenshot()
        prompt = build_prompt(req.goal, req.history)
        action = call_gemini(prompt, capture["base64"], req.api_key, req.model)
        return {
            "action": action,
            "screenshot": capture["base64"],
            "width": capture["width"],
            "height": capture["height"],
            "actual_width": capture["actual_width"],
            "actual_height": capture["actual_height"],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/agent/execute")
async def agent_execute(req: ExecuteRequest):
    try:
        capture = capture_screenshot()
        execute_action(req.action, capture)
        return {"success": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/agent/run")
async def agent_run(req: AgentRunRequest):
    try:
        history = []
        results = []

        for iteration in range(MAX_ITERATIONS):
            capture = capture_screenshot()
            prompt = build_prompt(req.goal, history)
            action = call_gemini(prompt, capture["base64"], req.api_key, req.model)

            action_type = action.get("action", "")

            step_result = {
                "iteration": iteration + 1,
                "action": action,
                "screenshot": capture["base64"],
            }
            results.append(step_result)

            if action_type == "done":
                return {"status": "done", "iterations": iteration + 1, "summary": action.get("summary", ""), "steps": results}

            if action_type == "error":
                return {"status": "error", "iterations": iteration + 1, "message": action.get("message", ""), "steps": results}

            try:
                execute_action(action, capture)
            except Exception as e:
                return {"status": "execution_error", "iterations": iteration + 1, "error": str(e), "steps": results}

            history.append(action)

            if action_type != "screenshot":
                time.sleep(0.5)

        return {
            "status": "max_iterations",
            "iterations": MAX_ITERATIONS,
            "message": f"Reached maximum of {MAX_ITERATIONS} iterations",
            "steps": results,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    print("[DesktopAgent] Starting desktop agent server on port 5001...")
    uvicorn.run(app, host="127.0.0.1", port=5001)
