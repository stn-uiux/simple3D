import React, { useState, useCallback, useRef, useMemo, useEffect, useLayoutEffect, Suspense, forwardRef, useImperativeHandle } from 'react';
import { Canvas, useThree, useFrame, ThreeEvent } from '@react-three/fiber';
import {
  OrbitControls,
  ContactShadows,
  Environment,
  PivotControls,
  Bounds,
  GizmoHelper,
  GizmoViewport,
  useHelper,
  Billboard,
  Html,
  AccumulativeShadows,
  RandomizedLight
} from '@react-three/drei';
import { Furniture } from './Furniture';
import { EffectComposer, Bloom, Vignette, SMAA, N8AO } from '@react-three/postprocessing';
import { FurnitureItem, AppState } from '../types';
import { ACCENT_400, accentRgba } from '../theme';

import { selectionMeshesRef } from '../selectionRegistry';
import * as THREE from 'three';
import { Sun, Zap, Circle, Lightbulb, Lock, Unlock, RefreshCw, ChevronLeft } from 'lucide-react';
import { useModelLibrary } from './AssetLibrary';

interface SceneProps {
  state: AppState;
  onSelect: (id: string | null, multi?: boolean, isGroupSelect?: boolean) => void;
  onBoxSelect: (ids: string[], isFinal?: boolean) => void;
  onSelectSub: (subId: string | null) => void;
  previewSelectedIds: string[];
  selectedSubId: string | null;
  onUpdate: (id: string, updates: Partial<FurnitureItem>, undoable?: boolean, isGroupUpdate?: boolean) => void;
  onUpdateLight: (id: string, updates: Partial<any>, undoable?: boolean) => void;
  onUpdateItems: (updatesMap: { [id: string]: Partial<FurnitureItem> }, undoable?: boolean) => void;
  onUpdateLights: (updatesMap: { [id: string]: Partial<any> }, undoable?: boolean) => void;
  onZoomChange: (percent: number) => void;
  fitSignal: number;
  zoomRef: React.RefObject<HTMLDivElement>;
  panRef: React.RefObject<HTMLDivElement>;
  shiftPressed: boolean;
  ctrlPressed: boolean;
  showGizmos: boolean;
  onUpdateState: (updates: Partial<AppState>) => void;
  viewCenterRef?: React.MutableRefObject<[number, number, number]>;
  onFitToSelection: (id?: string) => void;
  fitTargetId?: string | null;
  onFitFinish?: () => void;
}

const BackgroundController = ({ state }: { state: AppState }) => {
  const { scene } = useThree();

  useLayoutEffect(() => {
    if (!state.showBackgroundColor) {
      scene.background = null;
      return;
    }

    // 1. Handle Solid Color
    if (state.backgroundType === 'solid' || !state.backgroundType) {
      const colorStr = state.backgroundColor?.trim() || '#ffffff';
      try {
        // If it's a gradient string in solid mode (fallback), try to parse first color
        if (colorStr.includes('gradient')) {
          const firstColor = colorStr.match(/#[a-fA-F0-9]{3,6}|rgba?\([^)]+\)/i)?.[0] || '#ffffff';
          scene.background = new THREE.Color(firstColor);
        } else {
          scene.background = new THREE.Color(colorStr);
        }
      } catch (e) {
        scene.background = new THREE.Color('#0f0f0f');
      }
      return;
    }

    // 2. Handle Gradients (Linear / Radial)
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    if (ctx && state.backgroundStops && state.backgroundStops.length > 0) {
      let gradient;

      if (state.backgroundType === 'linear') {
        // Calculate gradient line based on angle
        const angleRad = ((state.backgroundAngle || 0) - 90) * (Math.PI / 180);
        // We want the gradient to cover the square canvas
        const centerX = 512;
        const centerY = 512;
        const length = 512 * Math.sqrt(2); // Distance to corners

        const x1 = centerX + Math.cos(angleRad + Math.PI) * length;
        const y1 = centerY + Math.sin(angleRad + Math.PI) * length;
        const x2 = centerX + Math.cos(angleRad) * length;
        const y2 = centerY + Math.sin(angleRad) * length;

        gradient = ctx.createLinearGradient(x1, y1, x2, y2);
      } else {
        // Radial Gradient
        gradient = ctx.createRadialGradient(512, 512, 0, 512, 512, 724); // 724 is approx dist to corner
      }

      // Add stops (sorted by offset)
      const sortedStops = [...state.backgroundStops].sort((a, b) => a.offset - b.offset);
      sortedStops.forEach(stop => {
        try {
          gradient.addColorStop(Math.max(0, Math.min(1, stop.offset / 100)), stop.color);
        } catch (e) {
          console.warn('Invalid color stop:', stop.color);
        }
      });

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 1024, 1024);

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      scene.background = tex;
      return;
    }
  }, [
    state.showBackgroundColor,
    state.backgroundColor,
    state.backgroundType,
    state.backgroundStops,
    state.backgroundAngle,
    scene
  ]);

  return (
    <>
      {state.showBackgroundColor && state.backgroundType === 'image' && state.backgroundImage && (
        <ImageBackground url={state.backgroundImage} />
      )}
    </>
  );
};

const ImageBackground = ({ url }: { url: string }) => {
  const { scene } = useThree();

  useEffect(() => {
    if (!url) return;
    const loader = new THREE.TextureLoader();
    loader.load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      scene.background = tex;
    });

    return () => {
      // Don't null it out immediately if we're switching to another image
      // but if the component unmounts, we should reset if needed.
      // However, BackgroundController handles the nulling if showBackgroundColor is false.
    };
  }, [url, scene]);

  return null;
};

// selectionMeshesRef imported from ../selectionRegistry



const CameraReporter = ({ onUpdate, enabled }: { onUpdate: (updates: Partial<AppState>) => void, enabled: boolean }) => {
  const { camera, controls } = useThree();
  const lastUpdate = useRef(0);

  useFrame(() => {
    if (!enabled || !controls) return;
    const now = performance.now();
    if (now - lastUpdate.current < 200) return; // Throttle to 5fps for performance
    lastUpdate.current = now;

    const pos = camera.position.toArray() as [number, number, number];
    const target = (controls as any).target.toArray() as [number, number, number];

    onUpdate({
      liveCameraSettings: { position: pos, target: target }
    });
  });

  return null;
};

