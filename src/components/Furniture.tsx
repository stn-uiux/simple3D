import React, { useMemo, useRef, useEffect, useState, Suspense } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';
import { TransformControls, useGLTF, Html, PivotControls, useTexture, Center, MeshReflectorMaterial } from '@react-three/drei';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
// @ts-ignore
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils';
// @ts-ignore
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader';
import { FurnitureItem, TextureConfig, SubtractionItem } from '../types';
import { DigitalClock } from './DigitalClock';
import { getPresetMaterials } from './MaterialsLibrary';
import { selectionMeshesRef } from '../selectionRegistry';
import { ACCENT_400 } from '../theme';
import { Evaluator, Brush, SUBTRACTION } from 'three-bvh-csg';
// @ts-ignore
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry';

// Set global DRACO decoder path for useGLTF
useGLTF.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');

const useSafeTexture = (urls: { [key: string]: string } | null) => {
  const [textures, setTextures] = useState<{ [key: string]: THREE.Texture } | null>(null);
  const { gl } = useThree();

  useEffect(() => {
    if (!urls) {
      setTextures(null);
      return;
    }

    let isMounted = true;
    const loader = new THREE.TextureLoader();
    const result: { [key: string]: THREE.Texture } = {};
    const entries = Object.entries(urls);
    let loadedCount = 0;

    if (entries.length === 0) {
      setTextures(null);
      return;
    }

    entries.forEach(([key, url]) => {
      loader.load(
        url,
        (tex) => {
          if (!isMounted) return;
          if (key === 'color' || key === 'map' || key === 'emissive') {
            tex.colorSpace = THREE.SRGBColorSpace;
          }
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          tex.anisotropy = gl.capabilities.getMaxAnisotropy();
          result[key] = tex;
          loadedCount++;
          if (loadedCount === entries.length) setTextures({ ...result });
        },
        undefined,
        (err) => {
          if (!isMounted) return;
          console.warn(`[SafeTextureLoader] Failed to load texture ${key}: ${url}`);
          loadedCount++;
          if (loadedCount === entries.length) setTextures({ ...result });
        }
      );
    });

    return () => {
      isMounted = false;
    };
  }, [urls, gl]);

  return textures;
};

const sanitizeMaterial = (mat: any, environment: THREE.Texture | null = null) => {
  if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
    const mapSlots = [
      'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap',
      'emissiveMap', 'displacementMap', 'alphaMap', 'bumpMap',
      'clearcoatMap', 'clearcoatRoughnessMap', 'clearcoatNormalMap',
      'sheenColorMap', 'sheenRoughnessMap', 'iridescenceMap',
      'iridescenceThicknessMap', 'specularIntensityMap', 'specularColorMap',
      'transmissionMap', 'thicknessMap', 'anisotropyMap', 'anisotropyRotationMap'
    ];

    mapSlots.forEach(slot => {
      if (mat[slot] === undefined) mat[slot] = null;
    });

    // ARC-FIX: Explicitly set envMap to null to allow perfect inheritance from scene.environment.
    // This enables Three.js's internal PMREM optimizations and prevents seams/pinching artifacts
    // that occur during manual environment map assignment.
    mat.envMap = null;

    if (mat.isMeshPhysicalMaterial) {
      if (mat.transmission === undefined) mat.transmission = 0;
      if (mat.thickness === undefined) mat.thickness = 0;
      if (mat.ior === undefined) mat.ior = 1.5;
      if (mat.attenuationColor === undefined) mat.attenuationColor = new THREE.Color(1, 1, 1);
      if (mat.attenuationDistance === undefined) mat.attenuationDistance = Infinity;
      if (mat.clearcoat === undefined) mat.clearcoat = 0;
      if (mat.clearcoatRoughness === undefined) mat.clearcoatRoughness = 0;
      if (mat.sheen === undefined) mat.sheen = 0;
      if (mat.sheenRoughness === undefined) mat.sheenRoughness = 0;
      if (mat.sheenColor === undefined) mat.sheenColor = new THREE.Color(1, 1, 1);
      if (mat.specularIntensity === undefined) mat.specularIntensity = 1;
      if (mat.specularColor === undefined) mat.specularColor = new THREE.Color(1, 1, 1);
      if (mat.iridescence === undefined) mat.iridescence = 0;
      if (mat.iridescenceIOR === undefined) mat.iridescenceIOR = 1.3;
      if (mat.anisotropy === undefined) mat.anisotropy = 0;
      if (mat.anisotropyRotation === undefined) mat.anisotropyRotation = 0;
    }
    mat.needsUpdate = true;
  }
};

