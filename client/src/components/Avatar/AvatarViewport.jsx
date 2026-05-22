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
import { useAnimationManager } from '../../animations/AnimationManager.js';

const DEFAULT_SETTINGS = {
  scale: 1.15,
  positionX: 0,
  positionY: 0,
  positionZ: 0,
  rotationY: 0,
  cameraZoom: 1.6,
  cameraHeight: 1.3,
  autoAnimate: true,
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

const AvatarViewport = forwardRef(function AvatarViewport({ 
  emotion, 
  visemeData, 
  isThinking = false, 
  isTalking = false,
  analyser
}, ref) {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const lastTimeRef = useRef(performance.now());
  const animFrameRef = useRef(null);
  const modelContainerRef = useRef(new THREE.Group());
  const vrmRef = useRef(null);
  const updateAnimationsRef = useRef(null);

  const { vrm, loading, progress, error, loadVRM, loadVRMFromFile, dispose } = useVRM();
  const { updateAnimations, triggerAnimation } = useAnimationManager();

  // Keep refs in sync so the render loop always sees current values
  // without causing the renderer to be destroyed/recreated
  vrmRef.current = vrm;
  updateAnimationsRef.current = updateAnimations;
  
  const [hasModel, setHasModel] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [avatarSettings, setAvatarSettings] = useState(loadAvatarSettings);
  const avatarSettingsRef = useRef(avatarSettings);
  const [webglError, setWebglError] = useState(null);

  const currentEmotion = emotion || 'neutral';

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    loadFile: async (input) => {
      if (typeof input === 'string') {
        console.log('[Avatar] Loading VRM from URL:', input);
        await loadVRM(input);
      } else if (input instanceof File) {
        console.log('[Avatar] Loading VRM file:', input.name);
        await loadVRMFromFile(input);
      } else {
        dispose();
        setHasModel(false);
      }
    },
    triggerAnimation: (type, filename, options) => {
      return triggerAnimation(type, filename, options);
    },
  }), [loadVRM, loadVRMFromFile, dispose, triggerAnimation]);

  // ─── Animation State Ref ───────────────────────────────────
  // We use a ref for the state passed to updateAnimations to avoid 
  // restarting the render loop whenever isThinking/isTalking changes.
  const animStateRef = useRef({ 
    isThinking, 
    isTalking, 
    analyser,
    emotion: currentEmotion,
    autoAnimate: avatarSettings.autoAnimate,
    isTesting: false,
    mouseX: 0,
    mouseY: 0,
    mouseMoving: false,
  });

  // Mouse tracking for lookAt and parallax
  const mousePosRef = useRef({ x: 0, y: 0 });
  const mouseMovingRef = useRef(false);
  const mouseTimerRef = useRef(null);
  const dynamicZoomRef = useRef(0);
  const lastCameraBaseRef = useRef(new THREE.Vector3());

  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    mousePosRef.current = { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
    mouseMovingRef.current = true;
    if (mouseTimerRef.current) clearTimeout(mouseTimerRef.current);
    mouseTimerRef.current = setTimeout(() => {
      mouseMovingRef.current = false;
    }, 1500);
  }, []);

  useEffect(() => {
    animStateRef.current = { 
      isThinking: avatarSettings.autoAnimate ? isThinking : false, 
      isTalking: avatarSettings.autoAnimate ? isTalking : false, 
      analyser,
      emotion: currentEmotion,
      autoAnimate: avatarSettings.autoAnimate,
      isTesting: false,
      mouseX: mousePosRef.current.x,
      mouseY: mousePosRef.current.y,
      mouseMoving: mouseMovingRef.current,
    };
  }, [isThinking, isTalking, analyser, avatarSettings.autoAnimate, currentEmotion]);

  // ─── Three.js Scene Setup (React StrictMode Safe) ───────────
  // CRITICAL: React StrictMode in dev does mount → unmount → mount.
  // canvas.getContext() always returns the SAME context object for a canvas.
  // Calling forceContextLoss() during unmount permanently kills it, and the
  // re-mount gets back the dead context → getShaderPrecisionFormat() → null → crash.
  // Fix: Reuse existing renderer on re-mount. Never call forceContextLoss().
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // ── Reuse existing renderer if available (StrictMode re-mount) ──
    let renderer = rendererRef.current;
    let isNewRenderer = false;

    if (!renderer) {
      try {
        renderer = new THREE.WebGLRenderer({
          canvas,
          powerPreference: 'high-performance',
          failIfMajorPerformanceCaveat: false,
          antialias: true,
          alpha: true,
          logarithmicDepthBuffer: true,
        });
        isNewRenderer = true;
      } catch (e) {
        console.error('[WebGL] Renderer initialization failed:', e);
        setWebglError(
          'WebGL context could not be created. ' +
          'Ensure your GPU drivers are up to date and hardware acceleration is enabled.'
        );
        return;
      }

      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      rendererRef.current = renderer;

      try {
        const gl = renderer.getContext();
        console.log('[WebGL] Renderer created successfully:', {
          gpu: gl.getParameter(gl.RENDERER),
          vendor: gl.getParameter(gl.VENDOR),
          webglVersion: gl.getParameter(gl.VERSION),
        });
      } catch(e) {
        console.log('[WebGL] Renderer created (could not query GPU info)');
      }
    } else {
      console.log('[WebGL] Reusing existing renderer (StrictMode re-mount)');
    }

    // Clear any previous error state
    setWebglError(null);

    // ── GPU Context Loss / Restore Handlers ──────────────────
    let contextLost = false;

    const handleContextLost = (event) => {
      event.preventDefault();
      contextLost = true;
      cancelAnimationFrame(animFrameRef.current);
      console.warn('[WebGL] ⚠ GPU context lost. Pausing render loop...');
      setWebglError('Graphics engine reset. Recovering...');
    };

    const handleContextRestored = () => {
      console.log('[WebGL] ✓ GPU context restored. Rebuilding scene...');
      contextLost = false;
      setWebglError(null);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      animate();
    };

    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);
    canvas.addEventListener('mousemove', handleMouseMove);

    // ── Scene, Camera & Lighting ─────────────────────────────
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.add(modelContainerRef.current);

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, avatarSettings.cameraHeight, avatarSettings.cameraZoom);
    camera.lookAt(0, avatarSettings.cameraHeight - 0.15, 0);
    cameraRef.current = camera;

    // Lighting
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

    // Ground reference
    const groundGeo = new THREE.CircleGeometry(0.6, 32);
    const groundMat = new THREE.MeshBasicMaterial({ color: 0x8855ff, transparent: true, opacity: 0.2 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.001;
    scene.add(ground);

    // Handle resize
    const handleResize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      renderer.setSize(container.clientWidth, container.clientHeight);
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
    };
    handleResize();
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(canvas.parentElement);

    // ── Render Loop ──────────────────────────────────────────
    const animate = () => {
      if (contextLost) return;
      animFrameRef.current = requestAnimationFrame(animate);
      const now = performance.now();
      let delta = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      if (delta > 0.1) delta = 0.016; 

      const currentVrm = vrmRef.current;
      const currentUpdateAnimations = updateAnimationsRef.current;
      if (currentVrm && delta < 0.1) {
        if (!currentVrm.scene.userData.clock) currentVrm.scene.userData.clock = new THREE.Clock();
        const elapsedTime = currentVrm.scene.userData.clock.getElapsedTime();

        // Sync mouse state into anim state ref every frame
        animStateRef.current.mouseX = mousePosRef.current.x;
        animStateRef.current.mouseY = mousePosRef.current.y;
        animStateRef.current.mouseMoving = mouseMovingRef.current;

        if (currentUpdateAnimations) {
          currentUpdateAnimations(currentVrm, delta, { 
            ...animStateRef.current,
            elapsedTime 
          });
        }
      }

      // ── Dynamic Camera: Auto-Zoom & Parallax ────────────────
      const settings = avatarSettingsRef.current;
      const targetZoomOffset = animStateRef.current.isTalking ? -0.35 : 0;
      dynamicZoomRef.current += (targetZoomOffset - dynamicZoomRef.current) * delta * 4;

      const mx = mousePosRef.current.x * 0.04;
      const my = mousePosRef.current.y * 0.03;
      const parallaxX = mx * (settings.cameraZoom * 0.15);
      const parallaxY = my * (settings.cameraZoom * 0.1);

      camera.position.x = (settings.positionX ?? 0) + parallaxX;
      camera.position.y = settings.cameraHeight + parallaxY;
      camera.position.z = (settings.positionZ ?? 0) + settings.cameraZoom + dynamicZoomRef.current;

      const lookTargetY = settings.cameraHeight - 0.15 + my * 0.02;
      camera.lookAt(settings.positionX ?? 0, lookTargetY, settings.positionZ ?? 0);

      renderer.render(scene, camera);
    };
    animate();

    // ── Cleanup ──────────────────────────────────────────────
    // NEVER call forceContextLoss() — it permanently poisons the canvas
    // context and makes re-mount impossible (React StrictMode).
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      resizeObserver.disconnect();
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      canvas.removeEventListener('mousemove', handleMouseMove);
      if (mouseTimerRef.current) clearTimeout(mouseTimerRef.current);
      // Renderer is intentionally NOT disposed here — it will be reused
      // on StrictMode re-mount, or garbage collected on true unmount.
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Apply avatar settings ──────────────────────────────────
  // Use a ref for immediate Three.js updates without waiting for React cycle if needed,
  // but for now we'll just optimize the useEffect and debounce the save.
  useEffect(() => {
    const container = modelContainerRef.current;
    const camera = cameraRef.current;
    if (!container) return;

    // Apply scale
    const s = avatarSettings.scale;
    container.scale.set(s, s, s);

    // Apply position
    container.position.set(
      avatarSettings.positionX ?? 0, 
      avatarSettings.positionY ?? 0, 
      avatarSettings.positionZ ?? 0
    );

    // Apply rotation
    container.rotation.y = avatarSettings.rotationY ?? 0;

    // Camera is now managed dynamically in the render loop
    // (auto-zoom when talking, parallax from mouse movement)
    avatarSettingsRef.current = avatarSettings;

    // Debounce localStorage save to avoid lag during slider movement
    const timer = setTimeout(() => {
      saveAvatarSettings(avatarSettings);
    }, 500);

    return () => clearTimeout(timer);
  }, [avatarSettings]);

  // ─── Load VRM into scene when it changes ────────────────────
  useEffect(() => {
    if (!vrm || !sceneRef.current) return;

    console.log('[Avatar] VRM loaded, adding to scene');

    // ── CLEAR stale settings from localStorage ──
    try { localStorage.removeItem('waifu-avatar-settings'); } catch(e) {}

    // Clear previous model
    const container = modelContainerRef.current;
    while (container.children.length > 0) {
      container.remove(container.children[0]);
    }

    // Reset container
    container.position.set(0, 0, 0);
    container.rotation.set(0, 0, 0);
    container.scale.set(1, 1, 1);

    // Add model
    vrm.scene.position.set(0, 0, 0);
    // Don't reset rotation here! useVRM handles the 180-degree flip.
    container.add(vrm.scene);

    // Helper
    const getBone = (name) => vrm.humanoid.getNormalizedBoneNode ? 
                              vrm.humanoid.getNormalizedBoneNode(name) : 
                              vrm.humanoid.getBoneNode(name);

    // ── Step 1: Get raw bounding box BEFORE any adjustments ──
    const rawBox = new THREE.Box3().setFromObject(vrm.scene);
    const rawSize = rawBox.getSize(new THREE.Vector3());
    const rawCenter = rawBox.getCenter(new THREE.Vector3());

    console.log('[Avatar] Raw bounding box:', {
      min: `(${rawBox.min.x.toFixed(2)}, ${rawBox.min.y.toFixed(2)}, ${rawBox.min.z.toFixed(2)})`,
      max: `(${rawBox.max.x.toFixed(2)}, ${rawBox.max.y.toFixed(2)}, ${rawBox.max.z.toFixed(2)})`,
      size: `(${rawSize.x.toFixed(2)}, ${rawSize.y.toFixed(2)}, ${rawSize.z.toFixed(2)})`
    });

    // ── Step 2: Ground using FOOT BONES if available, else bounding box ──
    const leftFoot = getBone('leftFoot');
    const rightFoot = getBone('rightFoot');
    const hips = getBone('hips');
    
    let groundY = rawBox.min.y; // Default: lowest point of bounding box
    
    // Prefer foot bones for grounding (immune to hair/skirt physics)
    if (leftFoot && rightFoot) {
      const lf = new THREE.Vector3();
      const rf = new THREE.Vector3();
      leftFoot.getWorldPosition(lf);
      rightFoot.getWorldPosition(rf);
      groundY = Math.min(lf.y, rf.y);
      console.log('[Avatar] Using foot bones for grounding:', groundY.toFixed(3));
    } else if (hips) {
      // Estimate: feet are roughly at hips.y - (hips.y - box.min.y)
      // But just use box.min.y as fallback
      console.log('[Avatar] No foot bones, using bounding box min');
    }

    // Center model horizontally (using hips or bounding box center)
    let centerX = rawCenter.x;
    let centerZ = rawCenter.z;
    if (hips) {
      const hw = new THREE.Vector3();
      hips.getWorldPosition(hw);
      centerX = hw.x;
      centerZ = hw.z;
    }

    vrm.scene.position.x = -centerX;
    vrm.scene.position.y = -groundY;
    vrm.scene.position.z = -centerZ;

    // ── Step 3: Force matrix update ──
    container.updateMatrixWorld(true);

    // ── Step 4: Camera positioning ──
    // Use the actual bone positions AFTER grounding.
    let cameraY = 1.3;
    let cameraDist = 1.0;

    const head = getBone('head');
    const neck = getBone('neck');
    const chest = getBone('chest') || getBone('upperChest');
    const hipsNode = getBone('hips');

    if (head) {
      const headPos = new THREE.Vector3();
      head.getWorldPosition(headPos);
      cameraY = headPos.y; // Look directly at head
      console.log('[Avatar] Camera targeting HEAD:', cameraY.toFixed(3));
    } else if (neck) {
      const neckPos = new THREE.Vector3();
      neck.getWorldPosition(neckPos);
      cameraY = neckPos.y + 0.1;
      console.log('[Avatar] Camera targeting NECK:', cameraY.toFixed(3));
    } else if (hipsNode) {
      const hipsPos = new THREE.Vector3();
      hipsNode.getWorldPosition(hipsPos);
      cameraY = hipsPos.y + 0.5; // Guess head height
      console.log('[Avatar] Camera targeting HIPS fallback:', cameraY.toFixed(3));
    } else {
      cameraY = rawSize.y * 0.75;
      console.log('[Avatar] Camera targeting SIZE fallback:', cameraY.toFixed(3));
    }

    // Safety: don't let camera go higher than the actual model top
    cameraY = Math.min(cameraY, rawSize.y * 0.95);
    
    // Zoom logic: based on camera height
    cameraDist = Math.max(cameraY * 0.55, 0.7);

    console.log('[Avatar] Final Auto-framing:', { cameraY, cameraDist });

    // ── Step 5: Apply settings ──
    const freshSettings = {
      ...DEFAULT_SETTINGS,
      cameraHeight: cameraY,
      cameraZoom: cameraDist,
      positionX: 0,
      positionY: 0,
      positionZ: 0,
      rotationY: 0,
      scale: 1.15,
      autoAnimate: avatarSettings.autoAnimate,
    };
    setAvatarSettings(freshSettings);

    // ── Step 6: Immediately position camera ──
    const camera = cameraRef.current;
    if (camera) {
      camera.position.set(0, cameraY, cameraDist);
      camera.lookAt(0, cameraY * 0.9, 0); // Look slightly below camera for natural angle
      console.log('[Avatar] Camera set to:', `pos(0, ${cameraY.toFixed(2)}, ${cameraDist.toFixed(2)})`,
                  `lookAt(0, ${(cameraY * 0.9).toFixed(2)}, 0)`);
    }

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
      <canvas ref={canvasRef} className="avatar-canvas" />

      {/* Loading Overlay with Progress Circle */}
      {loading && (
        <div className="avatar-loading-overlay">
          <div className="loading-circle-container">
            <svg className="loading-circle-svg" viewBox="0 0 100 100">
              <circle className="loading-circle-bg" cx="50" cy="50" r="45" />
              <circle 
                className="loading-circle-progress" 
                cx="50" cy="50" r="45" 
                style={{ strokeDasharray: 283, strokeDashoffset: 283 - (283 * progress) / 100 }}
              />
            </svg>
            <div className="loading-percentage">{progress}%</div>
          </div>
          <div className="loading-text">Summoning Companion...</div>
        </div>
      )}

      {/* Error Message */}
      {(error || webglError) && (
        <div className="avatar-error-overlay">
          <div className="avatar-error-icon">⚠️</div>
          <div className="avatar-error-text">{error || webglError}</div>
          <button className="avatar-error-retry" onClick={() => window.location.reload()}>Retry</button>
        </div>
      )}

      {/* Empty State */}
      {!hasModel && !loading && (
        <div className="avatar-empty">
          <div className="avatar-empty-icon">🎭</div>
          <p>Load a VRM model in <strong>Settings</strong></p>
        </div>
      )}

      {/* Controls Toggle Button */}
      {hasModel && (
        <button
          className="avatar-controls-toggle"
          onClick={() => setShowControls(!showControls)}
          title="Adjust avatar"
        >
          {showControls ? '✕' : '⚙️'}
        </button>
      )}

      {/* Adjustment Controls Panel */}
      {hasModel && showControls && (
        <div className="avatar-controls">
          <div className="avatar-controls-header">
            <div className="avatar-controls-title">Avatar Controls</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>Auto Animate</span>
              <input 
                type="checkbox" 
                checked={avatarSettings.autoAnimate}
                onChange={(e) => updateSetting('autoAnimate', e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
            </div>
          </div>

          <div className="avatar-control-row">
            <label>Scale</label>
            <input
              type="range" min="0.3" max="3.0" step="0.05"
              value={avatarSettings.scale}
              onChange={(e) => updateSetting('scale', parseFloat(e.target.value))}
            />
            <span className="avatar-control-value">{avatarSettings.scale.toFixed(2)}</span>
          </div>

          <div className="avatar-control-row">
            <label>Height</label>
            <input
              type="range" min="-2.0" max="2.0" step="0.05"
              value={avatarSettings.positionY}
              onChange={(e) => updateSetting('positionY', parseFloat(e.target.value))}
            />
            <span className="avatar-control-value">{avatarSettings.positionY.toFixed(2)}</span>
          </div>

          <div className="avatar-control-row">
            <label>Rotation</label>
            <input
              type="range" min={-Math.PI} max={Math.PI} step="0.01"
              value={avatarSettings.rotationY ?? 0}
              onChange={(e) => updateSetting('rotationY', parseFloat(e.target.value))}
            />
            <span className="avatar-control-value">{Math.round((avatarSettings.rotationY ?? 0) * (180/Math.PI))}°</span>
          </div>

          <div className="avatar-control-row">
            <label>Pos X</label>
            <input
              type="range" min="-1.0" max="1.0" step="0.01"
              value={avatarSettings.positionX ?? 0}
              onChange={(e) => updateSetting('positionX', parseFloat(e.target.value))}
            />
            <span className="avatar-control-value">{(avatarSettings.positionX ?? 0).toFixed(2)}</span>
          </div>

          <div className="avatar-control-row">
            <label>Pos Z</label>
            <input
              type="range" min="-1.0" max="1.0" step="0.01"
              value={avatarSettings.positionZ ?? 0}
              onChange={(e) => updateSetting('positionZ', parseFloat(e.target.value))}
            />
            <span className="avatar-control-value">{(avatarSettings.positionZ ?? 0).toFixed(2)}</span>
          </div>

          <div className="avatar-control-row">
            <label>Camera Y</label>
            <input
              type="range" min="0" max="3.0" step="0.05"
              value={avatarSettings.cameraHeight}
              onChange={(e) => updateSetting('cameraHeight', parseFloat(e.target.value))}
            />
            <span className="avatar-control-value">{avatarSettings.cameraHeight.toFixed(2)}</span>
          </div>

          <div className="avatar-control-row">
            <label>Zoom</label>
            <input
              type="range" min="0.5" max="5.0" step="0.1"
              value={avatarSettings.cameraZoom}
              onChange={(e) => updateSetting('cameraZoom', parseFloat(e.target.value))}
            />
            <span className="avatar-control-value">{avatarSettings.cameraZoom.toFixed(1)}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '12px' }}>
            <button className="avatar-controls-reset" onClick={resetSettings}>
              Reset All
            </button>
            <button 
              className="avatar-controls-reset" 
              onClick={() => updateSetting('rotationY', (avatarSettings.rotationY ?? 0) + Math.PI)}
            >
              Flip 180°
            </button>
          </div>

          <div className="avatar-controls-title">Test Animations</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '12px' }}>
            <button className="avatar-controls-reset" onClick={() => triggerAnimation('body', 'idle_sway.json', { blendSpeed: 6 })}>Idle Sway</button>
            <button className="avatar-controls-reset" onClick={() => triggerAnimation('body', 'thinking.json', { blendSpeed: 8 })}>Thinking</button>
            <button className="avatar-controls-reset" onClick={() => triggerAnimation('body', 'wave.json', { blendSpeed: 10 })}>Wave</button>
            <button className="avatar-controls-reset" onClick={() => triggerAnimation('body', 'nod.json', { blendSpeed: 12 })}>Nod</button>
            <button className="avatar-controls-reset" onClick={() => triggerAnimation('body', 'jump.json', { blendSpeed: 10 })}>Jump</button>
            <button className="avatar-controls-reset" onClick={() => triggerAnimation('body', 'talking_gestures.json', { blendSpeed: 6 })}>Gestures</button>
          </div>

          <div className="avatar-controls-title">Test Expressions</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '12px' }}>
            <button className="avatar-controls-reset" onClick={() => triggerAnimation('facial', 'happy.json', { blendSpeed: 10 })}>Happy</button>
            <button className="avatar-controls-reset" onClick={() => triggerAnimation('facial', 'sad.json', { blendSpeed: 8 })}>Sad</button>
            <button className="avatar-controls-reset" onClick={() => triggerAnimation('facial', 'angry.json', { blendSpeed: 10 })}>Angry</button>
            <button className="avatar-controls-reset" onClick={() => triggerAnimation('facial', 'surprised.json', { blendSpeed: 12 })}>Surprised</button>
            <button className="avatar-controls-reset" onClick={() => triggerAnimation('facial', 'wink.json', { blendSpeed: 12 })}>Wink</button>
          </div>
        </div>
      )}
    </div>
  );
});

export default AvatarViewport;