function FitHandler({ trigger, objects, targetId, onFinish, state }: { trigger: number, objects: FurnitureItem[], targetId?: string | null, onFinish?: () => void, state: AppState }) {
  const { camera, controls, scene } = useThree();
  const lastTrigger = useRef<number>(0);
  const animRef = useRef<number>(0);
  const objectsRef = useRef(objects);
  useEffect(() => { objectsRef.current = objects; }, [objects]);

  useEffect(() => {
    if (trigger <= 0 || trigger === lastTrigger.current) return;
    lastTrigger.current = trigger;

    const tryFit = () => {
      const box = new THREE.Box3();
      let foundCount = 0;
      const targetIds = targetId ? [targetId] : objectsRef.current.map(o => o.id);

      scene.traverse(obj => {
        if (obj.userData?.isFurniture) {
          if (targetIds.length === 0 || targetIds.includes(obj.userData.id)) {
            // Check if the object has children with geometry
            let hasMesh = false;
            obj.traverse(child => { if ((child as any).isMesh) hasMesh = true; });

            if (hasMesh) {
              box.expandByObject(obj);
              foundCount++;
            }
          }
        }
      });

      const expectedCount = targetIds.length;
      if (foundCount === 0 || (expectedCount > 0 && foundCount < expectedCount)) return null;

      // Ensure box is not empty and has actual dimensions
      const size = new THREE.Vector3();
      box.getSize(size);
      if (size.length() < 0.1) return null;

      return box;
    };

    let box = tryFit();

    // If not found, try again once more after a frame (React-three-fiber sync)
    if (!box) {
      const checkInterval = setInterval(() => {
        const retryBox = tryFit();
        if (retryBox) {
          clearInterval(checkInterval);
          performFit(retryBox);
        }
      }, 50);
      setTimeout(() => clearInterval(checkInterval), 500); // Give up after 500ms
      return;
    }

    performFit(box);

    function performFit(box: THREE.Box3) {

      const center = new THREE.Vector3();
      box.getCenter(center);

      const targetPos = new THREE.Vector3();
      const endTarget = new THREE.Vector3();
      const startPos = camera.position.clone();
      let startTarget = new THREE.Vector3();

      if (state.fitMode === 'custom' && !targetId && state.customFitSettings) {
        // Use custom settings for "Global Fit"
        const { position, target } = state.customFitSettings;
        targetPos.set(...position);
        endTarget.set(...target);
      } else {
        // Auto Calculation Logic
        const aspect = (camera as THREE.PerspectiveCamera).aspect;

        const size = new THREE.Vector3();
        box.getSize(size);
        const radius = size.length() * 0.5 || 1;

        const vFov = (camera as THREE.PerspectiveCamera).fov * THREE.MathUtils.DEG2RAD;
        const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);

        const distHeight = radius / Math.tan(vFov / 2);
        const distWidth = radius / Math.tan(hFov / 2);

        // Dynamic framing: Small objects (t=0) get more margin and less vertical offset
        // Large objects (t=1) get tighter margin and more vertical offset
        const t = THREE.MathUtils.clamp((radius - 1) / 15, 0, 1);

        const maxMult = 1.25;
        const minMult = 0.83;
        const dynamicMultiplier = THREE.MathUtils.lerp(maxMult, minMult, t);

        let cameraDistance = Math.max(distHeight, distWidth) * dynamicMultiplier;

        // Zoom adjustments based on aspect ratio (XZ plane)
        const aspectXZ = size.x / Math.max(0.1, size.z);
        let zoomFactor = 1.0;

        if (aspectXZ > 1.2) zoomFactor = THREE.MathUtils.lerp(0.85, 0.85, THREE.MathUtils.clamp((aspectXZ - 1.0) / 2.0, 0, 1));

        cameraDistance *= zoomFactor;
        cameraDistance = THREE.MathUtils.clamp(cameraDistance, 10, 800);

        targetPos.set(
          center.x - cameraDistance * 0.53,
          center.y + cameraDistance * 0.66,
          center.z + cameraDistance * 0.53
        );

        endTarget.copy(center);

        // Dynamic vertical offset: Small objects (0.15), Large objects (0.25)
        const dynamicVOffsetMult = THREE.MathUtils.lerp(0.15, 0.25, t);
        const vOffset = (Math.tan(vFov / 2) * cameraDistance * 2) * dynamicVOffsetMult;
        endTarget.y -= vOffset;

        const viewWidth = (Math.tan(hFov / 2) * cameraDistance * 2);
        const viewDir = new THREE.Vector3().subVectors(endTarget, targetPos).normalize();
        const right = new THREE.Vector3().crossVectors(viewDir, new THREE.Vector3(0, 1, 0)).normalize();

        // Dynamic Offsets based on Aspect Ratio (XZ plane)
        let hShiftMult = 0; // Perfectly centered for square (1.0)
        let vShiftMult = 0.07; // 7% Upwards for square (1.0)

        if (aspectXZ > 1.0) {
          hShiftMult = (aspectXZ - 1.0) * -0.04;
          vShiftMult = 0.07 + (aspectXZ - 1.0) * 0.05;
        }

        hShiftMult = THREE.MathUtils.clamp(hShiftMult, -0.1, 0.25);
        vShiftMult = THREE.MathUtils.clamp(vShiftMult, -0.1, 0.1);

        const horizontalShift = right.clone().multiplyScalar(viewWidth * hShiftMult);
        targetPos.add(horizontalShift);
        endTarget.add(horizontalShift);

        const viewHeight = (Math.tan(vFov / 2) * cameraDistance * 2);
        const verticalShift = new THREE.Vector3(0, viewHeight * vShiftMult, 0);
        targetPos.add(verticalShift);
        endTarget.add(verticalShift);
      }

      if (controls) {
        startTarget.copy((controls as any).target);
      }

      const duration = 800; // Smoother, slightly slower transition
      const startTime = performance.now();

      function easeOutQuart(t: number) {
        return 1 - Math.pow(1 - t, 4);
      }

      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (controls) {
        const ctrl = controls as any;
        ctrl.autoRotate = false;
        ctrl.enabled = false;
        // ARC-FIX: Disable damping during transition to kill all inertia
        ctrl._hadDamping = ctrl.enableDamping;
        ctrl.enableDamping = false;
        ctrl.update();
      }

      function animateFrame(time: number) {
        const elapsed = time - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const ease = easeOutQuart(progress);

        camera.position.lerpVectors(startPos, targetPos, ease);

        if (controls) {
          (controls as any).target.lerpVectors(startTarget, endTarget, ease);
          (controls as any).update();
        } else {
          camera.lookAt(endTarget);
        }

        if (progress < 1) {
          animRef.current = requestAnimationFrame(animateFrame);
        } else {
          if (controls) {
            const ctrl = controls as any;
            ctrl.enabled = true;
            // ARC-FIX: Restore damping and force one last update to lock the position
            ctrl.enableDamping = ctrl._hadDamping ?? true;
            ctrl.update();
          }
          if (onFinish) onFinish();
        }
      }

      animRef.current = requestAnimationFrame(animateFrame);
    }

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (controls) (controls as any).enabled = true;
    };
  }, [trigger, camera, controls]);

  return null;
}

function OverlayControlsLogic({ zoomRef, panRef }: { zoomRef: React.RefObject<HTMLDivElement>, panRef: React.RefObject<HTMLDivElement> }) {
  const { camera, controls } = useThree();

  useEffect(() => {
    const zoomEl = zoomRef.current;
    const panEl = panRef.current;
    if (!zoomEl || !panEl || !controls) return;

    let isZooming = false;
    let isPanning = false;
    let lastY = 0;
    let lastX = 0;

    const onZoomDown = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      zoomEl.setPointerCapture(e.pointerId);
      isZooming = true;
      lastY = e.clientY;
    };

    const onPanDown = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      panEl.setPointerCapture(e.pointerId);
      isPanning = true;
      lastY = e.clientY;
      lastX = e.clientX;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isZooming && !isPanning) return;
      e.preventDefault();

      const dist = camera.position.distanceTo((controls as any).target);

      if (isZooming) {
        const delta = e.clientY - lastY;
        lastY = e.clientY;
        const dir = new THREE.Vector3().subVectors((controls as any).target, camera.position).normalize();
        const distFactor = Math.max(0.2, dist * 0.03);
        const moveAmount = -delta * distFactor * 0.05;

        if (delta < 0 && dist < 0.3) {
        } else {
          camera.position.addScaledVector(dir, moveAmount);
        }
        (controls as any).update();
      }

      if (isPanning) {
        const deltaX = e.clientX - lastX;
        const deltaY = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;

        const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
        const distFactor = Math.max(0.005, dist * 0.001);

        const panOffset = new THREE.Vector3()
          .addScaledVector(camRight, -deltaX * distFactor)
          .addScaledVector(camUp, deltaY * distFactor);

        // ARC-FIX: Safety check for NaNs
        if (isNaN(panOffset.x) || isNaN(panOffset.y) || isNaN(panOffset.z)) return;

        camera.position.add(panOffset);
        (controls as any).target.add(panOffset);
        (controls as any).update();
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (isZooming) {
        isZooming = false;
        zoomEl.releasePointerCapture(e.pointerId);
      }
      if (isPanning) {
        isPanning = false;
        panEl.releasePointerCapture(e.pointerId);
      }
    };

    zoomEl.addEventListener('pointerdown', onZoomDown);
    panEl.addEventListener('pointerdown', onPanDown);
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      zoomEl.removeEventListener('pointerdown', onZoomDown);
      panEl.removeEventListener('pointerdown', onPanDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [camera, controls, zoomRef, panRef]);

  return null;
}

