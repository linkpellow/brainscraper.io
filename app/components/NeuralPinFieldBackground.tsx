'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

/**
 * Neural Pin Field Background
 * 
 * GPU-accelerated WebGL background using Three.js InstancedMesh
 * Creates a living depth surface with thousands of pins that move
 * in neural, low-frequency patterns.
 * 
 * Optimized for smooth animations and non-interference with enrichment processes.
 */
export default function NeuralPinFieldBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const pinsRef = useRef<THREE.InstancedMesh | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const timeRef = useRef(0);
  const isActiveRef = useRef(true);
  const isFormFocusedRef = useRef(false);
  const isEnrichmentActiveRef = useRef(false);
  const lastFrameTimeRef = useRef(0);
  const frameCountRef = useRef(0);
  const performanceRef = useRef({ fps: 60, frameTime: 16.67 });
  const targetFPS = 30; // Target 30fps for smoother, less CPU-intensive animation
  const frameInterval = 1000 / targetFPS;
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || !containerRef.current) {
      console.log('[NeuralPinField] Not mounted or container missing');
      return;
    }

    console.log('[NeuralPinField] Initializing WebGL background...');
    const container = containerRef.current;
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(0x000000, 0.0004); // Subtle fog for depth
    sceneRef.current = scene;

    // Camera positioned for top-down view
    const camera = new THREE.PerspectiveCamera(
      60,
      width / height,
      0.1,
      1000
    );
    // Position camera directly above the pin field for top-down view
    camera.position.set(0, 200, 0); // High above, no Z offset
    camera.lookAt(0, 0, 0); // Look straight down at center
    camera.rotation.x = -Math.PI / 2; // Rotate 90 degrees to look straight down
    camera.rotation.y = 0;
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 1);
    renderer.domElement.style.position = 'fixed';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.zIndex = '0';
    renderer.domElement.style.pointerEvents = 'none';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting for depth illusion - subtle and refined
    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambientLight);

    // Primary directional light - creates depth through shading
    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.7);
    directionalLight1.position.set(50, 50, 50);
    directionalLight1.castShadow = false;
    scene.add(directionalLight1);

    // Secondary directional light - fills shadows
    const directionalLight2 = new THREE.DirectionalLight(0x666666, 0.3);
    directionalLight2.position.set(-50, -50, 50);
    scene.add(directionalLight2);

    // Very subtle red accent light for BrainScraper branding
    const accentLight = new THREE.PointLight(0xff5757, 0.15, 200);
    accentLight.position.set(0, 0, 100);
    scene.add(accentLight);

    // Pin geometry - very thin, subtle pins for neural field effect
    // Height represents the pin extending from the base plane
    const pinGeometry = new THREE.BoxGeometry(0.12, 1.5, 0.12);
    
    // Pin material - subtle, refined appearance
    // Very subtle so pins blend into background but remain visible
    const pinMaterial = new THREE.MeshPhongMaterial({
      color: 0x252525, // Subtle dark graphite
      emissive: 0x0a0a0a, // Very subtle self-illumination
      specular: 0x404040, // Subtle metallic highlights
      shininess: 40,
      flatShading: false,
    });

    // Grid configuration - optimized for performance
    // Adaptive grid size based on device capabilities
    const getOptimalGridSize = (): number => {
      const isHighPerf = navigator.hardwareConcurrency && navigator.hardwareConcurrency >= 8;
      const hasHighMemory = (navigator as any).deviceMemory && (navigator as any).deviceMemory >= 8;
      // Reduce grid size on lower-end devices
      if (!isHighPerf && !hasHighMemory) return 70; // 70x70 = 4900 pins
      return 90; // 90x90 = 8100 pins
    };
    
    const gridSize = getOptimalGridSize();
    const spacing = 1.0; // Optimal spacing for 3D depth perception
    const totalPins = gridSize * gridSize;

    // Create instanced mesh for performance
    const pins = new THREE.InstancedMesh(pinGeometry, pinMaterial, totalPins);
    pins.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    pinsRef.current = pins;

    // Initialize pin positions - reuse single matrix for efficiency
    const baseMatrix = new THREE.Matrix4();
    const positions = new Float32Array(totalPins * 3);
    let index = 0;

    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        const x = (i - gridSize / 2) * spacing;
        const z = (j - gridSize / 2) * spacing;
        const y = 0;

        positions[index * 3] = x;
        positions[index * 3 + 1] = y;
        positions[index * 3 + 2] = z;

        baseMatrix.makeTranslation(x, y, z);
        pins.setMatrixAt(index, baseMatrix);
        index++;
      }
    }

    pins.instanceMatrix.needsUpdate = true;
    scene.add(pins);
    
    console.log('[NeuralPinField] Scene initialized:', {
      pins: totalPins,
      gridSize,
      cameraPosition: camera.position,
      lights: scene.children.filter(c => c instanceof THREE.Light).length
    });

    // Neural motion functions - optimized with cached calculations
    // Pre-compute constants to avoid repeated calculations
    const NOISE_SCALE = 0.08;
    const WAVE_SCALE = 0.4;
    const INTERACTION_MAX_DIST = 15;
    const INTERACTION_MAX_DIST_SQ = INTERACTION_MAX_DIST * INTERACTION_MAX_DIST;
    
    // Multi-octave Perlin-like noise using sine waves for smooth, low-frequency motion
    const noise = (x: number, y: number, t: number): number => {
      // Very slow, neural undulation - represents "background thought"
      // Optimized: use fewer calculations when enrichment is active
      const scale = isEnrichmentActiveRef.current ? 0.5 : 1.0;
      const n1 = Math.sin(x * NOISE_SCALE + t * 0.25) * 0.4 * scale;
      const n2 = Math.sin(y * NOISE_SCALE + t * 0.2) * 0.4 * scale;
      const n3 = Math.sin((x + y) * 0.12 + t * 0.15) * 0.3 * scale;
      return (n1 + n2 + n3) / 3; // Reduced from 4 to 3 calculations
    };

    const wave = (x: number, y: number, t: number): number => {
      // Traveling radial waves - optimized with distance squared
      const distSq = x * x + y * y;
      const dist = Math.sqrt(distSq);
      // Skip wave calculations when enrichment is active
      if (isEnrichmentActiveRef.current) return 0;
      const wave1 = Math.sin(dist * WAVE_SCALE - t * 1.5) * 0.25;
      const wave2 = Math.sin(dist * 0.25 - t * 1.2) * 0.15;
      return (wave1 + wave2) / 2; // Reduced from 3 to 2 waves
    };

    const interaction = (x: number, y: number, mx: number, my: number): number => {
      // Cursor proximity effect - optimized with distance squared
      const dx = x - mx;
      const dy = y - my;
      const distSq = dx * dx + dy * dy;
      // Early exit if too far
      if (distSq > INTERACTION_MAX_DIST_SQ) return 0;
      // Skip interaction when enrichment is active
      if (isEnrichmentActiveRef.current) return 0;
      const dist = Math.sqrt(distSq);
      const falloff = Math.exp(-(distSq) / 25); // Use distSq for faster calculation
      return falloff * -0.6; // Depress pins near cursor
    };

    // Form focus detection - reduce motion during input
    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        isFormFocusedRef.current = true;
      }
    };
    const handleBlur = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        // Check if focus moved to another form element
        setTimeout(() => {
          const activeElement = document.activeElement;
          if (!activeElement || 
              (activeElement.tagName !== 'INPUT' && 
               activeElement.tagName !== 'TEXTAREA' && 
               activeElement.tagName !== 'SELECT')) {
            isFormFocusedRef.current = false;
          }
        }, 10);
      }
    };

    // Use event delegation for dynamic form elements
    document.addEventListener('focusin', handleFocus);
    document.addEventListener('focusout', handleBlur);

    // Detect enrichment activity - monitor for enrichment-related DOM changes and network activity
    const detectEnrichmentActivity = () => {
      try {
        // Check for enrichment progress indicators, modals, or active API calls
        const progressModals = document.querySelectorAll(
          '[class*="progress"]:not([class*="hidden"]), ' +
          '[class*="enrichment"]:not([class*="hidden"]), ' +
          '[class*="enrich"]:not([class*="hidden"])'
        );
        const loadingIndicators = document.querySelectorAll(
          '[class*="loading"]:not([class*="hidden"]), ' +
          '[class*="spinner"]:not([class*="hidden"])'
        );
        const isEnriching = progressModals.length > 0 || loadingIndicators.length > 0;
        
        // Check for network activity - recent API calls to enrichment endpoints
        const recentEntries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
        const now = Date.now();
        const hasActiveRequests = recentEntries.some(entry => {
          const isEnrichmentAPI = entry.name.includes('/api/') && 
            (entry.name.includes('enrich') || entry.name.includes('scrape') || entry.name.includes('job'));
          const isRecent = now - entry.responseEnd < 3000; // 3 second window
          return isEnrichmentAPI && isRecent;
        });
        
        // Check localStorage for enrichment job status
        let hasActiveJob = false;
        try {
          const jobStatus = localStorage.getItem('enrichmentJobStatus');
          if (jobStatus) {
            const job = JSON.parse(jobStatus);
            hasActiveJob = job.status === 'running' || job.status === 'pending';
          }
        } catch (e) {
          // Ignore localStorage errors
        }
        
        isEnrichmentActiveRef.current = isEnriching || hasActiveRequests || hasActiveJob;
      } catch (e) {
        // Fallback: assume not enriching if detection fails
        isEnrichmentActiveRef.current = false;
      }
    };

    // Monitor enrichment activity periodically
    const enrichmentCheckInterval = setInterval(detectEnrichmentActivity, 500);

    // Performance monitoring
    const updatePerformanceMetrics = (currentTime: number) => {
      const deltaTime = currentTime - lastFrameTimeRef.current;
      lastFrameTimeRef.current = currentTime;
      
      frameCountRef.current++;
      if (frameCountRef.current % 30 === 0) { // Update every 30 frames
        performanceRef.current.fps = Math.round(1000 / deltaTime);
        performanceRef.current.frameTime = deltaTime;
      }
    };

    // Initialize lastFrameTime for first frame
    lastFrameTimeRef.current = performance.now();

    // Animation loop with frame rate limiting and performance optimization
    const animate = (currentTime: number = performance.now()) => {
      if (!isActiveRef.current) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      // Calculate delta time BEFORE updating lastFrameTime
      const deltaTime = currentTime - lastFrameTimeRef.current;
      
      // Skip if delta is too small (prevent division issues)
      if (deltaTime <= 0) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      // Update performance metrics (this updates lastFrameTimeRef)
      updatePerformanceMetrics(currentTime);

      // Pause or significantly reduce work when enrichment is active
      if (isEnrichmentActiveRef.current) {
        // Only update every 3rd frame when enrichment is active
        if (frameCountRef.current % 3 !== 0) {
          animationFrameRef.current = requestAnimationFrame(animate);
          return;
        }
      }

      // Smooth, consistent time step - use delta time for frame-rate independent animation
      const baseTimeStep = 0.008; // Slightly slower for smoother motion
      let timeStep = baseTimeStep;
      if (isFormFocusedRef.current) timeStep = baseTimeStep * 0.3;
      if (isEnrichmentActiveRef.current) timeStep = baseTimeStep * 0.1; // Very slow during enrichment
      
      // Scale time step by actual frame delta for smooth animation
      const normalizedDelta = Math.min(deltaTime / 16.67, 2); // Cap at 2x normal speed
      timeRef.current += timeStep * normalizedDelta;

      // Update pin heights - optimized batch processing with early exits
      const mouseX = (mouseRef.current.x / width) * gridSize * spacing - (gridSize * spacing) / 2;
      const mouseY = (mouseRef.current.y / height) * gridSize * spacing - (gridSize * spacing) / 2;

      // Smooth pin updates - always update all pins for consistent animation
      const updatePins = () => {
        // Reuse single matrix for all updates
        const updateMatrix = baseMatrix;
        
        // Only skip pins during heavy enrichment activity
        const stepSize = isEnrichmentActiveRef.current ? 2 : 1;
        
        for (let i = 0; i < gridSize; i += stepSize) {
          for (let j = 0; j < gridSize; j += stepSize) {
            const x = (i - gridSize / 2) * spacing;
            const z = (j - gridSize / 2) * spacing;

            // Neural motion formula: base + waves + interaction
            const baseNoise = noise(x, z, timeRef.current) * 0.4; // Reduced amplitude for subtler movement
            const waveMotion = wave(x, z, timeRef.current) * 0.2; // Reduced for smoother motion
            // Reduce interaction effect when form is focused or enrichment active
            const interactionMultiplier = (isFormFocusedRef.current || isEnrichmentActiveRef.current) ? 0.05 : 0.3;
            const interactionEffect = interaction(x, z, mouseX, mouseY) * interactionMultiplier;

            let height = baseNoise + waveMotion + interactionEffect;
            // Subtle height range - pins extend upward from base
            height = Math.max(-0.8, Math.min(0.8, height));

            // Update instance matrix - pin extends from base plane
            // The pin geometry is centered, so we position it at base + height/2
            const instanceIndex = i * gridSize + j;
            const pinY = height; // Pin extends from base (y=0) by this amount
            updateMatrix.makeTranslation(x, pinY, z);
            pins.setMatrixAt(instanceIndex, updateMatrix);
            
            // If skipping pins during enrichment, copy to adjacent for smoother appearance
            if (stepSize > 1) {
              if (i + 1 < gridSize) {
                const nextIndex = (i + 1) * gridSize + j;
                pins.setMatrixAt(nextIndex, updateMatrix);
              }
              if (j + 1 < gridSize) {
                const nextIndex = i * gridSize + (j + 1);
                pins.setMatrixAt(nextIndex, updateMatrix);
              }
              if (i + 1 < gridSize && j + 1 < gridSize) {
                const nextIndex = (i + 1) * gridSize + (j + 1);
                pins.setMatrixAt(nextIndex, updateMatrix);
              }
            }
          }
        }
        
        pins.instanceMatrix.needsUpdate = true;
      };

      // Always update pins synchronously for smooth animation
      // requestIdleCallback causes visual glitches and lag
      updatePins();

      // Subtle camera parallax based on mouse (disabled when form focused or enrichment active)
      // For top-down view, only move X and Z (not Y which is height)
      if (camera && !isFormFocusedRef.current && !isEnrichmentActiveRef.current) {
        const parallaxX = (mouseRef.current.x / width - 0.5) * 2;
        const parallaxZ = (mouseRef.current.y / height - 0.5) * 2;
        camera.position.x = parallaxX;
        camera.position.z = parallaxZ;
        camera.lookAt(parallaxX, 0, parallaxZ);
      } else if (camera) {
        // Reset to center when form is focused or enrichment active
        camera.position.x = 0;
        camera.position.y = 200; // Maintain top-down height
        camera.position.z = 0;
        camera.lookAt(0, 0, 0);
      }

      renderer.render(scene, camera);
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    // Log first frame render
    console.log('[NeuralPinField] Starting animation loop');

    // Mouse tracking
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
    };

    window.addEventListener('mousemove', handleMouseMove);

    // Handle visibility change
    const handleVisibilityChange = () => {
      isActiveRef.current = !document.hidden;
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Handle resize
    const handleResize = () => {
      const newWidth = window.innerWidth;
      const newHeight = window.innerHeight;

      if (camera) {
        camera.aspect = newWidth / newHeight;
        camera.updateProjectionMatrix();
      }

      if (renderer) {
        renderer.setSize(newWidth, newHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      }
    };

    window.addEventListener('resize', handleResize);

    // Start animation
    animate();

    // Cleanup
    return () => {
      clearInterval(enrichmentCheckInterval);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('focusin', handleFocus);
      document.removeEventListener('focusout', handleBlur);

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      if (renderer) {
        renderer.dispose();
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      }

      if (pins) {
        pins.dispose();
      }

      if (pinGeometry) pinGeometry.dispose();
      if (pinMaterial) pinMaterial.dispose();
    };
  }, [isMounted]);

  return (
    <div 
      ref={containerRef} 
      className="fixed inset-0 pointer-events-none z-0"
      style={{ 
        backgroundColor: '#000000',
        isolation: 'isolate', // Create new stacking context to prevent z-index conflicts
      }}
    />
  );
}