class ModelErrorBoundary extends React.Component<
  { children: React.ReactNode; url: string },
  { hasError: boolean; errorUrl: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, errorUrl: props.url };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(prevProps: any) {
    if (prevProps.url !== this.props.url) {
      this.setState({ hasError: false, errorUrl: this.props.url });
    }
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

const ModelLayer: React.FC<{ url: string; onModelLoaded: (scene: THREE.Group) => void }> = ({ url, onModelLoaded }) => {
  const { scene } = useGLTF(url);
  useEffect(() => {
    if (scene) onModelLoaded(scene);
  }, [scene, onModelLoaded]);
  return null;
};

// Extend THREE with BVH
(THREE.BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
(THREE.BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

interface FurnitureProps {
  item: FurnitureItem;
  isSelected: boolean;
  isPreviewSelected: boolean;
  selectedSubId: string | null;
  onSelect: (id: string | null, multi?: boolean, isGroupSelect?: boolean) => void;
  onSelectSub: (subId: string | null) => void;
  onUpdate: (id: string, updates: Partial<FurnitureItem>, undoable?: boolean, isGroupUpdate?: boolean) => void;
  onUpdateItems: (updates: { [id: string]: Partial<FurnitureItem> }, undoable?: boolean) => void;
  onUpdateLight: (id: string, updates: Partial<any>) => void;
  setIsDragging: (dragging: boolean) => void;
  shiftPressed: boolean;
  ctrlPressed: boolean;
  registerMesh: (id: string, mesh: THREE.Mesh | null) => void;
  otherMeshes: THREE.Mesh[];
  showGizmos: boolean;
  customTextures: TextureConfig[];
  multiSelect: boolean;
  isLastSelected: boolean;
  isBoxSelecting?: boolean;
  gizmoMode: 'translate' | 'rotate' | 'scale' | 'texture';
  realtimeShadows?: boolean;
  showReflection: boolean;
  onFitToSelection: (id?: string) => void;
  areasFadeIn?: boolean;
  language?: 'en' | 'ko';
  forcedStatus?: string;
  isPinned?: boolean;
  onPin?: (id: string | null) => void;
}

const SubtractionGizmo: React.FC<{
  sub: SubtractionItem;
  item: FurnitureItem;
  onUpdate: (id: string, updates: Partial<FurnitureItem>, undoable?: boolean) => void;
  onSelectSub: (subId: string | null) => void;
  setIsDragging: (dragging: boolean) => void;
  isSelected: boolean;
}> = ({ sub, item, onUpdate, onSelectSub, setIsDragging, isSelected }) => {
  const initialDimensions = useRef<[number, number, number] | null>(null);

  const gizmoMatrix = useMemo(() => {
    const m = new THREE.Matrix4();
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(...sub.rotation));
    m.compose(new THREE.Vector3(...sub.position), quat, new THREE.Vector3(1, 1, 1));
    return m;
  }, [sub.id, ...sub.position, ...sub.rotation]);

  return (
    <>
      <group
        position={sub.position}
        rotation={sub.rotation}
      >
        {/* Selection Hit Box: ONLY active when not already selected to avoid competing with PivotControls */}
        {!isSelected && (
          <mesh
            onPointerDown={(e) => {
              e.stopPropagation();
              onSelectSub(sub.id);
            }}
          >
            {sub.type === 'box' && <boxGeometry args={sub.dimensions} />}
            {sub.type === 'sphere' && <sphereGeometry args={[sub.dimensions[0] / 2, 128, 64]} />}
            {sub.type === 'cylinder' && <cylinderGeometry args={[sub.dimensions[0] / 2, sub.dimensions[0] / 2, sub.dimensions[1], 16]} />}
            <meshBasicMaterial visible={false} />
          </mesh>
        )}

        {/* Visual Helper: Purely visual, ignores all mouse events */}
        <mesh
          // @ts-ignore
          pointerEvents="none"
          renderOrder={9999}
        >
          {sub.type === 'box' && <boxGeometry args={sub.dimensions} />}
          {sub.type === 'sphere' && <sphereGeometry args={[sub.dimensions[0] / 2, 16, 16]} />}
          {sub.type === 'cylinder' && <cylinderGeometry args={[sub.dimensions[0] / 2, sub.dimensions[0] / 2, sub.dimensions[1], 16]} />}
          <meshBasicMaterial
            wireframe
            color={isSelected ? ACCENT_400 : "#FF4458"}
            transparent
            opacity={isSelected ? 0.8 : 0.3}
            depthTest={false}
          />
        </mesh>
      </group>
      {isSelected && (
        <PivotControls
          matrix={gizmoMatrix}
          autoTransform={false}
          depthTest={false}
          fixed={true}
          scale={50}
          lineWidth={2}
          onDragStart={() => {
            setIsDragging(true);
            initialDimensions.current = [...sub.dimensions];
            onUpdate(item.id, {}, true); // Save history before drag
          }}
          onDrag={(matrix) => {
            const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scale = new THREE.Vector3();
            matrix.decompose(pos, quat, scale);
            const rot = new THREE.Euler().setFromQuaternion(quat);
            const dims = initialDimensions.current || sub.dimensions;
            const newDims: [number, number, number] = [dims[0] * scale.x, dims[1] * scale.y, dims[2] * scale.z];
            const newSubs: SubtractionItem[] = (item.subtractions || []).map(s => s.id === sub.id ? {
              ...s,
              position: [pos.x, pos.y, pos.z] as [number, number, number],
              rotation: [rot.x, rot.y, rot.z] as [number, number, number],
              dimensions: newDims
            } : s);
            onUpdate(item.id, { subtractions: newSubs }, false);
          }}
          onDragEnd={() => {
            setIsDragging(false);
            onUpdate(item.id, { subtractions: item.subtractions }, false);
          }}
        />
      )}
    </>
  );
};

export const Furniture = React.memo(({
  item,
  isSelected,
  isPreviewSelected,
  selectedSubId,
  onSelect,
  onSelectSub,
  onUpdate,
  onUpdateItems,
  onUpdateLight,
  setIsDragging,
  shiftPressed,
  ctrlPressed,
  registerMesh,
  otherMeshes,
  showGizmos,
  customTextures,
  multiSelect,
  isLastSelected,
  isBoxSelecting = false,
  gizmoMode,
  realtimeShadows,
  showReflection,
  onFitToSelection,
  areasFadeIn,
  language = 'en',
  forcedStatus,
  isPinned,
  onPin
}: FurnitureProps) => {
  const meshRef = useRef<THREE.Mesh>(null!);
  const groupRef = useRef<THREE.Group>(null!);
  const { scene } = useThree();
  const [loadedScene, setLoadedScene] = useState<THREE.Group | null>(null);
  // Area items have their own revealProgress ref-based animation (see later useFrame).
  // This state-based fade is ONLY for non-area items. Area items always start at 1 here
  // to avoid double-animation conflicts that cause flickering.
  const [fade, setFade] = useState(1);

  // Handle Fade-In Animation for NON-area Items only
  useFrame((_, delta) => {
    if (item.areaGradient) return; // Area items: skip, handled by revealProgress below
    if (areasFadeIn && fade < 1) {
      setFade(prev => Math.min(1, prev + delta * 1.5));
    } else if (!areasFadeIn && fade > 0 && !item.areaGradient) {
      // Only reset fade for non-area items
    }
  });

  const texConfig = useMemo(() => {
    return ([
      ...getPresetMaterials(),
      ...customTextures
    ].find(t => t.id === item.textureId)) as TextureConfig | undefined;
  }, [item.textureId, customTextures]);

  const mapUrls = useMemo(() => {
    if (!texConfig || item.textureId === 'none') return null;
    const urls: { [key: string]: string } = {};
    if (texConfig.maps) {
      Object.entries(texConfig.maps).forEach(([k, v]) => { if (v) urls[k] = v; });
    } else if (texConfig.url) {
      urls.color = texConfig.url;
    }
    return Object.keys(urls).length > 0 ? urls : null;
  }, [texConfig, item.textureId]);

  const loadedMaps = useSafeTexture(mapUrls);

  const finalTextures = useMemo(() => {
    if (!mapUrls || !loadedMaps) return null;

    const result: { [key: string]: THREE.Texture } = {};
    const useTiling = item.textureTiling !== false;
    const densityX = item.textureDensity?.[0] ?? 1;
    const densityY = item.textureDensity?.[1] ?? 1;
    const offsetX = item.textureOffset?.[0] ?? 0;
    const offsetY = item.textureOffset?.[1] ?? 0;

    Object.keys(mapUrls).forEach(key => {
      const t = (loadedMaps as any)[key]?.clone();
      if (t) {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        if (useTiling) {
          const baseRepeatX = texConfig?.repeat?.[0] || 1;
          const baseRepeatY = texConfig?.repeat?.[1] || 1;
          t.repeat.set(baseRepeatX * densityX, baseRepeatY * densityY);
          t.offset.set(offsetX, offsetY);
        } else {
          t.repeat.set(1, 1);
          t.offset.set(0, 0);
        }
        result[key] = t;
      }
    });

    return result;
  }, [mapUrls, loadedMaps, item.textureTiling, item.textureDensity, item.textureOffset, texConfig]);



  const pointerDownPos = useRef<{ x: number, y: number } | null>(null);

  useEffect(() => {
    if (meshRef.current) {
      registerMesh(item.id, meshRef.current);
    }
    return () => registerMesh(item.id, null);
  }, [item.id, registerMesh]);

  const model = useMemo(() => {
    if (item.url && loadedScene) {
      const clone = loadedScene.clone();
      const tempBox = new THREE.Box3().setFromObject(clone);
      const center = tempBox.getCenter(new THREE.Vector3());

      // X, Z는 중앙 정렬, Y는 모델의 바닥(min.y)을 0점에 맞춰 기즈모와 일치시킴
      clone.position.set(-center.x, -tempBox.min.y, -center.z);

      clone.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.receiveShadow = true;
          (mesh as any).geometry.computeBoundsTree();

          if (mesh.material) {
            // Clone materials so independent items don't share state overrides
            if (!mesh.userData.materialCloned) {
              mesh.material = Array.isArray(mesh.material)
                ? mesh.material.map(m => m.clone())
                : (mesh.material as THREE.Material).clone();
              mesh.userData.materialCloned = true;
            }

            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            let isAnyGlass = false;

            mats.forEach((mat: any) => {
              // ARC-FIX: Sanitize material immediately upon cloning
              sanitizeMaterial(mat, null);

              // Apply UI Culling overrides natively to all materials in the GLTF
              if (item.flipNormals !== undefined) {
                mat.side = item.flipNormals ? THREE.BackSide : (item.doubleSide === false ? THREE.FrontSide : THREE.DoubleSide);
              } else if (item.doubleSide !== undefined) {
                mat.side = item.doubleSide === false ? THREE.FrontSide : THREE.DoubleSide;
              }

              // Vital fix: Make sure the shadow engine respects material backface culling perfectly
              mat.shadowSide = mat.side;

              const hasTransmission = mat.isMeshPhysicalMaterial && mat.transmission > 0;
              const isByName = mat.name && mat.name.toLowerCase().includes('glass');
              const isTransparent = mat.transparent === true && mat.opacity < 0.95; // ARC-FIX: Also detect transparent materials as glass
              const isGlass = hasTransmission || isByName || isTransparent;

              if (isGlass) {
                isAnyGlass = true;
                mat.transparent = true;

                // ARC-FIX: Only disable depthWrite for highly transparent items to prevent internal sorting artifacts
                // If opacity is high, we want depthWrite to hide backfaces/internal geometry
                const effectiveOpacity = item.glassOpacity !== undefined ? item.glassOpacity : (mat.opacity ?? 0.3);
                mat.depthWrite = effectiveOpacity > 0.8;

                // ARC-FIX: Respect user culling preference even for glass materials
                if (item.flipNormals !== undefined) {
                  mat.side = item.flipNormals ? THREE.BackSide : (item.doubleSide === false ? THREE.FrontSide : THREE.DoubleSide);
                } else if (item.doubleSide !== undefined) {
                  mat.side = item.doubleSide === false ? THREE.FrontSide : THREE.DoubleSide;
                } else {
                  // Default to DoubleSide only for glass if no override, to handle single-plane panes
                  mat.side = THREE.DoubleSide;
                }

                mat.envMapIntensity = Math.max(mat.envMapIntensity || 1, 1);

                if (item.glassColor) {
                  mat.color.set(item.glassColor);
                }

                if (item.glassOpacity !== undefined) {
                  mat.opacity = item.glassOpacity;
                  if (hasTransmission) {
                    mat.transmission = 1 - item.glassOpacity;
                  }
                } else {
                  if (!hasTransmission) {
                    mat.opacity = 0.2; // ARC-FIX: Default 0.2
                  }
                }

                mat.metalness = item.glassMetalness !== undefined ? item.glassMetalness : 1.0; // ARC-FIX: Default 1.0
                mat.roughness = item.glassRoughness !== undefined ? item.glassRoughness : 0.0; // ARC-FIX: Default 0.0
              } else {
                // For non-glass materials, respect opacity-based depthWrite but keep it TRUE for near-opaque items
                if (mat.transparent && mat.opacity < 0.9) {
                  mat.depthWrite = false;
                } else {
                  // Ensure solid frames/panels don't bleed depth
                  mat.depthWrite = true;
                }
              }

              // Basic assignments only during initial load/memoization
              // (Live updates are handled by the useEffect above)

              // ARC-FIX: Apply consistent renderOrder for sorting
              child.renderOrder = isSelected ? 20 : (mat.transparent ? 10 : 0);
            });

            // ARC-FIX: Let user control shadow casting, or default to NO SHADOW for glass
            const shouldCast = item.castShadow !== undefined ? item.castShadow : !isAnyGlass;
            mesh.castShadow = shouldCast;
            // ARC-FIX: REMOVED customDistanceMaterial assignment. 
            // Setting a Physical material as a custom distance material causes refreshUniformsPhysical to crash during shadow pass
            // because the shadow program doesn't have the complex physical material uniforms.
          } else {
            mesh.castShadow = item.castShadow !== undefined ? item.castShadow : true;
          }
        }
      });
      return clone;
    }
    return null;
  }, [item.url, loadedScene, item.glassOpacity, item.glassColor, item.glassMetalness, item.glassRoughness, item.doubleSide, item.flipNormals]);

  // ARC-FIX: Detect if the model contains any glass materials and update state
  useEffect(() => {
    if (loadedScene && item.type === 'model' && item.hasGlass === undefined) {
      let containsGlass = false;
      loadedScene.traverse((child) => {
        if ((child as any).isMesh && (child as any).material) {
          const mats = Array.isArray((child as any).material) ? (child as any).material : [(child as any).material];
          mats.forEach((mat: any) => {
            const hasTransmission = mat.isMeshPhysicalMaterial && mat.transmission > 0;
            const isByName = mat.name && mat.name.toLowerCase().includes('glass');
            const isTransparent = mat.transparent === true && mat.opacity < 0.9;
            if (hasTransmission || isByName || isTransparent) {
              containsGlass = true;
            }
          });
        }
      });
      if (containsGlass) {
        onUpdate(item.id, {
          hasGlass: true,
          glassOpacity: 0.2,
          glassMetalness: 1.0,
          glassRoughness: 0.0
        }, false);
      } else {
        onUpdate(item.id, { hasGlass: false }, false);
      }
    }
  }, [loadedScene, item.type, item.id, item.hasGlass, onUpdate]);

  // ARC-FIX: Sync material properties live when sliders change (Optimized: No re-cloning)
  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh && mesh.material) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

          mats.forEach((mat: any) => {
            // ARC-FIX: Apply Material Properties from Config (Support for Custom Materials on Models)
            if (item.textureId && item.textureId !== 'none' && texConfig) {
              if (texConfig.opacity !== undefined) {
                mat.opacity = texConfig.opacity;
                mat.transparent = mat.opacity < 0.99;
              }
              if (texConfig.metalness !== undefined) mat.metalness = texConfig.metalness;
              if (texConfig.roughness !== undefined) mat.roughness = texConfig.roughness;
              if (texConfig.color) mat.color.set(texConfig.color);

              // ARC-FIX: Apply textures to model materials
              if (finalTextures) {
                if (finalTextures.color) mat.map = finalTextures.color;
                if (finalTextures.normal) mat.normalMap = finalTextures.normal;
                if (finalTextures.roughness) mat.roughnessMap = finalTextures.roughness;
                if (finalTextures.metalness) mat.metalnessMap = finalTextures.metalness;
                if (finalTextures.ao) mat.aoMap = finalTextures.ao;
                if (finalTextures.displacement) {
                  mat.displacementMap = finalTextures.displacement;
                  mat.displacementScale = item.displacementScale ?? texConfig.displacementScale ?? 0.1;
                }
                if (finalTextures.emissive) mat.emissiveMap = finalTextures.emissive;
                if (finalTextures.opacity) {
                  mat.alphaMap = finalTextures.opacity;
                  mat.transparent = true;
                }
              }
            }

            // ARC-FIX: Get reflection properties
            const hasTransmission = mat.isMeshPhysicalMaterial && mat.transmission > 0;
            const isByName = mat.name && mat.name.toLowerCase().includes('glass');
            const isGlass = hasTransmission || isByName;

            // Apply environment intensity
            const canReflect = showReflection === true;

            if (!canReflect) {
              mat.envMapIntensity = 0;
            } else if (item.envMapIntensity !== undefined) {
              mat.envMapIntensity = item.envMapIntensity;
            } else {
              mat.envMapIntensity = 1.0;
            }

            // ARC-FIX: CRITICAL - Ensure NO material property is undefined to prevent refreshUniformsPhysical crash
            sanitizeMaterial(mat, scene.environment);
          });
        }
      });
    }
  }, [item.envMapIntensity, showReflection, scene.environment, loadedScene, texConfig]);
  // Note: item.url check to see if it's a model

  // ARC-FIX: Object level shadow sync (Traverses models to ensure children sync)
  useEffect(() => {
    if (meshRef.current) {
      // Logic: Explicitly OFF if castShadow is false, otherwise default to context
      const shouldCast = item.castShadow !== false;
      const shouldReceive = !!realtimeShadows;

      meshRef.current.traverse((child) => {
        if ((child as any).isMesh) {
          child.castShadow = shouldCast;
          child.receiveShadow = shouldReceive;
        }
      });
    }
  }, [item.castShadow, realtimeShadows, loadedScene]);

  const svgGeometry = useMemo(() => {
    if ((item.type === 'svg' || item.type === 'model') && item.svgData) {
      const loader = new SVGLoader();
      const result = loader.parse(item.svgData);
      const allShapes: THREE.Shape[] = [];
      result.paths.forEach((path) => {
        const pathShapes = SVGLoader.createShapes(path);
        allShapes.push(...pathShapes);
      });

      if (allShapes.length === 0) return null;

      // ArcLabV: Calculate bounding box from curves
      const box = new THREE.Box2();
      allShapes.forEach(shape => {
        shape.curves.forEach(curve => {
          const points = curve.getPoints(10);
          points.forEach(p => box.expandByPoint(new THREE.Vector2(p.x, p.y)));
        });
      });

      const center2D = new THREE.Vector2();
      box.getCenter(center2D);
      const size2D = new THREE.Vector2();
      box.getSize(size2D);
      const extrusion = item.extrusion ?? 2; // ?? preserves 0 (flat plane for ceiling/floor)

      // Second pass: Create geometries with vertex colors
      const geometries: THREE.BufferGeometry[] = [];
      result.paths.forEach((path) => {
        const pathShapes = SVGLoader.createShapes(path);
        const isFill = path.userData?.style?.fill && path.userData.style.fill !== 'none';

        pathShapes.forEach(shape => {
          let geo: THREE.BufferGeometry;
          if (extrusion > 0.01) {
            geo = new THREE.ExtrudeGeometry(shape, {
              depth: extrusion,
              bevelEnabled: false,
              curveSegments: 32
            });
          } else {
            geo = new THREE.ShapeGeometry(shape, 32);
          }

          // Transform coordinate: flip Y and center
          geo.scale(1, -1, 1);
          geo.translate(-center2D.x, center2D.y, 0);
          geo.rotateX(-Math.PI / 2);

          // Handle Hollow or Area Gradient (open top/bottom — side walls only)
          if ((item.isHollow || item.areaGradient) && extrusion > 0.01) {
            const nonIndexed = geo.toNonIndexed();
            const posAttr = nonIndexed.getAttribute('position');
            const normAttr = nonIndexed.getAttribute('normal');
            const uvAttr = nonIndexed.getAttribute('uv');
            const filteredPositions: number[] = [];
            const filteredNormals: number[] = [];
            const filteredUvs: number[] = [];

            for (let i = 0; i < posAttr.count; i += 3) {
              const ny = normAttr.getY(i);
              if (Math.abs(ny) < 0.5) {
                for (let j = 0; j < 3; j++) {
                  filteredPositions.push(posAttr.getX(i + j), posAttr.getY(i + j), posAttr.getZ(i + j));
                  filteredNormals.push(normAttr.getX(i + j), normAttr.getY(i + j), normAttr.getZ(i + j));
                  if (uvAttr) filteredUvs.push(uvAttr.getX(i + j), uvAttr.getY(i + j));
                }
              }
            }
            geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(filteredPositions, 3));
            geo.setAttribute('normal', new THREE.Float32BufferAttribute(filteredNormals, 3));
            if (filteredUvs.length > 0) geo.setAttribute('uv', new THREE.Float32BufferAttribute(filteredUvs, 2));
          }

          // Apply Vertex Colors
          geo = geo.toNonIndexed();
          const pos = geo.getAttribute('position');
          const norm = geo.getAttribute('normal');
          const colors = new Float32Array(pos.count * 3);

          const lowerId = (item.id || '').toLowerCase();
          const lowerGroup = (item.groupId || '').toLowerCase();
          const isWall = (lowerId.includes('wall') || lowerGroup.includes('wall')) &&
            !lowerId.includes('floor') && !lowerId.includes('ceiling') &&
            !lowerGroup.includes('floor') && !lowerGroup.includes('ceiling');
          const isGlass = lowerId.includes('glass') || lowerGroup.includes('glass');

          const canHaveBlackTop = isWall || item.type === 'box' || isGlass;
          const shouldShowBlackTop = item.showBlackTop === true; // Default to false

          for (let i = 0; i < pos.count; i++) {
            const ny = norm.getY(i);
            // If it should show black top, is a fill, and normal points UP, paint it BLACK
            if (canHaveBlackTop && shouldShowBlackTop && isFill && ny > 0.5) {
              colors[i * 3] = 0; // Pure black
              colors[i * 3 + 1] = 0;
              colors[i * 3 + 2] = 0;
            } else {
              // Otherwise white (will be tinted by material color)
              colors[i * 3] = 1;
              colors[i * 3 + 1] = 1;
              colors[i * 3 + 2] = 1;
            }
          }
          geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

          // Fix Winding Order
          for (let i = 0; i < pos.count; i += 3) {
            const x1 = pos.getX(i + 1), y1 = pos.getY(i + 1), z1 = pos.getZ(i + 1);
            const x2 = pos.getX(i + 2), y2 = pos.getY(i + 2), z2 = pos.getZ(i + 2);
            pos.setXYZ(i + 1, x2, y2, z2);
            pos.setXYZ(i + 2, x1, y1, z1);
          }

          geometries.push(geo);
        });
      });

      if (geometries.length === 0) return null;

      // 4. ArcLabV: Merge all shapes into one solid
      let merged = mergeGeometries(geometries);
      if (!merged) return null;

      // 5. ArcLabV Manifold Cleanup: weld vertices, recompute normals
      merged = mergeVertices(merged, 1e-4);
      merged.deleteAttribute('normal');
      merged.computeVertexNormals();
      merged.computeBoundingSphere();
      merged.computeBoundingBox();

      // Apply app-specific scaling
      if (!item.dimensions && !item.baseDimensions) {
        merged.scale(0.1, 1.0, 0.1);
      }

      if (item.dimensions) {
        merged.computeBoundingBox();
        const size = new THREE.Vector3();
        merged.boundingBox!.getSize(size);
        merged.scale(
          item.dimensions[0] / (size.x || 1),
          item.dimensions[1] / (size.y || 1),
          item.dimensions[2] / (size.z || 1)
        );
        merged.computeBoundingBox();
        merged.translate(0, -merged.boundingBox!.min.y, 0);
      }

      // BOX MAPPING: Improved Planar UVs based on surface normals (Critical for walls)
      merged.computeBoundingBox();
      const pos = merged.attributes.position;
      const norm = merged.attributes.normal;
      const uvs = new Float32Array(pos.count * 2);
      const uvScale = 0.1;

      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);

        const nx = Math.abs(norm.getX(i));
        const ny = Math.abs(norm.getY(i));
        const nz = Math.abs(norm.getZ(i));

        if (ny > nx && ny > nz) {
          // Horizontal surface (Floor/Ceiling) -> Project on XZ
          uvs[i * 2] = x * uvScale;
          uvs[i * 2 + 1] = z * uvScale;
        } else if (nx > nz) {
          // Vertical surface facing X -> Project on ZY
          uvs[i * 2] = z * uvScale;
          uvs[i * 2 + 1] = y * uvScale;
        } else {
          // Vertical surface facing Z -> Project on XY
          uvs[i * 2] = x * uvScale;
          uvs[i * 2 + 1] = y * uvScale;
        }
      }
      merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      merged.setAttribute('uv2', new THREE.BufferAttribute(uvs, 2));

      // For areaGradient: override UVs so V = normalized Y (bottom=0, top=1)
      // This allows an alphaMap to create a vertical gradient opacity
      if (item.areaGradient) {
        const bb = merged.boundingBox!;
        const minY = bb.min.y;
        const maxY = bb.max.y;
        const rangeY = maxY - minY || 1;
        const gradUvs = new Float32Array(pos.count * 2);
        for (let i = 0; i < pos.count; i++) {
          gradUvs[i * 2] = 0.5; // U doesn't matter for 1D gradient
          gradUvs[i * 2 + 1] = (pos.getY(i) - minY) / rangeY; // V = normalized Y
        }
        merged.setAttribute('uv', new THREE.BufferAttribute(gradUvs, 2));
      }

      (merged as any).computeBoundsTree?.();
      return merged;
    }
    return null;
  }, [item.type, item.svgData, item.extrusion, item.dimensions, item.isHollow, item.showBlackTop, item.areaGradient]);

  // Create vertical gradient alphaMap for area items (0.2 at top → 0 at bottom)
  const areaAlphaMap = useMemo(() => {
    if (!item.areaGradient) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#ffffff'); // Top: fully opaque (multiplied by material opacity 0.2)
    grad.addColorStop(1, '#000000'); // Bottom: fully transparent
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1, 256);
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }, [item.areaGradient]);


  const geometry = useMemo(() => {
    let baseGeo: THREE.BufferGeometry;
    if (svgGeometry) {
      baseGeo = svgGeometry.clone();
    } else if (item.url && loadedScene) {
      const geometries: THREE.BufferGeometry[] = [];
      const tempScene = loadedScene.clone();
      tempScene.position.set(0, 0, 0); tempScene.rotation.set(0, 0, 0); tempScene.scale.set(1, 1, 1);
      tempScene.updateMatrixWorld(true);
      tempScene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          const geo = mesh.geometry.clone();
          geo.applyMatrix4(mesh.matrixWorld);

          // ARC-FIX: Ensure all merged geometries have compatible attributes (Position, Normal, UV)
          // mergeGeometries fails if some have an attribute and others don't.
          if (!geo.attributes.position) return;

          if (!geo.attributes.normal) geo.computeVertexNormals();

          if (!geo.attributes.uv) {
            const count = geo.attributes.position.count;
            geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
          }

          const allowed = ['position', 'normal', 'uv'];
          Object.keys(geo.attributes).forEach(k => {
            if (!allowed.includes(k)) geo.deleteAttribute(k);
          });

          geometries.push(geo);
        }
      });
      if (geometries.length > 0) {
        try {
          // mergeGeometries works best when all geometries have the same attributes
          baseGeo = mergeGeometries(geometries) || new THREE.BoxGeometry(0.001, 0.001, 0.001);
        } catch (e) {
          console.error('[Furniture] mergeGeometries failed:', e);
          baseGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5); // Fallback to a small box
        }
      } else {
        // If it's a model but we found no meshes yet, return null to avoid showing a box
        if (item.type === 'model' || item.url) return null;
        baseGeo = new THREE.BoxGeometry(1, 1, 1);
      }
    } else {
      const d = item.dimensions || [1, 1, 1];
      if (item.type === 'box') {
        const radius = item.borderRadius ?? 0;
        const segments = item.borderSegments ?? 4;
        if (radius > 0) {
          // @ts-ignore
          baseGeo = new RoundedBoxGeometry(d[0], d[1], d[2], segments, radius).translate(0, d[1] / 2, 0);
        } else {
          baseGeo = new THREE.BoxGeometry(d[0], d[1], d[2]).translate(0, d[1] / 2, 0);
        }
      }
      else if (item.type === 'sphere') baseGeo = new THREE.SphereGeometry(d[0] / 2, 128, 128).translate(0, d[1] / 2, 0);

      else if (item.type === 'plane') baseGeo = new THREE.PlaneGeometry(d[0], d[2]).rotateX(-Math.PI / 2).translate(0, 0, 0);
      else if (item.type === 'clock') baseGeo = new THREE.BoxGeometry(1.2, 0.85, 0.05).translate(0, 0.425, 0);
      else baseGeo = new THREE.BoxGeometry(d[0], d[1], d[2]);

      // ARC-FIX: Do NOT recompute normals for primitives (Sphere, Box, etc.) if they already have them.
      // Recalculating normals on an indexed Sphere causes a visible seam at the UV boundary.
      if (!baseGeo.attributes.normal) {
        baseGeo.computeVertexNormals();
      }
      baseGeo.computeBoundingBox();

      // Add uv2 for AO map support (standard requirement for MeshStandardMaterial.aoMap)
      if (baseGeo.attributes.uv) {
        baseGeo.setAttribute('uv2', new THREE.BufferAttribute(baseGeo.attributes.uv.array, 2));
      }
    }

    if (!baseGeo) return null;

    if (item.subtractions && item.subtractions.length > 0) {
      const evaluator = new Evaluator();
      let resBrush = new Brush(baseGeo);
      resBrush.updateMatrixWorld();

      item.subtractions.forEach(sub => {
        let subGeo;
        if (sub.type === 'box') subGeo = new THREE.BoxGeometry(...sub.dimensions);
        else if (sub.type === 'sphere') subGeo = new THREE.SphereGeometry(sub.dimensions[0] / 2, 16, 16);
        else subGeo = new THREE.CylinderGeometry(sub.dimensions[0] / 2, sub.dimensions[0] / 2, sub.dimensions[1], 16);

        if (subGeo) {
          const subBrush = new Brush(subGeo);
          subBrush.position.set(...sub.position);
          subBrush.rotation.set(...sub.rotation);
          subBrush.updateMatrixWorld();
          const nextResult = evaluator.evaluate(resBrush, subBrush, SUBTRACTION);

          // ArcLabV isHollow: Discard Group 1 (subtractor cap faces) to avoid "capping" the hole
          if (item.isHollow) {
            const groups = nextResult.geometry.groups;
            if (groups.length > 1) {
              const group0 = groups[0];
              const filteredGeo = nextResult.geometry.clone();
              if (filteredGeo.index) {
                const newIndexArray = filteredGeo.index.array.slice(group0.start, group0.start + group0.count);
                filteredGeo.setIndex(new THREE.BufferAttribute(newIndexArray, 1));
              } else {
                const pos = filteredGeo.getAttribute('position');
                filteredGeo.setAttribute('position', new THREE.BufferAttribute(pos.array.slice(group0.start * 3, (group0.start + group0.count) * 3), 3));
                const norm = filteredGeo.getAttribute('normal');
                if (norm) filteredGeo.setAttribute('normal', new THREE.BufferAttribute(norm.array.slice(group0.start * 3, (group0.start + group0.count) * 3), 3));
                const uv = filteredGeo.getAttribute('uv');
                if (uv) filteredGeo.setAttribute('uv', new THREE.BufferAttribute(uv.array.slice(group0.start * 2, (group0.start + group0.count) * 2), 2));
              }
              filteredGeo.clearGroups();
              nextResult.geometry = filteredGeo;
            }
          }

          resBrush = nextResult;
          resBrush.updateMatrixWorld();
        }
      });
      baseGeo = resBrush.geometry;
    }


    baseGeo.computeVertexNormals();

    // ArcLabV: Final pass for wall top coloring (persists after CSG/scaling)
    const lowerId = (item.id || '').toLowerCase();
    const lowerGroup = (item.groupId || '').toLowerCase();
    const isWall = (lowerId.includes('wall') || lowerGroup.includes('wall')) &&
      !lowerId.includes('floor') && !lowerId.includes('ceiling') &&
      !lowerGroup.includes('floor') && !lowerGroup.includes('ceiling');
    const isGlass = lowerId.includes('glass') || lowerGroup.includes('glass');

    const canHaveBlackTop = isWall || item.type === 'box' || isGlass;
    const shouldShowBlackTop = item.showBlackTop === true; // Default to false

    if (canHaveBlackTop) {
      baseGeo = baseGeo.toNonIndexed();
      const pos = baseGeo.getAttribute('position');
      const norm = baseGeo.getAttribute('normal');
      const colors = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const ny = norm.getY(i);
        if (shouldShowBlackTop && ny > 0.5) {
          colors[i * 3] = 0; // Pure black
          colors[i * 3 + 1] = 0;
          colors[i * 3 + 2] = 0;
        } else {
          colors[i * 3] = 1; // Pure white
          colors[i * 3 + 1] = 1;
          colors[i * 3 + 2] = 1;
        }
      }
      baseGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }

    (baseGeo as any).computeBoundsTree?.();

    // ARC-FIX: BOX MAPPING - Improved Planar UVs based on surface normals (Prevents texture stretching)
    if (item.type === 'box' || item.type === 'plane' || isWall) {
      const pos = baseGeo.attributes.position;
      const norm = baseGeo.attributes.normal;
      const uvs = new Float32Array(pos.count * 2);
      const uvScale = 1.0;

      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);

        const nx = Math.abs(norm.getX(i));
        const ny = Math.abs(norm.getY(i));
        const nz = Math.abs(norm.getZ(i));

        if (ny > 0.5) { // Top/Bottom faces
          uvs[i * 2] = x * uvScale;
          uvs[i * 2 + 1] = z * uvScale;
        } else if (nx > 0.5) { // Side faces (X-facing)
          uvs[i * 2] = z * uvScale;
          uvs[i * 2 + 1] = y * uvScale;
        } else { // Side faces (Z-facing)
          uvs[i * 2] = x * uvScale;
          uvs[i * 2 + 1] = y * uvScale;
        }
      }
      baseGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      baseGeo.setAttribute('uv2', new THREE.BufferAttribute(uvs, 2));
    }

    return baseGeo;
  }, [item.type, item.url, item.dimensions, item.subtractions, item.isHollow, item.showBlackTop, item.borderRadius, item.borderSegments, loadedScene, svgGeometry]);

  const reflectionGeometry = useMemo(() => {
    if (!geometry) return null;
    const geo = geometry.clone();
    geo.rotateX(Math.PI / 2);
    return geo;
  }, [geometry]);




  // Performance Fix: Trigger material update ONLY when textures change
  useEffect(() => {
    if (meshRef.current?.material) {
      (meshRef.current.material as THREE.Material).needsUpdate = true;
    }
  }, [finalTextures]);

  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.userData = { ...meshRef.current.userData, id: item.id, type: item.type, groupId: item.groupId, locked: item.locked };
      registerMesh(item.id, isSelected ? null : meshRef.current);

      // Always register for selection detection (even when selected)
      selectionMeshesRef.current[item.id] = meshRef.current;

      // Auto-update dimensions if missing
      if (item.id && (item.type === 'svg' || item.type === 'model' || item.url) && !item.dimensions && !item.baseDimensions) {
        const geo = svgGeometry || geometry;
        if (geo) {
          if (!geo.boundingBox) geo.computeBoundingBox();
          const size = new THREE.Vector3();
          geo.boundingBox!.getSize(size);
          if (size.length() > 0) {
            onUpdate(item.id, {
              baseDimensions: [size.x, size.y, size.z] as [number, number, number],
              dimensions: [size.x, size.y, size.z] as [number, number, number]
            }, false);
          }
        }
      }
    }
    return () => {
      registerMesh(item.id, null);
      delete selectionMeshesRef.current[item.id];
    };
  }, [item.id, registerMesh, geometry, svgGeometry, isSelected, item.type, item.url, item.dimensions, item.baseDimensions, onUpdate]);



  const mainGizmoMatrix = useMemo(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...item.rotation));
    m.compose(new THREE.Vector3(...item.position), q, new THREE.Vector3(...item.scale));
    return m;
  }, [item.id, ...item.position, ...item.rotation, ...item.scale]);

  const [hovered, setHovered] = useState(false);
  const [labelHovered, setLabelHovered] = useState(false);
  const revealProgress = useRef(0);
  const meshGroupRef = useRef<THREE.Group>(null!);
  const bloomRevealProgress = useRef(0);


  const envData = useMemo(() => {
    // Generate semi-random but deterministic mock data based on item ID
    const hash = item.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    
    let temp = 22; // Default Normal
    
    if (forcedStatus) {
      switch (forcedStatus) {
        case 'Critical': temp = 38 + (hash % 10); break;
        case 'Major': temp = 31 + (hash % 6); break;
        case 'Minor': temp = 26 + (hash % 4); break;
        case 'Warning': temp = 10 + (hash % 7); break;
        default: temp = 18 + (hash % 7); break;
      }
    } else {
      // Fallback if no forced status
      temp = 18 + (hash % 7);
    }

    // Range 30 to 80%
    const humidity = 30 + (hash % 50);
    return { temp, humidity };
  }, [item.id, forcedStatus]);

  const hasBeenRevealed = useRef(false);

  const statusInfo = useMemo(() => {
    if (!item.areaGradient) return null;

    const STATUS_MAP: Record<string, { color: string, label: string, displayLabel: string, intensity: number }> = {
      Critical: { color: '#ff0000', label: 'Critical', displayLabel: language === 'ko' ? '위험' : 'danger', intensity: 4.5 },
      Major: { color: '#ea580c', label: 'Major', displayLabel: language === 'ko' ? '고온' : 'High', intensity: 2.5 },
      Minor: { color: '#fde047', label: 'Minor', displayLabel: language === 'ko' ? '더움' : 'heat', intensity: 0.3 },
      Warning: { color: '#0084ff', label: 'Warning', displayLabel: language === 'ko' ? '저온' : 'Low', intensity: 1.2 },
      Normal: { color: '#3fc026', label: 'Normal', displayLabel: language === 'ko' ? '적정' : 'Normal', intensity: 0.5 }
    };

    // 1. Prioritize manual status selection from item data
    if (item.status && STATUS_MAP[item.status]) {
      return STATUS_MAP[item.status];
    }

    // 2. Use forced status if passed as prop
    if (forcedStatus && STATUS_MAP[forcedStatus]) {
      return STATUS_MAP[forcedStatus];
    }

    // 3. Determine status based on temperature (Fallback)
    const t = envData.temp;
    if (t >= 38) return STATUS_MAP.Critical; // 38+
    if (t >= 31) return STATUS_MAP.Major;    // 31-37
    if (t >= 26) return STATUS_MAP.Minor;    // 26-30
    if (t < 18) return STATUS_MAP.Warning;   // < 18
    return STATUS_MAP.Normal;                // 18-25
  }, [item.areaGradient, item.status, envData.temp, forcedStatus]);



  useFrame((state, delta) => {
    if (item.areaGradient) {
      const selected = isSelected || isPreviewSelected;
      // Suppress animated effects when user is interacting (select or hover/pinned)
      const interacting = selected || labelHovered || isPinned;

      const isNormal = statusInfo?.label === 'Normal';
      
      // Keep track of whether a problem area has ever been revealed by areasFadeIn
      if (!isNormal && areasFadeIn) {
        hasBeenRevealed.current = true;
      }

      // Problem areas reveal when areasFadeIn is triggered, then stay visible.
      // Normal areas still depend on areasFadeIn or interaction.
      const shouldShowByStatus = isNormal ? areasFadeIn : (areasFadeIn || hasBeenRevealed.current);
      const target = (interacting || shouldShowByStatus) ? 1 : 0;
      revealProgress.current = THREE.MathUtils.lerp(revealProgress.current, target, delta * 8);

      // Reveal bloom gradually based on global state
      const bloomTarget = (areasFadeIn) ? 1 : 0;
      bloomRevealProgress.current = THREE.MathUtils.lerp(bloomRevealProgress.current, bloomTarget, delta * 1.2);

      // All status areas use the same pulse logic, but Normal stays static (no pulse)
      const pulse = (statusInfo && statusInfo.label !== 'Normal') ? (Math.sin(state.clock.elapsedTime * 3.5) * 0.35 + 0.65) : 1;

      if (meshGroupRef.current) {
        meshGroupRef.current.traverse(child => {
          if ((child as any).isMesh && (child as any).material) {
            const mat = (child as any).material;
            const isNormal = statusInfo?.label === 'Normal';
            // ARC-FIX: Normal areas are 0 opacity by default, 1.0 when interacting (hover/select)
            const baseOpacity = isNormal ? (interacting ? 0.7 : 0) : (item.areaGradient ? 0.5 : 1.0);

            mat.opacity = revealProgress.current * baseOpacity * pulse;
            mat.visible = revealProgress.current > 0.01 && (isNormal ? interacting : true);

            if (statusInfo) {
              mat.color.set(statusInfo.color);
              // Normal areas never glow (emissive 0)
              if (isNormal) {
                mat.emissive.set('#3fc026');
                mat.emissiveIntensity = 0.5;
              } else {
                mat.emissive.set(statusInfo.color);
                mat.emissiveIntensity = statusInfo.intensity * bloomRevealProgress.current;
              }
            } else {
              mat.color.set('#3fc026');
            }
          }
        });
      }
    }
  });

  return (
    <>
      {item.url && (
        <ModelErrorBoundary url={item.url}>
          <Suspense fallback={null}>
            <ModelLayer url={item.url} onModelLoaded={setLoadedScene} />
          </Suspense>
        </ModelErrorBoundary>
      )}
      <group
        ref={groupRef}
        visible={item.visible !== false}
        position={item.position}
        rotation={item.rotation}
        scale={item.scale}
        userData={{ id: item.id, isFurniture: true, locked: item.locked }}
        onPointerDown={item.locked ? undefined : ((e) => { pointerDownPos.current = { x: e.clientX, y: e.clientY }; })}
        onPointerUp={item.locked ? undefined : ((e) => {
          if (pointerDownPos.current) {
            const dx = e.clientX - pointerDownPos.current.x;
            const dy = e.clientY - pointerDownPos.current.y;
            if (Math.sqrt(dx * dx + dy * dy) < 10) { e.stopPropagation(); onSelect(item.id, e.shiftKey || e.ctrlKey || e.metaKey); }
            pointerDownPos.current = null;
          }
        })}
        onPointerOver={item.locked || isSelected ? undefined : ((e) => { e.stopPropagation(); setHovered(true); })}
        onPointerOut={item.locked || isSelected ? undefined : (() => setHovered(false))}
      >
        {item.areaGradient && (
          <Html
            position={[0, (item.extrusion || 3) / 2, 0]}
            center
            wrapperClass={(labelHovered || isPinned) ? '!z-[30]' : '!z-[20]'}
            style={{
              pointerEvents: 'none',
              userSelect: 'none'
            }}
          >
            <div className="relative flex flex-col items-center">
              <div
                className="bg-black/60 backdrop-blur-md px-2 py-[2px] rounded-full border text-white text-[10px] font-black uppercase tracking-normal shadow-[0_5px_15px_rgba(0,0,0,0.5)] flex items-center gap-[4px] whitespace-nowrap pointer-events-auto cursor-pointer transition-all hover:scale-105"
                style={{
                  borderColor: (statusInfo && statusInfo.label !== 'Normal') ? statusInfo.color : 'rgba(255, 255, 255, 0.2)',
                  borderWidth: (statusInfo && statusInfo.label !== 'Normal') ? '2px' : '1px'
                }}
                onPointerOver={() => setLabelHovered(true)}
                onPointerOut={() => setLabelHovered(false)}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onPin) {
                    // Toggle pin state or switch to new ID
                    onPin(isPinned ? null : item.id);
                  }
                  onFitToSelection(item.id);
                }}
              >
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    backgroundColor: statusInfo ? statusInfo.color : '#3fc026',
                    boxShadow: `0 0 8px ${statusInfo ? statusInfo.color : '#3fc026'}`
                  }}
                />
                {item.name}
              </div>

              {(labelHovered || isPinned) && (() => {
                const tempVal = envData.temp;
                const humidVal = envData.humidity;
                
                const tempLeftColor = (() => {
                  if (!statusInfo) return '#3fc026';
                  switch (statusInfo.label) {
                    case 'Critical': return '#ea580c'; // Major color (Orange)
                    case 'Major': return '#fde047';    // Minor color (Yellow)
                    case 'Minor': return '#3fc026';    // Normal color (Green)
                    case 'Normal': return '#bef264';   // Light green (연두)
                    case 'Warning': return '#38bdf8';  // Skyblue (하늘색)
                    default: return '#3fc026';
                  }
                })();

                return (
                  <div className="absolute bottom-full mb-2 bg-black/60 backdrop-blur-md border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.8)] rounded-2xl p-3.5 animate-in fade-in zoom-in duration-200 pointer-events-none min-w-[150px] flex flex-col gap-3">
                    <div className="text-[9px] font-black text-white/70 uppercase tracking-widest border-b border-white/10 pb-1.5 flex justify-between items-center">
                      <span>{item.name}</span>
                      <span className="text-teal-400 font-bold flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shadow-[0_0_8px_#2dd4bf] animate-pulse"></span>
                        Live
                      </span>
                    </div>
                    <div className="flex flex-col gap-3 pt-0.5">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-end text-[10px] leading-none">
                          <span className="text-white/60 font-medium">{language === 'ko' ? '온도' : 'Temp'}</span>
                          <span className="text-white font-mono font-bold text-[13px] leading-none">{tempVal.toFixed(1)}<span className="text-white/40 text-[9px] ml-0.5">°C</span></span>
                        </div>
                        <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                          <div 
                            className="h-full rounded-full transition-all duration-500" 
                            style={{ 
                              width: `${Math.min(100, Math.max(0, ((tempVal - 10) / 30) * 100))}%`,
                              background: `linear-gradient(to right, ${tempLeftColor}, ${statusInfo?.color || '#3fc026'})`
                            }} 
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-end text-[10px] leading-none">
                          <span className="text-white/60 font-medium">{language === 'ko' ? '습도' : 'Humidity'}</span>
                          <span className="text-white font-mono font-bold text-[13px] leading-none">{humidVal}<span className="text-white/40 text-[9px] ml-0.5">%</span></span>
                        </div>
                        <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full" style={{ width: `${humidVal}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </Html>
        )}

        <group ref={meshGroupRef}>
          {model ? (
            <primitive object={model} ref={meshRef} />
          ) : (
            <>
              {item.type === 'sphere' ? (
                <Center top>
                  <mesh
                    ref={meshRef}
                    userData={{ id: item.id, isFurniture: true, locked: item.locked }}
                    castShadow={item.castShadow !== undefined ? item.castShadow : (!!realtimeShadows && (texConfig?.opacity ?? 1) > 0.8)}
                    receiveShadow={!!realtimeShadows}
                    renderOrder={isSelected || isPreviewSelected ? 20 : (texConfig?.opacity ?? 1) < 0.99 ? 10 : 0}
                    frustumCulled={false}
                  >
                    <sphereGeometry args={[(item.dimensions?.[0] || 1.5) / 2, 64, 64]} />
                    <meshStandardMaterial
                      color={(item.textureId && item.textureId !== 'none') ? (texConfig?.color || "#ffffff") : (item.color || texConfig?.color || (isSelected || isPreviewSelected ? "#60a5fa" : "#94a3b8"))}
                      map={finalTextures?.color || null}
                      normalMap={finalTextures?.normal || null}
                      roughnessMap={finalTextures?.roughness || null}
                      metalnessMap={finalTextures?.metalness || null}
                      envMap={null}
                      metalness={item.glassMetalness ?? 1.0}
                      roughness={item.glassRoughness ?? 0.5}
                      envMapIntensity={item.showReflection === false ? 0 : (item.envMapIntensity ?? 1.0)}
                      transparent={(texConfig?.opacity ?? 1) < 0.99 || !!finalTextures?.opacity}
                      opacity={texConfig?.opacity ?? 1}
                      side={item.flipNormals ? THREE.BackSide : THREE.DoubleSide}
                    />
                  </mesh>
                </Center>
              ) : item.type === 'clock' ? (
                <DigitalClock ref={meshRef} color={item.color} emissiveIntensity={item.emissiveIntensity} />
              ) : (
                <mesh
                  ref={meshRef}
                  visible={item.type !== 'model'}
                  geometry={geometry as any}
                  userData={{ id: item.id, isFurniture: true, locked: item.locked }}
                  castShadow={item.castShadow !== undefined ? item.castShadow : (!!realtimeShadows && (texConfig?.opacity ?? 1) > 0.8)}
                  receiveShadow={!!realtimeShadows}
                  renderOrder={isSelected || isPreviewSelected ? 20 : (texConfig?.opacity ?? 1) < 0.99 ? 10 : 0}
                  frustumCulled={false}
                >
                  {texConfig?.showReflection && (item.type === 'plane' || (item.type === 'svg' && (item.extrusion ?? 0) < 0.5)) ? (
                    <>
                      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
                      <mesh
                        geometry={reflectionGeometry as any}
                        rotation={[-Math.PI / 2, 0, 0]}
                        castShadow={item.castShadow !== undefined ? item.castShadow : (!!realtimeShadows && (texConfig?.opacity ?? 1) > 0.8)}
                        receiveShadow={!!realtimeShadows}
                      >
                        <MeshReflectorMaterial
                          mirror={texConfig.reflectivity ?? 1}
                          blur={[texConfig.blurX ?? 300, texConfig.blurY ?? 300]}
                          mixStrength={texConfig.mixStrength ?? 10}
                          resolution={texConfig.resolution ?? 2048}
                          mixBlur={texConfig.mixBlur ?? 10}
                          mixContrast={1}
                          depthScale={texConfig.depthScale ?? 0.5}
                          minDepthThreshold={texConfig.minDepth ?? 0.4}
                          maxDepthThreshold={texConfig.maxDepth ?? 1.4}
                          depthToBlurRatioBias={0.25}
                          distortion={0}
                          color={(item.textureId && item.textureId !== 'none') ? (texConfig?.color || "#ffffff") : (item.color || texConfig?.color || (isSelected || isPreviewSelected ? "#60a5fa" : "#94a3b8"))}
                          map={finalTextures?.color || null}
                          normalMap={finalTextures?.normal || null}
                          roughnessMap={finalTextures?.roughness || null}
                          metalnessMap={finalTextures?.metalness || null}
                          aoMap={finalTextures?.ao || null}
                          displacementMap={finalTextures?.displacement || null}
                          displacementScale={item.displacementScale ?? texConfig?.displacementScale ?? 0.1}
                          emissiveMap={finalTextures?.emissive || null}
                          emissive={(item.textureId && item.textureId !== 'none') ? (texConfig?.color || '#000000') : (statusInfo ? statusInfo.color : (item.color || texConfig?.color || '#000000'))}
                          emissiveIntensity={statusInfo ? 0 : (texConfig?.emissiveIntensity ?? (item.emissiveIntensity || 0))}
                          alphaMap={areaAlphaMap || finalTextures?.opacity || null}
                          metalness={item.type === 'sphere' ? (item.glassMetalness ?? 1.0) : (texConfig?.metalness ?? 0.1)}
                          roughness={item.type === 'sphere' ? (item.glassRoughness ?? 0.5) : (texConfig?.roughness ?? 0.7)}
                          envMapIntensity={item.showReflection === false ? 0 : (item.envMapIntensity ?? 1.0)}
                          transparent={(texConfig?.opacity ?? 1) < 0.99 || !!finalTextures?.opacity || !!item.areaGradient}
                          opacity={item.areaGradient ? 0.5 : (texConfig?.opacity ?? 1)}
                          depthWrite={item.areaGradient ? false : ((texConfig?.opacity ?? 1) > 0.8 && !finalTextures?.opacity)}
                          depthTest={true}
                          alphaTest={finalTextures?.opacity ? 0.05 : 0}
                          side={item.flipNormals ? THREE.BackSide : item.doubleSide === true || item.type === 'sphere' ? THREE.DoubleSide : THREE.FrontSide}
                          shadowSide={item.flipNormals ? THREE.BackSide : item.doubleSide === true || item.type === 'sphere' ? THREE.DoubleSide : THREE.FrontSide}
                        />
                      </mesh>
                    </>
                  ) : (
                    <meshStandardMaterial
                      color={statusInfo ? statusInfo.color : (item.textureId && item.textureId !== 'none') ? (texConfig?.color || "#ffffff") : (item.color || texConfig?.color || (isSelected || isPreviewSelected ? "#60a5fa" : "#94a3b8"))}
                      vertexColors={(() => {
                        const lowerId = (item.id || '').toLowerCase();
                        const lowerGroup = (item.groupId || '').toLowerCase();
                        const isWall = (lowerId.includes('wall') || lowerGroup.includes('wall')) &&
                          !lowerId.includes('floor') && !lowerId.includes('ceiling');
                        const isGlass = lowerId.includes('glass') || lowerGroup.includes('glass');
                        return isWall || item.type === 'box' || isGlass;
                      })()}
                      onBeforeCompile={(shader) => {
                        // ARC-FIX: Make Black Top opaque and matte even on transparent/reflective glass
                        shader.fragmentShader = shader.fragmentShader.replace(
                          '#include <roughnessmap_fragment>',
                          `#include <roughnessmap_fragment>
                         #ifdef USE_COLOR
                           if (vColor.r < 0.1) roughnessFactor = 1.0;
                         #endif`
                        );
                        shader.fragmentShader = shader.fragmentShader.replace(
                          '#include <metalnessmap_fragment>',
                          `#include <metalnessmap_fragment>
                         #ifdef USE_COLOR
                           if (vColor.r < 0.1) metalnessFactor = 0.0;
                         #endif`
                        );
                        shader.fragmentShader = shader.fragmentShader.replace(
                          '#include <alphamap_fragment>',
                          `#include <alphamap_fragment>
                         #ifdef USE_COLOR
                           if (vColor.r < 0.1) diffuseColor.a = 1.0;
                         #endif`
                        );
                      }}
                      map={finalTextures?.color || null}
                      normalMap={finalTextures?.normal || null}
                      roughnessMap={finalTextures?.roughness || null}
                      metalnessMap={finalTextures?.metalness || null}
                      aoMap={finalTextures?.ao || null}
                      displacementMap={finalTextures?.displacement || null}
                      displacementScale={item.displacementScale ?? texConfig?.displacementScale ?? 0.1}
                      emissiveMap={finalTextures?.emissive || null}
                      emissive={statusInfo ? statusInfo.color : (item.textureId && item.textureId !== 'none') ? (texConfig?.color || '#000000') : (item.color || texConfig?.color || '#000000')}
                      emissiveIntensity={statusInfo ? 0 : (texConfig?.emissiveIntensity ?? (item.emissiveIntensity || 0))}
                      alphaMap={areaAlphaMap || finalTextures?.opacity || null}
                      metalness={item.type === 'sphere' ? (item.glassMetalness ?? 1.0) : (texConfig?.metalness ?? 0.1)}
                      roughness={item.type === 'sphere' ? (item.glassRoughness ?? 0.5) : (texConfig?.roughness ?? 0.7)}
                      envMapIntensity={item.showReflection === false ? 0 : (item.envMapIntensity ?? 1.0)}
                      transparent={fade < 1 || (texConfig?.opacity ?? 1) < 0.99 || !!finalTextures?.opacity || !!item.areaGradient}
                      opacity={(item.areaGradient ? (item.glassOpacity ?? 0.2) : (texConfig?.opacity ?? 1)) * fade}
                      depthWrite={fade < 0.9 ? false : (item.areaGradient ? false : ((texConfig?.opacity ?? 1) > 0.8 && !finalTextures?.opacity))}
                      depthTest={true}
                      alphaTest={finalTextures?.opacity ? 0.05 : 0}
                      side={item.flipNormals ? THREE.BackSide : item.doubleSide === true || item.type === 'sphere' ? THREE.DoubleSide : THREE.FrontSide}
                      shadowSide={item.flipNormals ? THREE.BackSide : item.doubleSide === true || item.type === 'sphere' ? THREE.DoubleSide : THREE.FrontSide}
                    />
                  )}
                </mesh>
              )}
            </>
          )}
        </group>
        <mesh
          geometry={geometry as any}
          position={model ? model.position : undefined}
          userData={{ isGizmo: true }}
          renderOrder={1000} // Ensure it's rendered after everything else
        >
          <meshBasicMaterial
            color={(isSelected && item.locked) ? "#eab308" : (isBoxSelecting ? isPreviewSelected : isSelected) ? "#38CC15" : (!isBoxSelecting && ctrlPressed && hovered) ? "#eab308" : "#38CC15"}
            wireframe
            transparent
            opacity={0.3}
            visible={(isBoxSelecting ? isPreviewSelected : isSelected) || (!isBoxSelecting && ctrlPressed && hovered)}
            depthTest={true}
            polygonOffset
            polygonOffsetFactor={-4} // Increased factor to push it significantly towards the camera
            polygonOffsetUnits={-4}
          />
        </mesh>
        {isSelected && item.subtractions?.map(sub => (
          <SubtractionGizmo
            key={sub.id}
            sub={sub}
            item={item}
            isSelected={selectedSubId === sub.id}
            onSelectSub={onSelectSub}
            onUpdate={onUpdate}
            setIsDragging={setIsDragging}
          />
        ))}

      </group>

      {isSelected && isLastSelected && !multiSelect && !selectedSubId && !item.locked && (
        <PivotControls
          matrix={mainGizmoMatrix}
          autoTransform={false}
          depthTest={false}
          fixed={true}
          scale={60}
          lineWidth={2}
          activeAxes={gizmoMode === 'texture' ? [true, false, true] : [true, true, true]}
          axisColors={['#FF4458', '#38CC15', '#3D8BFB']}
          hoveredColor="#fde047"
          opacity={1.0}
          renderOrder={999}
          onDragStart={() => {
            onUpdate(item.id, {}, true);
            setIsDragging(true);
          }}
          onDrag={(matrix) => {
            const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
            matrix.decompose(pos, quat, scl);
            const rot = new THREE.Euler().setFromQuaternion(quat);

            if (gizmoMode === 'texture') {
              // Texture Gizmo: Use delta to shift offset (X and Z are horizontal plane)
              // Invert both axes for opposite response. Reduced sensitivity for precision (0.2 instead of 0.5)
              const deltaX = (pos.x - item.position[0]) * -0.2;
              const deltaZ = (pos.z - item.position[2]) * 0.2;
              onUpdate(item.id, {
                textureOffset: [currentOff[0] + deltaX, currentOff[1] + deltaZ]
              }, false);
              return;
            }

            onUpdate(item.id, {
              position: [pos.x, pos.y, pos.z],
              rotation: [rot.x, rot.y, rot.z],
              scale: [scl.x, scl.y, scl.z],
            }, false);
          }}
          onDragEnd={() => {
            onUpdate(item.id, {
              position: item.position,
              rotation: item.rotation,
              scale: item.scale,
              textureOffset: item.textureOffset
            }, false);
            setIsDragging(false);
          }}
        />
      )}
    </>
  );
}, (prev, next) => {
  return (
    prev.isSelected === next.isSelected &&
    prev.isPreviewSelected === next.isPreviewSelected &&
    prev.item === next.item &&
    prev.customTextures === next.customTextures &&
    prev.gizmoMode === next.gizmoMode &&
    prev.selectedSubId === next.selectedSubId &&
    prev.isBoxSelecting === next.isBoxSelecting &&
    prev.multiSelect === next.multiSelect &&
    prev.showReflection === next.showReflection &&
    prev.onFitToSelection === next.onFitToSelection &&
    prev.areasFadeIn === next.areasFadeIn
  );
});