interface RealTimeBoxSelectionProps {
  ctrlPressed: boolean;
  selectionBox: { start: [number, number], end: [number, number] } | null;
  onBoxSelect: (ids: string[], isFinal: boolean) => void;
  currentSelectedIds: string[];
  lights: any[];
}

const RealTimeBoxSelection: React.FC<RealTimeBoxSelectionProps> = ({
  ctrlPressed, selectionBox, onBoxSelect, currentSelectedIds, lights
}) => {
  const { camera, gl } = useThree();
  const meshes = selectionMeshesRef.current;

  useEffect(() => {
    if (!selectionBox) return;

    const start = new THREE.Vector2(
      (selectionBox.start[0] / gl.domElement.clientWidth) * 2 - 1,
      -(selectionBox.start[1] / gl.domElement.clientHeight) * 2 + 1
    );
    const end = new THREE.Vector2(
      (selectionBox.end[0] / gl.domElement.clientWidth) * 2 - 1,
      -(selectionBox.end[1] / gl.domElement.clientHeight) * 2 + 1
    );

    const min = new THREE.Vector2(Math.min(start.x, end.x), Math.min(start.y, end.y));
    const max = new THREE.Vector2(Math.max(start.x, end.x), Math.max(start.y, end.y));

    const selectedIdx: string[] = [];
    Object.entries(meshes).forEach(([id, mesh]) => {
      if (!mesh || mesh.userData?.locked) return; // Skip locked objects (Walls, etc.)

      mesh.updateWorldMatrix(true, false);
      let box3 = new THREE.Box3();
      if (mesh.geometry) {
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        box3.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
      } else {
        box3.setFromCenterAndSize(new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld), new THREE.Vector3(1, 1, 1));
      }

      // Check if Object Center is within the screen box
      const center = new THREE.Vector3();
      box3.getCenter(center);
      center.project(camera);

      const isCenterInBox = center.x >= min.x && center.x <= max.x && center.y >= min.y && center.y <= max.y;

      // Check for AABB intersection but only for reasonably sized selection boxes
      const corners = [
        new THREE.Vector3(box3.min.x, box3.min.y, box3.min.z),
        new THREE.Vector3(box3.min.x, box3.min.y, box3.max.z),
        new THREE.Vector3(box3.min.x, box3.max.y, box3.min.z),
        new THREE.Vector3(box3.min.x, box3.max.y, box3.max.z),
        new THREE.Vector3(box3.max.x, box3.min.y, box3.min.z),
        new THREE.Vector3(box3.max.x, box3.min.y, box3.max.z),
        new THREE.Vector3(box3.max.x, box3.max.y, box3.min.z),
        new THREE.Vector3(box3.max.x, box3.max.y, box3.max.z),
      ];

      let objMinX = Infinity, objMaxX = -Infinity, objMinY = Infinity, objMaxY = -Infinity;
      corners.forEach(c => {
        c.project(camera);
        objMinX = Math.min(objMinX, c.x);
        objMaxX = Math.max(objMaxX, c.x);
        objMinY = Math.min(objMinY, c.y);
        objMaxY = Math.max(objMaxY, c.y);
      });

      const doesIntersect = !(objMaxX < min.x || objMinX > max.x || objMaxY < min.y || objMinY > max.y);

      // Final decision:
      // If it's a huge object (size on screen covers major area), only select if center is inside.
      // Small objects can be captured by touching any part.
      const objWidth = objMaxX - objMinX;
      const objHeight = objMaxY - objMinY;
      const isHuge = objWidth > 1.0 || objHeight > 1.0;

      if (isHuge ? isCenterInBox : doesIntersect) {
        selectedIdx.push(id);
      }
    });

    // Also check lights (skip locked ones if they ever exist)
    lights.forEach(light => {
      if (light.type === 'ambient' || light.locked) return;
      const v = new THREE.Vector3(...(light.position || [0, 0, 0]));
      v.project(camera);
      if (v.x >= min.x && v.x <= max.x && v.y >= min.y && v.y <= max.y) {
        selectedIdx.push(light.id);
      }
    });

    if (ctrlPressed) {
      // XOR Logic (Toggle): 
      // 1. Items in initial AND box => Remove
      // 2. Items in box ONLY => Add
      // 3. Items in initial ONLY => Keep
      const initialIds = new Set(currentSelectedIds);
      const boxIds = new Set(selectedIdx);

      const nextIds = new Set(initialIds);
      boxIds.forEach(id => {
        if (nextIds.has(id)) nextIds.delete(id);
        else nextIds.add(id);
      });

      onBoxSelect(Array.from(nextIds), false);
    } else {
      // Normal Box Selection (Reset to what's in the box)
      onBoxSelect(selectedIdx, false);
    }
  }, [selectionBox, meshes, camera, gl, ctrlPressed, lights]);

  return null;
};

function PointLightDistanceGizmo({
  distance,
  updateLight,
  setIsDragging,
  isSelected,
  color
}: {
  distance: number;
  updateLight: (updates: Partial<any>, undoable?: boolean) => void;
  setIsDragging: (dragging: boolean) => void;
  isSelected: boolean;
  color: string;
}) {
  const { camera, raycaster, gl } = useThree();
  const groupRef = useRef<THREE.Group>(null!);
  const activeHandle = useRef<boolean>(false);
  const dragPlane = useRef<THREE.Plane>(new THREE.Plane());
  const initialOffset = useRef<number>(0);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!activeHandle.current || !groupRef.current) return;

      const rect = gl.domElement.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
      const inverseMatrix = groupRef.current.matrixWorld.clone().invert();
      const localRay = raycaster.ray.clone().applyMatrix4(inverseMatrix);

      const intersectPoint = new THREE.Vector3();
      if (localRay.intersectPlane(dragPlane.current, intersectPoint)) {
        const newDist = Math.max(0.1, intersectPoint.length() - initialOffset.current);
        updateLight({ distance: newDist });
      }
    };

    const onUp = (e: PointerEvent) => {
      if (!activeHandle.current) return;
      activeHandle.current = false;
      setIsDragging(false);
      try {
        gl.domElement.releasePointerCapture(e.pointerId);
      } catch (e) { }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [gl]);

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (!isSelected) return;
    e.stopPropagation();
    gl.domElement.setPointerCapture(e.pointerId);

    const rect = gl.domElement.getBoundingClientRect();
    const x = ((e.nativeEvent.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.nativeEvent.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    const inverseMatrix = groupRef.current.matrixWorld.clone().invert();
    const localRay = raycaster.ray.clone().applyMatrix4(inverseMatrix);
    const localCamPos = camera.position.clone().applyMatrix4(inverseMatrix);

    dragPlane.current.setFromNormalAndCoplanarPoint(
      localCamPos.clone().normalize(),
      new THREE.Vector3(0, 0, 0)
    );

    const intersect = new THREE.Vector3();
    if (localRay.intersectPlane(dragPlane.current, intersect)) {
      initialOffset.current = intersect.length() - distance;
    } else {
      initialOffset.current = 0;
    }

    activeHandle.current = true;
    updateLight({}, true); // Save history
    setIsDragging(true);
  };

  const safeDistance = Math.max(0.001, distance);
  const handleSize = Math.max(0.06, safeDistance * 0.04);

  const torusArgs = useMemo(() => [safeDistance, 0.005, 8, 48] as [number, number, number, number], [safeDistance]);
  const handlePositions = useMemo((): [number, number, number][] => [
    [safeDistance, 0, 0], [-safeDistance, 0, 0],
    [0, safeDistance, 0], [0, -safeDistance, 0],
    [0, 0, safeDistance], [0, 0, -safeDistance]
  ], [safeDistance]);

  return (
    <group ref={groupRef}>
      <group>
        <mesh><torusGeometry args={torusArgs} /><meshBasicMaterial color={color} transparent opacity={isSelected ? 0.3 : 0.1} depthTest={false} /></mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={torusArgs} /><meshBasicMaterial color={color} transparent opacity={isSelected ? 0.3 : 0.1} depthTest={false} /></mesh>
        <mesh rotation={[0, Math.PI / 2, 0]}><torusGeometry args={torusArgs} /><meshBasicMaterial color={color} transparent opacity={isSelected ? 0.3 : 0.1} depthTest={false} /></mesh>
      </group>
      {isSelected && handlePositions.map((pos, i) => (
        <mesh key={i} position={pos} onPointerDown={onPointerDown} onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'move'; }} onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}>
          <sphereGeometry args={[handleSize, 16, 16]} />
          <meshBasicMaterial color={activeHandle.current ? ACCENT_400 : "#fbbf24"} depthTest={false} />
        </mesh>
      ))}
    </group>
  );
}

