/**
 * AvatarViewport
 *
 * Three.js canvas that renders a VRM avatar with:
 * - Auto-framing to fit any model size
 * - Adjustable scale, position, and camera zoom
 * - Idle animations (blink, breathe, sway)
 * - Emotion-driven expressions (Phase 2)
 * - Lip sync (Phase 4)
 */

import { useRef, useEffect, useCallback, useState, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { useVRM } from './useVRM.js';
import { useIdleAnimation } from './useIdleAnimation.js';
import { useEmotionAnimation } from './useEmotionAnimation.js';

const DEFAULT_SETTINGS = {
  scale: 1.0,
  positionY: 0,
  cameraZoom: 1.5,
  cameraHeight: 1.35,
};

function loadAvatarSettings() {
  try {
    const saved = localStorage.getItem('waifu-avatar-settings');
    if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
  } catch (e) {}
  return { ...DEFAULT_SETTINGS };
}

function saveAvatarSettings(settings) {
  try {
    localStorage.setItem('waifu-avatar-settings', JSON.stringify(settings));
  } catch (e) {}
}

const AvatarViewport = forwardRef(function AvatarViewport({ emotion, visemeData }, ref) {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const lastTimeRef = useRef(performance.now());
  const animFrameRef = useRef(null);
  const modelContainerRef = useRef(new THREE.Group());

  const { vrm, loading, error, loadVRMFromFile, dispose } = useVRM();
  const { updateIdle } = useIdleAnimation();
  const { updateEmotion } = useEmotionAnimation();
  const [hasModel, setHasModel] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [avatarSettings, setAvatarSettings] = useState(loadAvatarSettings);

  // Expose loadFile method to parent via ref
  useImperativeHandle(ref, () => ({
    loadFile: async (file) => {
      if (file) {
        console.log('[Avatar] Loading VRM file:', file.name);
        await loadVRMFromFile(file);
      } else {
        dispose();
        setHasModel(false);
      }
    },
  }), [loadVRMFromFile, dispose]);

  // ─── Three.js Scene Setup ───────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(1); // Cap at 1.0 to save CPU/GPU on weak machines
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.add(modelContainerRef.current);

    // Camera
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, avatarSettings.cameraHeight, avatarSettings.cameraZoom);
    camera.lookAt(0, avatarSettings.cameraHeight - 0.15, 0);
    cameraRef.current = camera;

    // Lighting — soft, anime-style
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff5ee, 1.3);
    keyLight.position.set(1, 2, 3);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xc8d8ff, 0.5);
    fillLight.position.set(-1, 1, -1);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffc8ff, 0.3);
    rimLight.position.set(0, 1, -3);
    scene.add(rimLight);

    // Ground reference (subtle circle)
    const groundGeo = new THREE.CircleGeometry(0.6, 32);
    const groundMat = new THREE.MeshBasicMaterial({
      color: 0xa882ff,
      transparent: true,
      opacity: 0.05,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.001;
    scene.add(ground);

    // Handle resize
    const handleResize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    handleResize();
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(canvas.parentElement);

    // Render loop
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      const now = performance.now();
      const delta = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      if (vrm) {
        updateIdle(vrm, delta);
        updateEmotion(vrm, emotion, delta);
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      resizeObserver.disconnect();
      renderer.dispose();
    };
  }, [vrm, updateIdle]);

  // ─── Apply avatar settings whenever they change ─────────────
  useEffect(() => {
    const container = modelContainerRef.current;
    const camera = cameraRef.current;

    // Apply scale
    const s = avatarSettings.scale;
    container.scale.set(s, s, s);

    // Apply Y position
    container.position.y = avatarSettings.positionY;

    // Apply camera
    if (camera) {
      camera.position.set(0, avatarSettings.cameraHeight, avatarSettings.cameraZoom);
      camera.lookAt(0, avatarSettings.cameraHeight - 0.15, 0);
    }

    saveAvatarSettings(avatarSettings);
  }, [avatarSettings]);

  // ─── Load VRM into scene when it changes ────────────────────
  useEffect(() => {
    if (!vrm || !sceneRef.current) return;

    console.log('[Avatar] VRM loaded, adding to scene');

    // Clear previous model
    const container = modelContainerRef.current;
    while (container.children.length > 0) {
      container.remove(container.children[0]);
    }

    // Add new model
    container.add(vrm.scene);

    // Auto-frame: compute bounding box and adjust camera
    const box = new THREE.Box3().setFromObject(vrm.scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    console.log('[Avatar] Model bounds:', {
      size: { x: size.x.toFixed(2), y: size.y.toFixed(2), z: size.z.toFixed(2) },
      center: { x: center.x.toFixed(2), y: center.y.toFixed(2), z: center.z.toFixed(2) },
    });

    // Auto-adjust camera based on model height
    const modelHeight = size.y;
    const headHeight = center.y + size.y * 0.25; // Approximate head position
    const zoomDistance = Math.max(modelHeight * 0.9, 1.2);

    setAvatarSettings((prev) => ({
      ...prev,
      cameraHeight: headHeight,
      cameraZoom: zoomDistance,
      positionY: -box.min.y, // Move model so feet are at ground level
    }));

    setHasModel(true);
  }, [vrm]);

  // ─── Settings Handlers ──────────────────────────────────────
  const updateSetting = (key, value) => {
    setAvatarSettings((prev) => ({ ...prev, [key]: value }));
  };

  const resetSettings = () => {
    setAvatarSettings({ ...DEFAULT_SETTINGS });
  };

  return (
    <div className="avatar-viewport">
      {/* Three.js Canvas */}
      <canvas ref={canvasRef} className="avatar-canvas" />

      {/* Loading Overlay */}
      {loading && (
        <div className="avatar-loading">
          <div className="avatar-loading-spinner" />
          <span>Loading model...</span>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="avatar-error">
          <span>⚠️ {error}</span>
        </div>
      )}

      {/* Empty State */}
      {!hasModel && !loading && (
        <div className="avatar-empty">
          <div className="avatar-empty-icon">🎭</div>
          <p>Go to <strong>Settings → Avatar</strong> to load a VRM model</p>
        </div>
      )}

      {/* Controls Toggle Button (only when model is loaded) */}
      {hasModel && (
        <button
          className="avatar-controls-toggle"
          onClick={() => setShowControls(!showControls)}
          title="Adjust avatar"
        >
          ⚙️
        </button>
      )}

      {/* Adjustment Controls Panel */}
      {hasModel && showControls && (
        <div className="avatar-controls">
          <div className="avatar-controls-title">Avatar Controls</div>

          <div className="avatar-control-row">
            <label>Scale</label>
            <input
              type="range"
              min="0.3"
              max="3.0"
              step="0.05"
              value={avatarSettings.scale}
              onChange={(e) => updateSetting('scale', parseFloat(e.target.value))}
            />
            <span className="avatar-control-value">{avatarSettings.scale.toFixed(2)}</span>
          </div>

          <div className="avatar-control-row">
            <label>Height</label>
            <input
              type="range"
              min="-2.0"
              max="2.0"
              step="0.05"
              value={avatarSettings.positionY}
              onChange={(e) => updateSetting('positionY', parseFloat(e.target.value))}
            />
            <span className="avatar-control-value">{avatarSettings.positionY.toFixed(2)}</span>
          </div>

          <div className="avatar-control-row">
            <label>Zoom</label>
            <input
              type="range"
              min="0.5"
              max="5.0"
              step="0.1"
              value={avatarSettings.cameraZoom}
              onChange={(e) => updateSetting('cameraZoom', parseFloat(e.target.value))}
            />
            <span className="avatar-control-value">{avatarSettings.cameraZoom.toFixed(1)}</span>
          </div>

          <div className="avatar-control-row">
            <label>Camera Y</label>
            <input
              type="range"
              min="0"
              max="3.0"
              step="0.05"
              value={avatarSettings.cameraHeight}
              onChange={(e) => updateSetting('cameraHeight', parseFloat(e.target.value))}
            />
            <span className="avatar-control-value">{avatarSettings.cameraHeight.toFixed(2)}</span>
          </div>

          <button className="avatar-controls-reset" onClick={resetSettings}>
            Reset to Default
          </button>
        </div>
      )}
    </div>
  );
});

export default AvatarViewport;