function SpotLightGizmo({
  distance,
  angle,
  updateLight,
  setIsDragging,
  isSelected,
  color
}: {
  distance: number;
  angle: number;
  updateLight: (updates: Partial<any>, undoable?: boolean) => void;
  setIsDragging: (dragging: boolean) => void;
  isSelected: boolean;
  color: string;
}) {
  const { camera, raycaster, gl } = useThree();
  const groupRef = useRef<THREE.Group>(null!);
  const [handleType, setHandleType] = useState<'distance' | 'angle' | null>(null);
  const activeHandle = useRef<'distance' | 'angle' | null>(null);
  const dragPlane = useRef<THREE.Plane>(new THREE.Plane());
  const initialOffset = useRef<number>(0);

  const visualDist = (distance > 0 && !isNaN(distance)) ? distance : 10;
  const safeAngle = (angle > 0 && !isNaN(angle)) ? Math.min(angle, 1.5) : Math.PI / 3;
  const radius = visualDist * Math.tan(safeAngle);

  const lineGeometries = useMemo(() => {
    return [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2].map(rot => {
      const x = Math.cos(rot) * radius;
      const y = Math.sin(rot) * radius;
      return new Float32Array([0, 0, 0, x, y, -visualDist]);
    });
  }, [radius, visualDist]);

  const ringArgs = useMemo(() =>
    [Math.max(0.001, radius - 0.01), Math.max(0.002, radius + 0.01), 64] as [number, number, number],
    [radius]);

  const coneArgs = useMemo(() =>
    [visualDist * 0.035, visualDist * 0.08, 16] as [number, number, number],
    [visualDist]);

  const torusArgs = useMemo(() =>
    [Math.max(0.01, radius), visualDist * 0.02, 12, 64] as [number, number, number, number],
    [radius, visualDist]);

  const getLocalRay = (e: THREE.Vector2) => {
    if (!groupRef.current) return null;
    raycaster.setFromCamera(e, camera);
    const inverseMatrix = groupRef.current.matrixWorld.clone().invert();
    const rayOrigin = raycaster.ray.origin.clone().applyMatrix4(inverseMatrix);
    const rayDirection = raycaster.ray.direction.clone().transformDirection(inverseMatrix).normalize();
    return new THREE.Ray(rayOrigin, rayDirection);
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!activeHandle.current || !groupRef.current) return;

      const rect = gl.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );

      const localRay = getLocalRay(mouse);
      if (!localRay) return;

      const intersect = new THREE.Vector3();
      if (localRay.intersectPlane(dragPlane.current, intersect)) {
        if (activeHandle.current === 'distance') {
          const newVZ = intersect.z - initialOffset.current;
          updateLight({ distance: Math.max(0.1, -newVZ) });
        } else if (activeHandle.current === 'angle') {
          const newR = Math.sqrt(intersect.x * intersect.x + intersect.y * intersect.y) - initialOffset.current;
          const newAngle = Math.atan2(newR, visualDist);
          updateLight({ angle: Math.max(0.01, Math.min(newAngle, 1.5)) });
        }
      }
    };

    const onUp = (e: PointerEvent) => {
      if (!activeHandle.current) return;
      activeHandle.current = null;
      setHandleType(null);
      setIsDragging(false);
      try {
        gl.domElement.releasePointerCapture(e.pointerId);
      } catch (err) { }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [handleType, gl, visualDist, radius]);

  const onPointerDown = (e: ThreeEvent<PointerEvent>, handle: 'distance' | 'angle') => {
    if (!isSelected) return;
    e.stopPropagation();
    gl.domElement.setPointerCapture(e.pointerId);

    const rect = gl.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.nativeEvent.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.nativeEvent.clientY - rect.top) / rect.height) * 2 + 1
    );

    const localRay = getLocalRay(mouse);
    if (!localRay) return;

    const inverseMatrix = groupRef.current.matrixWorld.clone().invert();
    const localCamPos = camera.position.clone().applyMatrix4(inverseMatrix);

    if (handle === 'distance') {
      const normal = Math.abs(localCamPos.x) > Math.abs(localCamPos.y) ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      dragPlane.current.setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(0, 0, -visualDist));

      const intersect = new THREE.Vector3();
      if (localRay.intersectPlane(dragPlane.current, intersect)) {
        initialOffset.current = intersect.z - (-visualDist);
      } else {
        initialOffset.current = 0;
      }
    } else {
      dragPlane.current.set(new THREE.Vector3(0, 0, 1), visualDist);
      const intersect = new THREE.Vector3();
      if (localRay.intersectPlane(dragPlane.current, intersect)) {
        const r = Math.sqrt(intersect.x * intersect.x + intersect.y * intersect.y);
        initialOffset.current = r - radius;
      } else {
        initialOffset.current = 0;
      }
    }

    activeHandle.current = handle;
    updateLight({}, true); // Save history
    setHandleType(handle);
    setIsDragging(true);
  };

  return (
    <group ref={groupRef}>
      <mesh position={[0, 0, -visualDist / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.001, Math.max(0.001, radius), Math.max(0.001, visualDist), 48, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={isSelected ? 0.2 : 0.05} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {lineGeometries.map((pts, i) => (
        <line key={i}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" count={2} array={pts} itemSize={3} />
          </bufferGeometry>
          <lineBasicMaterial color={color} transparent opacity={isSelected ? 0.5 : 0.2} />
        </line>
      ))}

      <mesh position={[0, 0, -visualDist]}>
        <ringGeometry args={ringArgs} />
        <meshBasicMaterial color={color} side={THREE.DoubleSide} transparent opacity={isSelected ? 0.5 : 0.2} />
      </mesh>

      {isSelected && (
        <>
          {/* Distance Tip Handle */}
          <mesh
            position={[0, 0, -visualDist]}
            rotation={[-Math.PI / 2, 0, 0]}
            onPointerDown={(e) => onPointerDown(e, 'distance')}
            onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'move'; }}
            onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
          >
            <coneGeometry args={coneArgs} />
            <meshBasicMaterial color={handleType === 'distance' ? ACCENT_400 : "#fbbf24"} depthTest={false} transparent opacity={0.9} />
          </mesh>

          {/* Angle Rim Handle */}
          <mesh
            position={[0, 0, -visualDist]}
            onPointerDown={(e) => onPointerDown(e, 'angle')}
            onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'ew-resize'; }}
            onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
          >
            <torusGeometry args={torusArgs} />
            <meshBasicMaterial color={handleType === 'angle' ? ACCENT_400 : "#fbbf24"} transparent opacity={handleType === 'angle' ? 1 : 0.5} depthTest={false} />
          </mesh>
        </>
      )}
    </group>
  );
}

function LightWithHelper({
  config,
  showGizmos,
  isSelected,
  onUpdateLight,
  onSelectLight,
  setIsDragging,
  multiSelect,
  realtimeShadows
}: {
  config: any;
  showGizmos: boolean;
  isSelected: boolean;
  onUpdateLight: (id: string, updates: Partial<any>, undoable?: boolean) => void;
  onSelectLight: (id: string, multi?: boolean) => void;
  setIsDragging: (dragging: boolean) => void;
  multiSelect: boolean;
  realtimeShadows: boolean;
}) {
  const lightRef = useRef<any>(null!);
  const { scene } = useThree();

  const spotHelper = useHelper(isSelected && config.type === 'spot' ? lightRef : null, THREE.SpotLightHelper, config.color);
  const dirHelper = useHelper(isSelected && config.type === 'directional' ? lightRef : null, THREE.DirectionalLightHelper, 1, config.color);

  useLayoutEffect(() => {
    if (lightRef.current && (config.type === 'spot' || config.type === 'directional')) {
      const light = lightRef.current;
      if (!light.target) light.target = new THREE.Object3D();
      if (light.target.parent !== scene) scene.add(light.target);

      const rot = new THREE.Euler(...(config.rotation || [0, 0, 0]));
      const dir = new THREE.Vector3(0, 0, -1).applyEuler(rot);
      light.target.position.copy(new THREE.Vector3(...(config.position || [0, 0, 0])).add(dir));
      light.target.updateMatrixWorld();

      return () => { if (light.target?.parent === scene) scene.remove(light.target); };
    }
  }, [config.type, scene, config.position, config.rotation]);

  const _lp = useMemo(() => new THREE.Vector3(), []);
  const _lq = useMemo(() => new THREE.Quaternion(), []);
  const _ldir = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    if (lightRef.current && (config.type === 'spot' || config.type === 'directional')) {
      const light = lightRef.current;
      if (light.target) {
        light.updateMatrixWorld(true);
        light.getWorldPosition(_lp);
        light.getWorldQuaternion(_lq);
        _ldir.set(0, 0, -1).applyQuaternion(_lq);
        light.target.position.copy(_lp).add(_ldir);
        light.target.updateMatrixWorld();
      }
    }
  });

  const matrix = useMemo(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(config.rotation || [0, 0, 0])));
    m.compose(new THREE.Vector3(...(config.position || [0, 0, 0])), q, new THREE.Vector3(1, 1, 1));
    return m;
  }, [config.position, config.rotation]);

  const isIndividualGizmoActive = isSelected && !multiSelect && showGizmos && config.type !== 'ambient';

  const lightContent = (
    <group rotation={isIndividualGizmoActive ? [0, 0, 0] : (config.rotation || [0, 0, 0])}>
      {config.enabled && (
        <>
          {config.type === 'ambient' && <ambientLight intensity={config.intensity} color={config.color} />}
          {config.type === 'point' && <pointLight ref={lightRef} intensity={config.intensity * 50} color={config.color} distance={config.distance || 0} decay={config.decay || 2} castShadow={config.castShadow !== false && realtimeShadows} shadow-bias={-0.0005} shadow-normalBias={0.04} shadow-mapSize={[1024, 1024]} shadow-radius={config.shadowRadius ?? 2} position={[0, 0, 0]} />}
          {config.type === 'spot' && <spotLight ref={lightRef} intensity={config.intensity * 100} color={config.color} distance={config.distance || 0} angle={config.angle || Math.PI / 3} penumbra={config.penumbra || 0.1} decay={config.decay || 2} castShadow={config.castShadow !== false && realtimeShadows} shadow-bias={-0.0005} shadow-normalBias={0.04} shadow-mapSize={[1024, 1024]} shadow-radius={config.shadowRadius ?? 2} shadow-camera-near={0.1} shadow-camera-far={200} position={[0, 0, 0]} />}
          {config.type === 'directional' && (
            <directionalLight
              ref={lightRef}
              intensity={config.intensity * 5}
              color={config.color}
              castShadow={config.castShadow !== false && realtimeShadows}
              shadow-bias={-0.0005}
              shadow-normalBias={0.04}
              shadow-mapSize={[2048, 2048]}
              shadow-radius={config.shadowRadius ?? 2}
              shadow-camera-left={-25}
              shadow-camera-right={25}
              shadow-camera-top={25}
              shadow-camera-bottom={-25}
              shadow-camera-near={0.1}
              shadow-camera-far={200}
              position={[0, 0, 0]}
            />
          )}
        </>
      )}

      {showGizmos && config.type !== 'ambient' && (
        <group onClick={(e) => { e.stopPropagation(); onSelectLight(config.id, e.ctrlKey || e.metaKey); }}>
          <mesh visible={false}>
            <sphereGeometry args={[0.3, 16, 16]} />
          </mesh>
          <Billboard>
            <Html center zIndexRange={[10, 0]}>
              <div
                onClick={(e) => { e.stopPropagation(); onSelectLight(config.id, e.ctrlKey || e.metaKey); }}
                className={`flex items-center justify-center p-1.5 rounded-full transition-all cursor-pointer shadow-lg border ${isSelected ? 'bg-teal-500 border-white text-white scale-125' : 'bg-black/60 border-white/20 text-white/80'}`}
                style={{ backdropFilter: 'blur(4px)' }}
              >
                {config.type === 'point' && <Lightbulb className="w-3 h-3" />}
                {config.type === 'spot' && <Zap className="w-3 h-3" />}
                {config.type === 'directional' && <Sun className="w-3 h-3" />}
              </div>
            </Html>
          </Billboard>
          {config.type === 'point' && <PointLightDistanceGizmo distance={config.distance || 0} updateLight={(u) => onUpdateLight(config.id, u)} setIsDragging={setIsDragging} isSelected={isSelected} color={config.color} />}
          {config.type === 'spot' && <SpotLightGizmo distance={config.distance || 0} angle={config.angle || Math.PI / 3} updateLight={(u) => onUpdateLight(config.id, u)} setIsDragging={setIsDragging} isSelected={isSelected} color={config.color} />}
        </group>
      )}
    </group>
  );

  if (config.type === 'ambient' || !showGizmos || !isSelected || multiSelect) {
    return <group position={config.position}>{lightContent}</group>;
  }

  return (
    <PivotControls
      depthTest={false}
      matrix={matrix}
      autoTransform={false}
      fixed={true}
      scale={75}
      lineWidth={2}
      onDragStart={() => {
        onUpdateLight(config.id, {}, true); // Save history
        setIsDragging(true);
      }}
      onDrag={(m) => {
        const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
        m.decompose(p, q, s);
        const r = new THREE.Euler().setFromQuaternion(q);
        onUpdateLight(config.id, { position: [p.x, p.y, p.z], rotation: [r.x, r.y, r.z] }, false);
      }}
      onDragEnd={() => setIsDragging(false)}
    >
      {lightContent}
    </PivotControls>
  );
}

export const Scene = forwardRef<any, SceneProps>(({
  state, onSelect, onBoxSelect, onSelectSub, previewSelectedIds, selectedSubId,
  onUpdate, onUpdateLight, onUpdateItems, onUpdateLights, onZoomChange, fitSignal, zoomRef, panRef, shiftPressed, ctrlPressed, showGizmos, onUpdateState, viewCenterRef, onFitToSelection, fitTargetId, onFitFinish
}, ref) => {
  const [inTransition, startTransition] = React.useTransition();
  const [currentPreset, setCurrentPreset] = useState(state.environment);

  // Sync preset with transition to prevent suspense flickers
  useEffect(() => {
    if (state.environment !== currentPreset) {
      startTransition(() => {
        setCurrentPreset(state.environment);
      });
    }
  }, [state.environment, currentPreset]);

  // Silence specific deprecation warnings from libraries
  useEffect(() => {
    const originalWarn = console.warn;
    console.warn = (...args) => {
      if (typeof args[0] === 'string' && (
        args[0].includes('THREE.Clock') ||
        args[0].includes('PCFSoftShadowMap') ||
        args[0].includes('THREE.Timer') ||
        args[0].includes('toNonIndexed')
      )) return;
      originalWarn(...args);
    };
    return () => { console.warn = originalWarn; };
  }, []);

  const [isDragging, setIsDragging] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, itemId: string, isLocked: boolean, isModel?: boolean, isReplaceMode?: boolean } | null>(null);
  const [models] = useModelLibrary();
  const [meshes, setMeshes] = useState<{ [id: string]: THREE.Mesh }>({});
  const [selectionBox, setSelectionBox] = useState<{ start: [number, number], end: [number, number] } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<any>(null);
  const isBoxSelecting = useRef(false);
  const rightClickStartRef = useRef<{ x: number, y: number } | null>(null);
  const lastPercent = useRef<number>(100);
  const lastDist = useRef<number>(0);
  const [pinnedAreaId, setPinnedAreaId] = useState<string | null>(null);

  // ARC-FIX: Force resize during CSS transitions
  const ResponsiveEnforcer = () => {
    const { gl, camera, size } = useThree();
    useFrame(() => {
      const parent = gl.domElement.parentElement;
      if (!parent) return;
      const { clientWidth, clientHeight } = parent;

      // If the CSS transition moved the container but R3F size state hasn't caught up
      if (Math.abs(size.width - clientWidth) > 0.5 || Math.abs(size.height - clientHeight) > 0.5) {
        gl.setSize(clientWidth, clientHeight);
        if ((camera as any).isPerspectiveCamera) {
          (camera as any).aspect = clientWidth / clientHeight;
          (camera as any).updateProjectionMatrix();
        }
      }
    });
    return null;
  };

  const viewRef = useRef<{ camera: THREE.Camera, gl: THREE.WebGLRenderer } | null>(null);

  const registerMesh = useCallback((id: string, mesh: THREE.Mesh | null) => {
    setMeshes(prev => {
      // Avoid infinite loops by checking if state actually needs to change
      if (prev[id] === mesh) return prev;

      if (mesh) {
        return { ...prev, [id]: mesh };
      } else {
        if (prev[id] === undefined) return prev; // Already gone
        const next = { ...prev };
        delete next[id];
        return next;
      }
    });
  }, []);

  const otherMeshes = useMemo(() => Object.values(meshes), [meshes]);
  const selectedItems = useMemo(() => state.items.filter(i => state.selectedIds.includes(i.id)), [state.items, state.selectedIds]);

  const areaStatusMap = useMemo(() => {
    const areas = state.items.filter(it => it.areaGradient);
    if (areas.length === 0) return {};

    // Sort by ID for deterministic base
    const sorted = [...areas].sort((a, b) => a.id.localeCompare(b.id));

    // Deterministic shuffle based on area count
    const seed = sorted.length;
    const shuffled = [...sorted];
    for (let i = 0; i < shuffled.length; i++) {
      const j = (i * 13 + seed) % shuffled.length;
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const map: Record<string, string> = {};
    const statuses = ['Critical', 'Major', 'Minor', 'Warning'];

    // Pick random areas from the shuffled list to assign statuses
    const availableAreas = [...shuffled];
    statuses.forEach((status) => {
      if (availableAreas.length > 0) {
        const randomIndex = Math.floor(Math.random() * availableAreas.length);
        const chosenArea = availableAreas.splice(randomIndex, 1)[0];
        map[chosenArea.id] = status;
      }
    });

    return map;
  }, [state.items]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button === 0 && ctrlPressed) {
      isBoxSelecting.current = true;
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        setSelectionBox({
          start: [e.clientX - rect.left, e.clientY - rect.top],
          end: [e.clientX - rect.left, e.clientY - rect.top]
        });
      }
    } else if (e.button === 2) {
      rightClickStartRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const ZoomTracker = () => {
    const { scene, camera, gl } = useThree();
    const _zoomRaycaster = useMemo(() => new THREE.Raycaster(), []);
    const _zoomMouse = useMemo(() => new THREE.Vector2(0, 0), []);
    const _zoomPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
    const _zoomIntersect = useMemo(() => new THREE.Vector3(), []);

    useEffect(() => {
      viewRef.current = { camera, gl };
    }, [camera, gl]);

    useEffect(() => {
      const handleGlobalClick = () => setContextMenu(null);
      window.addEventListener('click', handleGlobalClick);
      return () => window.removeEventListener('click', handleGlobalClick);
    }, []);

    useImperativeHandle(ref, () => ({
      scene,
      camera,
      gl
    }), [scene, camera, gl]);

    useFrame((state) => {
      // 1. Sync zoom percentage for UI
      if (controlsRef.current) {
        const target = (controlsRef.current as any).target;
        if (target) {
          const dist = state.camera.position.distanceTo(target);
          lastDist.current = dist;

          const safeDist = Math.max(0.1, dist);
          const p = Math.round((26 / safeDist) * 100);
          if (p !== lastPercent.current) {
            onZoomChange(p);
            lastPercent.current = p;
          }
        }
      }

      // 2. ARC-FIX: Calculate floor (Y=0) intersection AT SCREEN CENTER for spawning
      if (viewCenterRef) {
        _zoomRaycaster.setFromCamera(_zoomMouse, state.camera);
        _zoomPlane.set(_zoomPlane.normal.set(0, 1, 0), 0);

        if (_zoomRaycaster.ray.intersectPlane(_zoomPlane, _zoomIntersect)) {
          // Point on the floor at screen center
          viewCenterRef.current = [_zoomIntersect.x, 0, _zoomIntersect.z];
        } else if (controlsRef.current) {
          // Fallback to orbit target if camera is looking away from floor
          const target = (controlsRef.current as any).target;
          viewCenterRef.current = [target.x, 0, target.z];
        }
      }
    });
    return null;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isBoxSelecting.current && selectionBox) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        setSelectionBox(prev => prev ? {
          ...prev,
          end: [e.clientX - rect.left, e.clientY - rect.top]
        } : null);
      }
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const handlePointerUp = () => {
    if (isBoxSelecting.current && selectionBox) {
      const dx = selectionBox.end[0] - selectionBox.start[0];
      const dy = selectionBox.end[1] - selectionBox.start[1];
      if (Math.sqrt(dx * dx + dy * dy) > 5 && viewRef.current) {
        const { camera, gl } = viewRef.current;
        const start = new THREE.Vector2(
          (selectionBox.start[0] / gl.domElement.clientWidth) * 2 - 1,
          -(selectionBox.start[1] / gl.domElement.clientHeight) * 2 + 1
        );
        const end = new THREE.Vector2(
          (selectionBox.end[0] / gl.domElement.clientWidth) * 2 - 1,
          -(selectionBox.end[1] / gl.domElement.clientHeight) * 2 + 1
        );

        const min = new THREE.Vector2(Math.min(start.x, end.x), Math.min(start.y, end.y));
        const max = new THREE.Vector2(Math.max(start.x, end.x), Math.max(start.y, end.y));

        const selectedIdx: string[] = [];
        const selMeshes = selectionMeshesRef.current;
        Object.entries(selMeshes).forEach(([id, mesh]) => {
          if (!mesh || mesh.userData?.locked) return;
          mesh.updateWorldMatrix(true, false);
          let box3 = new THREE.Box3();
          if (mesh.geometry) {
            if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
            box3.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
          } else {
            box3.setFromCenterAndSize(new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld), new THREE.Vector3(1, 1, 1));
          }

          const center = new THREE.Vector3();
          box3.getCenter(center);
          center.project(camera);
          const isCenterInBox = center.x >= min.x && center.x <= max.x && center.y >= min.y && center.y <= max.y;

          const corners = [
            new THREE.Vector3(box3.min.x, box3.min.y, box3.min.z),
            new THREE.Vector3(box3.min.x, box3.min.y, box3.max.z),
            new THREE.Vector3(box3.min.x, box3.max.y, box3.min.z),
            new THREE.Vector3(box3.min.x, box3.max.y, box3.max.z),
            new THREE.Vector3(box3.max.x, box3.min.y, box3.min.z),
            new THREE.Vector3(box3.max.x, box3.min.y, box3.max.z),
            new THREE.Vector3(box3.max.x, box3.max.y, box3.min.z),
            new THREE.Vector3(box3.max.x, box3.max.y, box3.max.z),
          ];

          let objMinX = Infinity, objMaxX = -Infinity, objMinY = Infinity, objMaxY = -Infinity;
          corners.forEach(c => {
            c.project(camera);
            objMinX = Math.min(objMinX, c.x);
            objMaxX = Math.max(objMaxX, c.x);
            objMinY = Math.min(objMinY, c.y);
            objMaxY = Math.max(objMaxY, c.y);
          });

          const doesIntersect = !(objMaxX < min.x || objMinX > max.x || objMaxY < min.y || objMinY > max.y);
          const objWidth = objMaxX - objMinX;
          const objHeight = objMaxY - objMinY;
          const isHuge = objWidth > 1.0 || objHeight > 1.0;

          if (isHuge ? isCenterInBox : doesIntersect) {
            selectedIdx.push(id);
          }
        });

        state.lights.forEach(light => {
          if (light.type === 'ambient') return;
          const v = new THREE.Vector3(...(light.position || [0, 0, 0]));
          v.project(camera);
          if (v.x >= min.x && v.x <= max.x && v.y >= min.y && v.y <= max.y) {
            selectedIdx.push(light.id);
          }
        });

        if (ctrlPressed) {
          const initialIds = new Set(state.selectedIds);
          const boxIds = new Set(selectedIdx);
          const nextIds = new Set(initialIds);
          boxIds.forEach(id => {
            if (nextIds.has(id)) nextIds.delete(id);
            else nextIds.add(id);
          });
          onBoxSelect(Array.from(nextIds), true);
        } else {
          onBoxSelect(selectedIdx, true);
        }
      }
    }
    setSelectionBox(null);
    isBoxSelecting.current = false;
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-[#0f0f0f] relative overflow-hidden z-0"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onContextMenu={handleContextMenu}
    >
      <Canvas
        shadows={{ type: THREE.PCFSoftShadowMap }}
        camera={{ position: [15, 15, 15], fov: 40, near: 0.1, far: 5000 }}
        gl={{
          logarithmicDepthBuffer: false,
          antialias: true,
          stencil: true,
          alpha: true,
          preserveDrawingBuffer: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0
        }}
        dpr={[1, 2]}
        raycaster={{
          params: {
            Line: { threshold: 0.1 },
            Points: { threshold: 0.1 },
            Mesh: {},
            LOD: {},
            Sprite: {}
          }
        }}
        onPointerMissed={(e) => {
          if (e.button === 0 && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
            onSelect(null);
            setPinnedAreaId(null);
          }
        }}
      >
        <ResponsiveEnforcer />
        <CameraReporter onUpdate={onUpdateState} enabled={state.fitMode === 'custom'} />
        <BackgroundController state={state} />
        {state.lights.map(light => (
          <LightWithHelper
            key={light.id}
            config={light}
            showGizmos={showGizmos}
            isSelected={state.selectedIds.includes(light.id)}
            onSelectLight={onSelect}
            onUpdateLight={onUpdateLight}
            setIsDragging={setIsDragging}
            multiSelect={state.selectedIds.length > 1}
            realtimeShadows={state.realtimeShadows}
          />
        ))}
        <Suspense fallback={null}>
          <Environment
            preset={currentPreset as any}
            background={!state.showBackgroundColor}
            far={1000}
            resolution={1024}
            environmentIntensity={state.showEnvironment ? state.intensity : 0}
            blur={state.environmentBlur ?? 0}
          />
        </Suspense>

        {/* ARC-FIX: Premium Soft Shadows like the requested snippet */}
        <group position={[0, 0.001, 0]}>
          <AccumulativeShadows
            temporal
            frames={100}
            color="#000000"
            colorBlend={0.5}
            opacity={0.6}
            scale={20}
            alphaTest={0.85}
          >
            <RandomizedLight
              amount={8}
              radius={10}
              ambient={0.5}
              position={[10, 10, 5]}
              bias={0.001}
            />
          </AccumulativeShadows>
        </group>

        <RealTimeBoxSelection
          ctrlPressed={ctrlPressed}
          selectionBox={selectionBox}
          onBoxSelect={onBoxSelect}
          currentSelectedIds={state.selectedIds}
          lights={state.lights}
        />

        <FitHandler
          trigger={fitSignal}
          objects={selectedItems}
          targetId={fitTargetId}
          onFinish={() => {
            if (!fitTargetId) setPinnedAreaId(null);
            onFitFinish?.();
          }}
          state={state}
        />
        <OverlayControlsLogic zoomRef={zoomRef} panRef={panRef} />
        <ZoomTracker />
        <GroupGizmo
          state={state}
          onUpdateItems={onUpdateItems}
          onUpdateLights={onUpdateLights}
          setIsDragging={setIsDragging}
        />

        <Bounds margin={1.2}>
          <group>
            {state.items.map(item => (
              <Suspense key={item.id} fallback={null}>
                <Furniture
                  item={item}
                  isSelected={state.selectedIds.includes(item.id)}
                  isPreviewSelected={previewSelectedIds.includes(item.id)}
                  selectedSubId={selectedSubId}
                  onSelect={onSelect}
                  onSelectSub={onSelectSub}
                  onUpdate={onUpdate}
                  onUpdateItems={onUpdateItems}
                  onUpdateLight={onUpdateLight}
                  setIsDragging={setIsDragging}
                  shiftPressed={shiftPressed}
                  ctrlPressed={ctrlPressed}
                  registerMesh={registerMesh}
                  otherMeshes={otherMeshes}
                  showGizmos={true}
                  customTextures={state.customTextures || []}
                  multiSelect={state.selectedIds.length > 1}
                  isLastSelected={state.selectedIds[state.selectedIds.length - 1] === item.id}
                  isBoxSelecting={!!selectionBox}
                  gizmoMode={state.gizmoMode || 'translate'}
                  realtimeShadows={state.realtimeShadows}
                  showReflection={state.showEnvironment}
                  onFitToSelection={onFitToSelection}
                  areasFadeIn={state.areasFadeIn}
                  language={state.language}
                  forcedStatus={areaStatusMap[item.id]}
                  isPinned={pinnedAreaId === item.id}
                  onPin={(id) => setPinnedAreaId(id)}
                />
              </Suspense>
            ))}
          </group>
        </Bounds>

        <OrbitControls
          ref={controlsRef}
          makeDefault
          enabled={!isDragging && !isBoxSelecting.current}
          minDistance={0.5}
          maxDistance={5000}
        />

        {state.contactShadows === true && (
          <ContactShadows
            resolution={1024}
            scale={20}
            blur={2}
            opacity={0.25}
            far={10}
            color="#000000"
          />
        )}

        {state.realtimeShadows === true && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.015, 0]} receiveShadow renderOrder={-1}>
            <planeGeometry args={[1000, 1000]} />
            <shadowMaterial transparent opacity={0.4} polygonOffset={true} polygonOffsetFactor={1} polygonOffsetUnits={1} depthWrite={false} />
          </mesh>
        )}

        <GizmoHelper alignment="top-right" margin={[60, 60]} renderPriority={2}>

          <GizmoViewport axisColors={['#FF4458', '#38CC15', '#3D8BFB']} labelColor="white" labels={['X', 'Y', 'Z']} />

        </GizmoHelper>

        <EffectComposer multisampling={8} autoClear={false}>
          <N8AO aoRadius={0.3} intensity={4} distanceFalloff={2} halfRes={false} aoSamples={16} denoiseSamples={4} />
          <Bloom
            luminanceThreshold={state.bloomThreshold ?? 1.0}
            luminanceSmoothing={state.bloomSmoothing ?? 0.9}
            intensity={state.bloomIntensity ?? 0.05}
            radius={0.4}
          />
        </EffectComposer>

      </Canvas>

      {/* Camera Options Debug Info */}
      {/* Legend UI */}
      <div className="absolute bottom-8 right-8 z-50 bg-[#121212]/60 backdrop-blur-xl border border-white/10 rounded-xl px-5 py-2.5 shadow-[0_15px_35px_rgba(0,0,0,0.5)] flex gap-3 animate-in fade-in slide-in-from-right-4 pointer-events-auto items-center">
        {[
          { label: state.language === 'ko' ? '저온' : 'Low', range: '~18°', color: '#0084ff' },
          { label: state.language === 'ko' ? '적정' : 'Normal', range: '~26°', color: '#3fc026' },
          { label: state.language === 'ko' ? '더움' : 'heat', range: '~31°', color: '#fde047' },
          { label: state.language === 'ko' ? '고온' : 'High', range: '~37°', color: '#ea580c' },
          { label: state.language === 'ko' ? '위험' : 'danger', range: '38°~', color: '#ff0000' },
        ].map((item, idx) => (
          <div key={idx} className="flex flex-col gap-1.5 w-[80px]">
            <div className="h-[3px] rounded-full w-full" style={{ backgroundColor: item.color, boxShadow: `0 0 10px ${item.color}44` }} />
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] font-bold text-white/90 whitespace-nowrap">{item.label}</span>
              <span className="text-[10px] font-mono font-medium text-white/60 whitespace-nowrap">{item.range}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Selection Box Visual */}
      {selectionBox && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(selectionBox.start[0], selectionBox.end[0]),
            top: Math.min(selectionBox.start[1], selectionBox.end[1]),
            width: Math.abs(selectionBox.end[0] - selectionBox.start[0]),
            height: Math.abs(selectionBox.end[1] - selectionBox.start[1]),
            border: `1px solid ${ACCENT_400}`,
            backgroundColor: accentRgba(0.1),
            pointerEvents: 'none',
            zIndex: 100,
            borderRadius: '2px'
          }}
        />
      )}

      {/* Context Menu */}

    </div>
  );
});

// Extracted outside to prevent re-mounting during Scene state updates
const GroupGizmo = ({
  state, onUpdateItems, onUpdateLights, setIsDragging
}: {
  state: AppState,
  onUpdateItems: (map: any, undo?: boolean) => void,
  onUpdateLights: (map: any, undo?: boolean) => void,
  setIsDragging: (val: boolean) => void
}) => {
  const selectedItemsList = state.items.filter(i => state.selectedIds.includes(i.id));
  const selectedLightsList = state.lights.filter(l => state.selectedIds.includes(l.id) && l.type !== 'ambient');
  const allSelected = useMemo(() => [
    ...selectedItemsList.map(i => ({ ...i, isLight: false })),
    ...selectedLightsList.map(l => ({ ...l, isLight: true }))
  ], [state.items, state.lights, state.selectedIds]);

  const initialStates = useRef<{ [id: string]: { pos: THREE.Vector3, quat: THREE.Quaternion, matrix: THREE.Matrix4, isLight: boolean } }>({});
  const initialCenter = useRef<THREE.Vector3>(new THREE.Vector3());
  const initialCenterInv = useRef<THREE.Matrix4>(new THREE.Matrix4());
  const [draggingMatrix, setDraggingMatrix] = useState<THREE.Matrix4 | null>(null);

  const centerPoint = useMemo(() => {
    if (allSelected.length === 0) return new THREE.Vector3();
    const sum = new THREE.Vector3();
    allSelected.forEach(obj => sum.add(new THREE.Vector3(...obj.position)));
    return sum.divideScalar(allSelected.length);
  }, [state.selectedIds, state.items, state.lights]); // Recompute center when selection or positions change

  const groupMatrix = useMemo(() => {
    const m = new THREE.Matrix4();
    m.setPosition(centerPoint);
    return m;
  }, [centerPoint]);

  if (state.selectedIds.length < 2) return null;

  return (
    <PivotControls
      depthTest={false}
      matrix={draggingMatrix || groupMatrix}
      autoTransform={false}
      fixed={true}
      scale={75}
      lineWidth={2}
      onDragStart={() => {
        setIsDragging(true);
        setDraggingMatrix(null);
        initialStates.current = {};
        const sum = new THREE.Vector3();

        allSelected.forEach(obj => {
          const pos = new THREE.Vector3(...obj.position);
          const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(obj.rotation || [0, 0, 0])));
          const mat = new THREE.Matrix4().compose(pos, quat, new THREE.Vector3(1, 1, 1));
          initialStates.current[obj.id] = { pos, quat, matrix: mat, isLight: !!obj.isLight };
          sum.add(pos);
        });

        initialCenter.current = sum.divideScalar(allSelected.length);
        initialCenterInv.current = new THREE.Matrix4().setPosition(initialCenter.current).invert();

        onUpdateItems({}, true);
      }}
      onDrag={(m) => {
        setDraggingMatrix(m.clone());
        const deltaMatrix = m.clone().multiply(initialCenterInv.current);
        const itemUpdates: { [id: string]: Partial<FurnitureItem> } = {};
        const lightUpdates: { [id: string]: Partial<any> } = {};

        Object.entries(initialStates.current).forEach(([id, initial]) => {
          const newMatrix = deltaMatrix.clone().multiply(initial.matrix);
          const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
          newMatrix.decompose(p, q, s);
          const r = new THREE.Euler().setFromQuaternion(q);

          if (initial.isLight) {
            lightUpdates[id] = { position: [p.x, p.y, p.z], rotation: [r.x, r.y, r.z] };
          } else {
            itemUpdates[id] = { position: [p.x, p.y, p.z], rotation: [r.x, r.y, r.z] };
          }
        });

        if (Object.keys(itemUpdates).length > 0) onUpdateItems(itemUpdates, false);
        if (Object.keys(lightUpdates).length > 0) onUpdateLights(lightUpdates, false);
      }}
      onDragEnd={() => {
        setDraggingMatrix(null);
        setIsDragging(false);
      }}
    />
  );
};
