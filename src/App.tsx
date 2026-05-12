import React, { useState, useCallback, useEffect, useRef } from 'react';
import { AppState, FurnitureItem, FurnitureType, TextureConfig } from './types';
import { Scene } from './components/Scene';
import { UI } from './components/UI';
import { accentRgba, syncThemeColors } from './theme';

import * as THREE from 'three';
// @ts-ignore
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader';
import { v4 as uuidv4 } from 'uuid';
import { motion, AnimatePresence } from 'framer-motion';
// @ts-ignore
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter';
// @ts-ignore
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
// @ts-ignore
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
import { Box, Loader2 } from 'lucide-react';

const staticTextures: TextureConfig[] = [];

const initialState: AppState = {
  items: [],
  selectedIds: [],
  lights: [
    {
      id: uuidv4(),
      name: 'Main Directional Light',
      type: 'directional',
      enabled: true,
      position: [15.29, 14.70, 109.67],
      intensity: 0.36,
      color: '#ffffff',
      castShadow: false,
      shadowRadius: 15
    }
  ],
  customTextures: [
    { id: '9c9fb578-4db0-4593-859f-31c77874329e', name: 'glass', color: '#5c5d84', opacity: 0.3, metalness: 1, roughness: 0.23, isCustom: true },
    { id: '40105356-f6d7-4dde-81bb-32022ec0ebc9', name: 'floor', color: '#97a1b4', opacity: 1, metalness: 0.18, roughness: 0.83, isCustom: true, showReflection: true, reflectivity: 0, blurX: 2000, blurY: 2000, mixStrength: 1, mixBlur: 27, resolution: 1024, depthScale: 0, minDepth: 0, maxDepth: 0 },
    { id: 'f7242ee2-04ee-4cb5-ad35-4bc67816ff04', name: 'wall', color: '#b5c7e8', opacity: 1, metalness: 0.1, roughness: 0.7, isCustom: true },
    { id: 'e6adf2f6-9cbc-4a98-b985-352a545714a2', name: 'etc', color: '#c2d4f0', opacity: 1, metalness: 0.1, roughness: 0.7, isCustom: true },
    { id: 'abb90572-74c9-4ea8-a2a3-f3b4eddfbbcc', name: 'display', color: '#2e2e2e', opacity: 1, metalness: 0.87, roughness: 0.1, isCustom: true }
  ],
  environment: 'city',
  intensity: 0.48,
  zoomPercent: 30,
  unit: 'm',
  realtimeShadows: true,
  showEnvironment: true,
  showGrid: true,
  gizmoMode: 'translate',
  vignetteSize: 0.3,
  vignetteDarkness: 0.3,
  bloomIntensity: 0.8,
  bloomThreshold: 0,
  bloomSmoothing: 0,
  environmentBlur: 1,
  gridColor: '#ffffff',
  showBackgroundColor: true,
  backgroundColor: '#757b95',
  backgroundType: 'radial',
  backgroundStops: [
    { color: '#b3bddb', offset: 0 },
    { color: '#383c4d', offset: 100 }
  ],
  backgroundAngle: 133,
  language: 'en',
  contactShadows: false,
  floorplanPersistedState: null,
  showFloorplanModal: false
};

export const PRESET_MAPPINGS: { [key: string]: { textureId: string, height: number, posY: number, showBlackTop?: boolean } } = {
  'floor': { textureId: '40105356-f6d7-4dde-81bb-32022ec0ebc9', height: 0, posY: -0.005 },
  'ceiling': { textureId: '40105356-f6d7-4dde-81bb-32022ec0ebc9', height: 0, posY: 2.5 },
  'glass': { textureId: '9c9fb578-4db0-4593-859f-31c77874329e', height: 2, posY: 0, showBlackTop: true },
  'wall': { textureId: 'f7242ee2-04ee-4cb5-ad35-4bc67816ff04', height: 2, posY: 0, showBlackTop: true },
  'wood': { textureId: 'f7242ee2-04ee-4cb5-ad35-4bc67816ff04', height: 2, posY: 0 },
  'board': { textureId: 'e6adf2f6-9cbc-4a98-b985-352a545714a2', height: 2, posY: 0 },
  'interior': { textureId: 'e6adf2f6-9cbc-4a98-b985-352a545714a2', height: 1, posY: 0.83 },
  'displayg': { textureId: 'abb90572-74c9-4ea8-a2a3-f3b4eddfbbcc', height: 2, posY: 0.8 },
  'display': { textureId: 'abb90572-74c9-4ea8-a2a3-f3b4eddfbbcc', height: 1.0, posY: 0.96 },
  'high': { textureId: 'e6adf2f6-9cbc-4a98-b985-352a545714a2', height: 1.86, posY: 0 },
  'low': { textureId: 'e6adf2f6-9cbc-4a98-b985-352a545714a2', height: 0.4, posY: 0 },
  'bookcase': { textureId: 'e6adf2f6-9cbc-4a98-b985-352a545714a2', height: 1.8, posY: 0 },
  'lockers': { textureId: 'e6adf2f6-9cbc-4a98-b985-352a545714a2', height: 1.8, posY: 0 },
  'chair_high': { textureId: 'e6adf2f6-9cbc-4a98-b985-352a545714a2', height: 0.7, posY: 0 },
  'chair_low': { textureId: 'e6adf2f6-9cbc-4a98-b985-352a545714a2', height: 0.4, posY: 0 },
  'chair': { textureId: 'e6adf2f6-9cbc-4a98-b985-352a545714a2', height: 0.5, posY: 0 },
  'table_high': { textureId: 'e6adf2f6-9cbc-4a98-b985-352a545714a2', height: 1, posY: 0 },
  'table_low': { textureId: 'e6adf2f6-9cbc-4a98-b985-352a545714a2', height: 0.6, posY: 0 },
  'table': { textureId: 'e6adf2f6-9cbc-4a98-b985-352a545714a2', height: 0.7, posY: 0 },
  'desk': { textureId: 'e6adf2f6-9cbc-4a98-b985-352a545714a2', height: 0.7, posY: 0 },
  'rack': { textureId: 'e6adf2f6-9cbc-4a98-b985-352a545714a2', height: 1.8, posY: 0 },
};

const expandSelectionWithGroups = (ids: string[], items: FurnitureItem[]): string[] => {
  const expandedIds = new Set(ids);
  const groupIds = new Set<string>();
  ids.forEach(id => {
    const item = items.find(i => i.id === id);
    if (item && item.groupId) groupIds.add(item.groupId);
  });
  if (groupIds.size > 0) {
    items.forEach(item => {
      if (item.groupId && groupIds.has(item.groupId)) {
        expandedIds.add(item.id);
      }
    });
  }
  return Array.from(expandedIds);
};

export default function App() {
  const [state, setState] = useState<AppState>(initialState);
  const [previewSelectedIds, setPreviewSelectedIds] = useState<string[]>([]);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [history, setHistory] = useState<AppState[]>([]);
  const [redoStack, setRedoStack] = useState<AppState[]>([]);
  const [fitSignal, setFitSignal] = useState(0);
  const [fitTargetId, setFitTargetId] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState<{ active: boolean, type: string, progress: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const zoomRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<any>(null);
  const viewCenterRef = useRef<[number, number, number]>([0, 0, 0]);

  // 테마 색상 동기화 (JS -> CSS Variables)
  useEffect(() => {
    syncThemeColors();
  }, []);

  useEffect(() => {
    // Automatically load initial scene if available from /plan/scene.json
    const loadInitialScene = async () => {
      try {
        const response = await fetch('/plan/scene.json');
        if (response.ok) {
          setIsLoading(true);
          const imported = await response.json() as AppState;
          
          // Automatic migration from .gltf to .glb for legacy scene files
          if (imported.items) {
            imported.items = imported.items.map(item => {
              if (item.url && item.url.endsWith('.gltf')) {
                return { ...item, url: item.url.replace('.gltf', '.glb') };
              }
              return item;
            });
          }

          setState({ ...imported, selectedIds: [], areasFadeIn: false });
          
          // Wait for stabilization (meshes created) before triggering fit
          setTimeout(() => {
            setFitSignal(s => s + 1);
            // Reveal areas after fit animation starts
            setTimeout(() => {
              setState(prev => ({ ...prev, areasFadeIn: true }));
              setIsLoading(false);
            }, 500);
          }, 800);
        }
      } catch (err) {
        console.warn('Initial scene.json not found in /plan/ or failed to load.');
      }
    };
    loadInitialScene();
  }, []);

  const [shiftPressed, setShiftPressed] = useState(false);
  const [ctrlPressed, setCtrlPressed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isDraggingViewport, setIsDraggingViewport] = useState(false);

  const saveToHistory = useCallback((newState: AppState) => {
    setHistory(prev => [...prev.slice(-19), state]);
    setRedoStack([]);
  }, [state]);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setRedoStack(rs => [...rs, state]);
    setHistory(h => h.slice(0, -1));
    setState(prev);
  }, [history, state]);

  const handleUpdateState = useCallback((updates: Partial<AppState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setHistory(h => [...h, state]);
    setRedoStack(rs => rs.slice(0, -1));
    setState(next);
  }, [redoStack, state]);

  const handleGroup = useCallback(() => {
    setState(prev => {
      const selectedItemsCount = prev.items.filter(i => prev.selectedIds.includes(i.id)).length;
      if (selectedItemsCount < 2) return prev;
      saveToHistory(prev);
      const newGroupId = uuidv4();
      return {
        ...prev,
        items: prev.items.map(item => prev.selectedIds.includes(item.id) ? { ...item, groupId: newGroupId } : item)
      };
    });
  }, [saveToHistory]);

  const handleUngroup = useCallback(() => {
    setState(prev => {
      const hasGroupedItems = prev.items.some(i => prev.selectedIds.includes(i.id) && i.groupId);
      if (!hasGroupedItems) return prev;
      saveToHistory(prev);
      return {
        ...prev,
        items: prev.items.map(item => prev.selectedIds.includes(item.id) ? { ...item, groupId: undefined } : item)
      };
    });
  }, [saveToHistory]);

  const handleAddItem = (type: FurnitureType, data?: string, name?: string) => {
    saveToHistory(state);
    const newItem: FurnitureItem = {
      id: uuidv4(),
      type,
      name: name || `New ${type.charAt(0).toUpperCase() + type.slice(1)}`,
      position: [viewCenterRef.current[0], 0, viewCenterRef.current[2]] as [number, number, number],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: '#ffffff',
      locked: true,
      subtractions: []
    };
    if (type === 'svg') {
      newItem.svgData = data;
      newItem.rotation = [0, 0, 0];
    } else if (type === 'model') {
      newItem.url = data;
    } else if (type === 'clock') {
      newItem.dimensions = [1.2, 0.85, 0.05];
    } else if (type === 'sphere') {
      newItem.dimensions = [1.5, 1.5, 1.5];
      newItem.glassMetalness = 1.0;
      newItem.glassRoughness = 0.5;
    } else {
      newItem.url = data;
    }
    setState(prev => ({ ...prev, items: [...prev.items, newItem], selectedIds: [newItem.id] }));
    setSelectedSubId(null);
  };

  const handleSelectSub = (subId: string | null) => {
    setSelectedSubId(subId);
  };

  const handleSelect = (id: string | null, multi = false, isGroupSelect = false) => {
    // If selecting a new object, clear the active sub-selection
    if (!id || (!isGroupSelect && !state.selectedIds.includes(id))) {
      setSelectedSubId(null);
    }

    if (!id) {
      if (!multi) setState(prev => ({ ...prev, selectedIds: [], gizmoMode: 'translate' }));
      return;
    }

    setState(prev => {
      let idsToToggle: string[] = [];
      if (isGroupSelect) {
        idsToToggle = prev.items.filter(i => i.groupId === id).map(i => i.id);
      } else {
        idsToToggle = [id];
      }

      if (multi) {
        const newIds = new Set(prev.selectedIds);
        const allSelected = idsToToggle.every(tid => newIds.has(tid));

        if (allSelected) {
          idsToToggle.forEach(tid => newIds.delete(tid));
        } else {
          idsToToggle.forEach(tid => newIds.add(tid));
        }
        return { ...prev, selectedIds: Array.from(newIds) };
      } else {
        return { ...prev, selectedIds: idsToToggle };
      }
    });
  };

  const handleDeleteItems = useCallback(() => {
    if (state.selectedIds.length === 0) return;
    saveToHistory(state);
    setState({
      ...state,
      items: state.items.filter(item => !state.selectedIds.includes(item.id)),
      lights: state.lights.filter(light => !state.selectedIds.includes(light.id)),
      selectedIds: []
    });
    setSelectedSubId(null);
  }, [state, saveToHistory]);

  const handleUpdateItem = (id: string, updates: Partial<FurnitureItem>, undoable = true) => {
    if (undoable) saveToHistory(state);
    setState(prev => {
      const isLocking = updates.locked === true;
      const nextSelectedIds = isLocking
        ? prev.selectedIds.filter(sid => sid !== id)
        : prev.selectedIds;

      return {
        ...prev,
        selectedIds: nextSelectedIds,
        items: prev.items.map(item => item.id === id ? { ...item, ...updates } : item)
      };
    });
  };

  const handleUpdateLight = (id: string, updates: Partial<any>, undoable = false) => {
    if (undoable) saveToHistory(state);
    setState(prev => ({
      ...prev,
      lights: prev.lights.map(light => light.id === id ? { ...light, ...updates } : light)
    }));
  };

  const handleAddLight = (type: string) => {
    saveToHistory(state);
    const newLight = {
      id: uuidv4(),
      name: `New ${type.charAt(0).toUpperCase() + type.slice(1)} Light`,
      type: type as any,
      enabled: true,
      position: [viewCenterRef.current[0], 4, viewCenterRef.current[2]] as [number, number, number],
      intensity: type === 'ambient' ? 0.5 : 1,
      color: '#ffffff',
      distance: 10,
      decay: 2,
      castShadow: true,
      angle: Math.PI / 3,
      penumbra: 0.1,
      rotation: [0, 0, 0] as [number, number, number],
      shape: 'sphere' as any
    };
    setState(prev => ({
      ...prev,
      lights: [...prev.lights, newLight],
      selectedIds: [newLight.id]
    }));
    setSelectedSubId(null);
  };

  const handleUpdateItems = (updatesMap: { [id: string]: Partial<FurnitureItem> }, undoable = true) => {
    if (undoable) saveToHistory(state);
    setState(prev => {
      const lockedIds = Object.entries(updatesMap)
        .filter(([_, up]) => up.locked === true)
        .map(([id]) => id);

      const nextSelectedIds = prev.selectedIds.filter(sid => !lockedIds.includes(sid));

      return {
        ...prev,
        selectedIds: nextSelectedIds,
        items: prev.items.map(item => updatesMap[item.id] ? { ...item, ...updatesMap[item.id] } : item)
      };
    });
  };

  const handleUpdateLights = (updatesMap: { [id: string]: Partial<any> }, undoable = true) => {
    if (undoable) saveToHistory(state);
    setState(prev => ({
      ...prev,
      lights: prev.lights.map(light => updatesMap[light.id] ? { ...light, ...updatesMap[light.id] } : light)
    }));
  };

  const [expandedLights, setExpandedLights] = useState<Set<string>>(new Set());
  const [showGizmos, setShowGizmos] = useState(false);

  const toggleAllLightsStatus = () => {
    saveToHistory(state);
    const anyEnabled = state.lights.some(l => l.enabled);
    setState(prev => ({
      ...prev,
      lights: prev.lights.map(l => ({ ...l, enabled: !anyEnabled }))
    }));
  };

  const handleAlign = (axis: 0 | 1 | 2, type: 'min' | 'center' | 'max') => {
    if (state.selectedIds.length < 2) return;
    saveToHistory(state);
    const selected = state.items.filter(o => state.selectedIds.includes(o.id));
    const values = selected.map(o => o.position[axis]);

    let targetValue = 0;
    if (type === 'min') targetValue = Math.min(...values);
    else if (type === 'max') targetValue = Math.max(...values);
    else targetValue = values.reduce((a, b) => a + b, 0) / values.length;

    const updates: { [id: string]: Partial<FurnitureItem> } = {};
    state.selectedIds.forEach(id => {
      const item = state.items.find(o => o.id === id);
      if (item) {
        const newPos = [...item.position] as [number, number, number];
        newPos[axis] = targetValue;
        updates[id] = { position: newPos };
      }
    });
    handleUpdateItems(updates, false);
  };

  const handleDistribute = (axis: 0 | 1 | 2) => {
    if (state.selectedIds.length < 3) return;
    saveToHistory(state);
    const selected = state.items.filter(o => state.selectedIds.includes(o.id));
    const sorted = [...selected].sort((a, b) => a.position[axis] - b.position[axis]);

    const min = sorted[0].position[axis];
    const max = sorted[sorted.length - 1].position[axis];
    const count = sorted.length;
    const step = (max - min) / (count - 1);

    const updates: { [id: string]: Partial<FurnitureItem> } = {};
    sorted.forEach((o, index) => {
      const newPos = [...o.position] as [number, number, number];
      newPos[axis] = min + index * step;
      updates[o.id] = { position: newPos };
    });
    handleUpdateItems(updates, false);
  };

  const handleBoxSelect = (ids: string[], isFinal: boolean) => {
    if (isFinal) {
      setState(prev => ({ ...prev, selectedIds: ids }));
      setPreviewSelectedIds([]);
    } else {
      setPreviewSelectedIds(ids);
    }
  };

  const exportScene = (mode: 'all' | 'objects' | 'lights' | 'json' = 'json') => {
    setExportProgress({ active: true, type: mode === 'json' ? 'JSON' : 'GLB', progress: 0 });

    if (mode === 'json') {
      setTimeout(() => {
        const data = JSON.stringify(state, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `scene-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        setExportProgress(null);
      }, 500);
      return;
    }

    if (!sceneRef.current) return;
    const { scene } = sceneRef.current;
    const exporter = new GLTFExporter();

    // Create a temporary scene for selective export
    const exportScene = new THREE.Scene();

    scene.traverse((obj: any) => {
      // Check for furniture objects (only at top level group)
      const isFurniture = obj.userData?.isFurniture && obj instanceof THREE.Group;
      // Check for lights
      const isLight = (obj.userData?.isLight || obj instanceof THREE.Light) && (obj.parent === scene || obj.parent?.userData?.isLight);

      if (mode === 'all') {
        if (isFurniture || isLight) {
          const clone = obj.clone();
          // Clean up gizmos inside the clone
          clone.traverse((child: any) => {
            if (child.userData?.isGizmo || child.userData?.isHelper || child.name?.includes('Pivot')) {
              child.visible = false; // Hide from export
              // Or better: remove from clone
              if (child.parent) child.parent.remove(child);
            }
          });
          exportScene.add(clone);
        }
      } else if (mode === 'objects') {
        if (isFurniture) {
          const clone = obj.clone();
          clone.traverse((child: any) => {
            if (child.userData?.isGizmo || child.userData?.isHelper || child.name?.includes('Pivot')) {
              if (child.parent) child.parent.remove(child);
            }
          });
          exportScene.add(clone);
        }
      } else if (mode === 'lights') {
        if (isLight) {
          const clone = obj.clone();
          exportScene.add(clone);
        }
      }
    });

    exporter.parse(
      exportScene,
      (result) => {
        setExportProgress({ active: true, type: mode === 'all' ? 'GLB' : 'GLB', progress: 90 });
        setTimeout(() => {
          const blob = result instanceof ArrayBuffer
            ? new Blob([result], { type: 'model/gltf-binary' })
            : new Blob([JSON.stringify(result)], { type: 'application/json' });

          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          const ext = result instanceof ArrayBuffer ? 'glb' : 'gltf';
          link.download = `export-${mode}-${new Date().toISOString().slice(0, 10)}.${ext}`;
          link.click();
          setExportProgress(null);
        }, 800);
      },
      (error) => {
        console.error('Export failed:', error);
        setExportProgress(null);
      },
      { binary: true }
    );
  };

  const importScene = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    setIsLoading(true);
    reader.onload = (ev) => {
      try {
        setState(JSON.parse(ev.target?.result as string));
        setHistory([]);
        setRedoStack([]);
        setFitSignal(s => s + 1);
        setFitTargetId(null);
      } catch (err) {
        alert('Import failed');
        setIsLoading(false);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    setIsLoading(true);
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target?.result as string) as AppState;

        // ARC-FIX: Automatic migration from .gltf to .glb for legacy scene files
        if (imported.items) {
          imported.items = imported.items.map(item => {
            if (item.url && item.url.endsWith('.gltf')) {
              return { ...item, url: item.url.replace('.gltf', '.glb') };
            }
            return item;
          });
        }

        saveToHistory(state);

        const walls = imported.items.filter(i => i.name.toLowerCase().includes('wall'));
        const others = imported.items.filter(i => !i.name.toLowerCase().includes('wall'));

        saveToHistory(state);

        // established full scene presence
        setState({ ...imported, selectedIds: [], areasFadeIn: false });
        setSelectedSubId(null);
        setFitTargetId(null);

        // Wait for stabilization (meshes created) before triggering fit
        setTimeout(() => {
          setFitSignal(s => s + 1);
          // Reveal areas after fit animation starts
          setTimeout(() => {
            setState(prev => ({ ...prev, areasFadeIn: true }));
            setIsLoading(false);
          }, 500);
        }, 800);
      } catch (err) {
        alert('Invalid scene file.');
        setIsLoading(false);
      }
    };
    reader.readAsText(file);
  };

  const handleSvgUpload = async (files: File[]) => {
    setIsLoading(true);
    const localNewObjects: FurnitureItem[] = [];
    const loader = new SVGLoader();

    interface PendingSvg {
      id: string;
      name: string;
      svgData: string;
      center: THREE.Vector2;
      size: THREE.Vector2;
      area: number;
      extrusion: number;
      type: string;
      groupTag?: string;       // For grouping (e.g. 'area')
      areaGradient?: boolean;  // Gradient opacity for area items
    }

    const batch: PendingSvg[] = [];

    const parser = new DOMParser();
    let firstVbCenter = new THREE.Vector2(0, 0);
    let firstVbFound = false;

    for (const file of files) {
      const text = await file.text();
      const doc = parser.parseFromString(text, 'image/svg+xml');
      const svgElement = doc.querySelector('svg');
      if (!svgElement) continue;

      const viewBox = svgElement.getAttribute('viewBox');
      const width = parseFloat(svgElement.getAttribute('width') || '0');
      const height = parseFloat(svgElement.getAttribute('height') || '0');

      let vb = [0, 0, 100, 100];
      if (viewBox) {
        vb = viewBox.split(' ').map(parseFloat);
      } else if (width && height) {
        vb = [0, 0, width, height];
      }

      if (!firstVbFound) {
        firstVbCenter.set(vb[0] + vb[2] / 2, vb[1] + vb[3] / 2);
        firstVbFound = true;
      }

      // Select all elements with an id attribute (g, path, rect, circle, etc.)
      const allIdEls = Array.from(doc.querySelectorAll('[id]')).filter(el => {
        if (el.tagName.toLowerCase() === 'svg') return false;
        if (!el.id || el.id.trim() === '') return false;
        // Skip elements inside <defs> (gradients, patterns, symbols, etc.)
        if (el.closest('defs')) return false;
        return true;
      });

      // Skip top-level single wrapper group: if there is exactly one direct child
      // of <svg> that has an id and it's a <g> containing other id'd elements inside,
      // exclude it so its children are processed individually.
      const skipIds = new Set<string>();
      const svgRoot = doc.querySelector('svg');
      if (svgRoot) {
        const directChildren = Array.from(svgRoot.children).filter(
          c => c.tagName.toLowerCase() !== 'defs' && c.tagName.toLowerCase() !== 'style'
        );
        if (directChildren.length === 1 && directChildren[0].tagName.toLowerCase() === 'g' && directChildren[0].id) {
          const wrapper = directChildren[0];
          const hasIdChildren = wrapper.querySelector('[id]') !== null;
          if (hasIdChildren) {
            skipIds.add(wrapper.id);
          }
        }
      }

      const candidates = allIdEls.filter(el => !skipIds.has(el.id));

      const processElement = (targetEl: Element, typeId: string, label: string) => {
        const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        tempSvg.setAttribute('viewBox', vb.join(' '));
        tempSvg.appendChild(targetEl.cloneNode(true));
        const svgData = tempSvg.outerHTML;

        const result = loader.parse(svgData);
        if (result.paths.length === 0) return;

        const box = new THREE.Box2();
        result.paths.forEach(path => {
          const shapes = SVGLoader.createShapes(path);
          shapes.forEach(shape => {
            shape.curves.forEach(curve => {
              const pts = curve.getPoints(10);
              pts.forEach(p => box.expandByPoint(new THREE.Vector2(p.x, p.y)));
            });
          });
        });

        const center = new THREE.Vector2();
        box.getCenter(center);
        const size = new THREE.Vector2();
        box.getSize(size);
        const area = size.x * size.y;

        let extrusion = 1; // Default extrusion for generic IDs (bookcase, table, chair, etc.)
        const lowerTypeId = typeId.toLowerCase();
        const isArea = lowerTypeId.includes('area');

        if (lowerTypeId.startsWith('wall')) extrusion = 2;
        else if (lowerTypeId.startsWith('ceiling') || lowerTypeId.startsWith('floor')) extrusion = 0; // True flat plane
        else if (lowerTypeId.startsWith('glass')) extrusion = 2;
        else if (isArea) extrusion = 3;

        batch.push({
          id: typeId,
          name: label,
          svgData,
          center,
          size,
          area,
          extrusion,
          type: 'svg',
          groupTag: isArea ? 'area' : undefined,
          areaGradient: isArea
        });
      };

      // Prevent processing children of already-processed parents
      const processedIds = new Set<string>();
      candidates.forEach((el) => {
        // Skip if this element is a descendant of an already-processed element
        let parent = el.parentElement;
        let isNested = false;
        while (parent) {
          if (parent.id && processedIds.has(parent.id)) { isNested = true; break; }
          parent = parent.parentElement;
        }
        if (isNested) return;
        processedIds.add(el.id);

        const elIdLower = el.id.toLowerCase();

        // Special handling: id="area" — process children individually as area objects
        if (elIdLower === 'area') {
          const areaChildren = Array.from(el.querySelectorAll('path, rect, circle, ellipse, polygon, polyline, g'));
          areaChildren.forEach((child, idx) => {
            const childId = child.id || `area-${idx}`;
            const childLabel = child.id
              ? child.id.charAt(0).toUpperCase() + child.id.slice(1).replace(/-/g, ' ')
              : `Area ${idx + 1}`;

            // Wrap child in its own SVG
            const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            tempSvg.setAttribute('viewBox', vb.join(' '));
            tempSvg.appendChild(child.cloneNode(true));
            const svgData = tempSvg.outerHTML;

            const result = loader.parse(svgData);
            if (result.paths.length === 0) return;

            const box = new THREE.Box2();
            result.paths.forEach(path => {
              const shapes = SVGLoader.createShapes(path);
              shapes.forEach(shape => {
                shape.curves.forEach(curve => {
                  const pts = curve.getPoints(10);
                  pts.forEach(p => box.expandByPoint(new THREE.Vector2(p.x, p.y)));
                });
              });
            });

            const center = new THREE.Vector2();
            box.getCenter(center);
            const size = new THREE.Vector2();
            box.getSize(size);
            const area = size.x * size.y;

            batch.push({
              id: childId,
              name: childLabel,
              svgData,
              center,
              size,
              area,
              extrusion: 3,
              type: 'svg',
              groupTag: 'area',
              areaGradient: true
            });
          });
          return;
        }

        if (elIdLower.startsWith('wall')) {
          const descendants = Array.from(el.querySelectorAll('path, rect, circle, ellipse, line, polyline, polygon'));
          const isSingle = descendants.length === 0;

          if (isSingle) {
            const fill = el.getAttribute('fill');
            const isMass = fill && fill !== 'none';
            processElement(el, isMass ? 'wall-mass' : 'wall-stroke', isMass ? 'Wall (Mass)' : 'Wall (Line)');
          } else {
            const fills = descendants.filter(d => d.getAttribute('fill') && d.getAttribute('fill') !== 'none');
            const strokes = descendants.filter(d => !d.getAttribute('fill') || d.getAttribute('fill') === 'none');

            if (fills.length > 0) {
              const massGroup = el.cloneNode(false) as Element;
              fills.forEach(f => massGroup.appendChild(f.cloneNode(true)));
              processElement(massGroup, 'wall-mass', 'Wall (Mass)');
            }
            if (strokes.length > 0) {
              const strokeGroup = el.cloneNode(false) as Element;
              strokes.forEach(s => strokeGroup.appendChild(s.cloneNode(true)));
              processElement(strokeGroup, 'wall-stroke', 'Wall (Line)');
            }
          }
        } else {
          const label = el.id.charAt(0).toUpperCase() + el.id.slice(1).replace(/-/g, ' ');
          processElement(el, el.id, label);
        }
      });
    }

    if (batch.length > 0) {
      // ArcLabV: Use the SVG canvas center as the global reference to ensure spatial stability
      const globalRefCenterCenter = firstVbFound ? firstVbCenter : batch[0].center;
      const scale = 0.1;
      const areaGroupId = 'area'; // Shared group ID for all area children

      batch.forEach(item => {
        const lowerId = item.id.toLowerCase();

        // Find matching preset mapping - Sort by length descending to match most specific keys first (e.g. 'chair_high' before 'chair')
        const mappingKey = Object.keys(PRESET_MAPPINGS)
          .sort((a, b) => b.length - a.length)
          .find(k => lowerId.includes(k));
        const mapping = mappingKey ? PRESET_MAPPINGS[mappingKey] : null;

        const isCeiling = lowerId.startsWith('ceiling');
        const isFloor = lowerId.startsWith('floor');
        const isWall = lowerId.startsWith('wall');
        const isStrokeWall = item.id === 'wall-stroke';
        const isGlass = lowerId.startsWith('glass');
        const isArea = item.groupTag === 'area';

        let extrusion = item.extrusion ?? 1;
        let posY = 0;
        let textureId: string | undefined = 'e6adf2f6-9cbc-4a98-b985-352a545714a2'; // etc preset

        if (isArea) {
          textureId = undefined; // Areas should use solid color/opacity, not the etc texture
        } else if (mapping) {
          extrusion = mapping.height;
          posY = mapping.posY;
          textureId = mapping.textureId;
        } else if (!isArea) {
          // Default logic for unmapped items
          extrusion = 1;
          if (isWall) { extrusion = 2; textureId = 'f7242ee2-04ee-4cb5-ad35-4bc67816ff04'; }
          if (isStrokeWall) { extrusion = 4; textureId = 'f7242ee2-04ee-4cb5-ad35-4bc67816ff04'; }
          if (isCeiling || isFloor) { extrusion = 0; textureId = '40105356-f6d7-4dde-81bb-32022ec0ebc9'; posY = isCeiling ? 2.5 : -0.005; }
          if (isGlass) { extrusion = 2; textureId = '9c9fb578-4db0-4593-859f-31c77874329e'; }
        }

        const newItem: FurnitureItem = {
          id: `${item.id}-${uuidv4()}`,
          type: 'svg' as FurnitureType,
          name: item.name,
          position: [
            (item.center.x - globalRefCenterCenter.x) * scale,
            posY,
            (item.center.y - globalRefCenterCenter.y) * scale
          ],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          color: isArea ? '#3fc026' : isWall ? '#e5e7eb' : isStrokeWall ? '#e5e7eb' : isGlass ? '#93c5fd' : isCeiling ? '#eeeeee' : isFloor ? '#333333' : '#888888',
          svgData: item.svgData,
          extrusion: extrusion,
          textureId: textureId,
          textureTiling: true,
          showBlackTop: mapping?.showBlackTop ?? (isWall || isGlass),
          doubleSide: isArea ? true : !(isCeiling || isStrokeWall),
          flipNormals: (isCeiling || isStrokeWall),
          isHollow: isStrokeWall,
          subtractions: [],
          glassOpacity: isGlass ? 0.2 : isArea ? 0.2 : undefined,
          glassMetalness: isGlass ? 1.0 : undefined,
          glassRoughness: isGlass ? 0.0 : undefined,
          emissiveIntensity: isArea ? 0.5 : undefined,
          groupId: isArea ? areaGroupId : undefined,
          areaGradient: item.areaGradient || false,
          locked: true
        };
        localNewObjects.push(newItem);
      });

      // ArcLabV: Before applying new floorplan, identify and replace existing floorplan-related items
      // We preserve custom metadata (status, colors, textures) to ensure user settings aren't lost during re-import.
      setState(prev => {
        const metadataMap = new Map<string, Partial<FurnitureItem>>();
        prev.items.forEach(it => {
          const lowerName = (it.name || '').toLowerCase();
          const isFloorplanItem = it.groupId === 'area' || lowerName.includes('area') || lowerName === 'floor' || lowerName.startsWith('wall') || lowerName.startsWith('glass');
          if (isFloorplanItem) {
            metadataMap.set(lowerName, {
              status: it.status,
              color: it.color,
              textureId: it.textureId,
              glassOpacity: it.glassOpacity,
              glassColor: it.glassColor,
              glassMetalness: it.glassMetalness,
              glassRoughness: it.glassRoughness,
              emissiveIntensity: it.emissiveIntensity,
              textureTiling: it.textureTiling,
              textureDensity: it.textureDensity,
              textureOffset: it.textureOffset,
            });
          }
        });

        const filteredItems = prev.items.filter(it => {
          const lowerName = (it.name || '').toLowerCase();
          return it.groupId !== 'area' && lowerName !== 'floor' && !lowerName.startsWith('wall') && !lowerName.startsWith('glass');
        });

        // Apply preserved metadata to new objects if names match
        const mergedObjects = localNewObjects.map(it => {
          const lowerName = (it.name || '').toLowerCase();
          const meta = metadataMap.get(lowerName);
          if (meta) {
            return { ...it, ...meta };
          }
          return it;
        });
        
        return {
          ...prev,
          items: [...filteredItems, ...mergedObjects],
          selectedIds: [],
          areasFadeIn: false
        };
      });

      setFitTargetId(null);

      // 1. Wait for stabilization (800ms)
      setTimeout(() => {
        setFitSignal(s => s + 1);
        // 2. Reveal areas after fit animation starts
        setTimeout(() => {
          setState(prev => ({ ...prev, areasFadeIn: true }));
          setIsLoading(false);
        }, 500);
      }, 800);
    } else {
      alert('오류: SVG 파일 내부에 id 속성을 가진 요소가 하나도 없습니다.\n도면 레이어에 id를 지정해 주세요. (예: wall, floor, glass, bookcase, table 등)');
      setIsLoading(false);
    }
  };

  const clipboardRef = useRef<{ items: FurnitureItem[], lights: any[] } | null>(null);
  const handleCopy = useCallback(() => {
    if (state.selectedIds.length === 0) return;
    const items = state.items.filter(i => state.selectedIds.includes(i.id));
    const lights = state.lights.filter(l => state.selectedIds.includes(l.id));
    clipboardRef.current = { items: JSON.parse(JSON.stringify(items)), lights: JSON.parse(JSON.stringify(lights)) };
  }, [state.selectedIds, state.items, state.lights]);

  const handlePaste = useCallback((inPlace: boolean = false) => {
    if (!clipboardRef.current) return;
    saveToHistory(state);
    const offset = inPlace ? 0 : 0.5;

    // Remap group IDs so pasted groups are distinct from the original groups
    const groupIdMap = new Map<string, string>();
    clipboardRef.current.items.forEach(i => {
      if (i.groupId && !groupIdMap.has(i.groupId)) {
        groupIdMap.set(i.groupId, uuidv4());
      }
    });

    const newItems = clipboardRef.current.items.map(i => {
      const gId = i.groupId ? groupIdMap.get(i.groupId) : undefined;
      return {
        ...i,
        id: uuidv4(),
        groupId: gId,
        position: [i.position[0] + offset, i.position[1], i.position[2] + offset] as [number, number, number]
      };
    });
    const newLights = clipboardRef.current.lights.map(l => ({ ...l, id: uuidv4(), position: [l.position[0] + offset, l.position[1], l.position[2] + offset] as [number, number, number] }));

    setState(prev => ({
      ...prev,
      items: [...prev.items, ...newItems],
      lights: [...prev.lights, ...newLights],
      selectedIds: [...newItems.map(i => i.id), ...newLights.map(l => l.id)]
    }));
    setSelectedSubId(null);
  }, [state, saveToHistory]);

  const handleZoomChange = useCallback((percent: number) => {
    setState(prev => prev.zoomPercent === percent ? prev : { ...prev, zoomPercent: percent });
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingViewport(false);
    const files = Array.from(e.dataTransfer.files);

    files.forEach(file => {
      const name = file.name.toLowerCase();
      const extension = name.split('.').pop() || '';
      const supported = ['gltf', 'glb', 'svg'];

      if (!supported.includes(extension)) {
        alert(`지원하지 않는 파일 형식입니다: .${extension}\n(GLTF, GLB, SVG 파일만 드래그 앤 드롭이 가능합니다.)`);
        return;
      }

      const cleanName = file.name.replace(/\.[^/.]+$/, "");

      if (name.endsWith('.gltf') || name.endsWith('.glb')) {
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const content = ev.target?.result;
          if (!content) return;

          // GLTF Validation: Check for materials information
          const loader = new GLTFLoader();
          loader.setDRACOLoader(dracoLoader);
          loader.parse(content, '',
            (gltf: any) => {
              const hasMaterials = gltf.parser.json.materials && gltf.parser.json.materials.length > 0;
              if (!hasMaterials) {
                alert(`오류: GLTF 파일("${file.name}") 내부에 Materials(재질) 정보가 하나도 없습니다.\n정상적인 렌더링을 위해 재질이 포함된 파일을 사용해 주세요.`);
              } else {
                // To support Furniture.tsx loading via URL, we convert the result back to DataURL if it wasn't already
                // Or just use readAsDataURL initially for the actual add, and this content for validation.
                // Let's keep it simple: we already have the content. For Furniture.tsx to work, it needs a URL.
                // DataURL is best for that.
                const dataUrlReader = new FileReader();
                dataUrlReader.onload = (dataEv) => {
                  handleAddItem('model' as FurnitureType, dataEv.target?.result as string, cleanName);
                };
                dataUrlReader.readAsDataURL(file);
              }
            },
            (error: any) => {
              alert(`GLTF 파싱 중 오류가 발생했습니다: ${error.message || '알 수 없는 오류'}`);
            }
          );
        };

          if (name.endsWith('.glb')) {
          reader.readAsArrayBuffer(file);
        } else {
          reader.readAsText(file);
        }
      } else if (name.endsWith('.svg')) {
        handleSvgUpload([file]);
      }
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

      const isCmd = e.ctrlKey || e.metaKey;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (state.showFloorplanModal) return;
        handleDeleteItems();
      }
      else if (e.key.toLowerCase() === 'z' && isCmd) {
        if (e.shiftKey) redo(); else undo();
      }
      else if (e.key.toLowerCase() === 'y' && isCmd) redo();
      else if (e.key.toLowerCase() === 'c' && isCmd) handleCopy();
      else if (e.key.toLowerCase() === 'v' && isCmd) {
        if (e.shiftKey) handlePaste(true);
        else handlePaste(false);
      }
      else if (e.key.toLowerCase() === 'g' && isCmd) {
        e.preventDefault();
        if (e.shiftKey) handleUngroup(); else handleGroup();
      }

      if (e.shiftKey) setShiftPressed(true);
      if (isCmd) setCtrlPressed(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.shiftKey) setShiftPressed(false);
      if (!(e.ctrlKey || e.metaKey)) setCtrlPressed(false);
    };
    window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [handleDeleteItems, undo, redo, handleCopy, handlePaste, handleGroup, handleUngroup]);

  return (
    <div className="w-full h-screen relative bg-[#0a0a0a] overflow-hidden">
      <div
        className={`w-full h-full overflow-hidden ${isDraggingViewport ? `ring-4 ring-inset ring-teal-500 shadow-[0_0_50px_${accentRgba(0.3)}]` : ''}`}
        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingViewport(true); }}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingViewport(true); }}
        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingViewport(false); }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDrop(e); }}
      >
        {isDraggingViewport && (
          <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-teal-500/10 backdrop-blur-[2px] pointer-events-none animate-in fade-in duration-300">
            <div className="bg-[#0a0a0a]/90 p-8 rounded-[40px] border border-teal-500/30 shadow-2xl flex flex-col items-center gap-4 transform scale-110">
              <div className="w-16 h-16 bg-teal-500/20 rounded-full flex items-center justify-center animate-bounce">
                <Box className="w-8 h-8 text-teal-500" />
              </div>
              <div className="text-center">
                <p className="text-lg font-black uppercase tracking-widest text-white">{state.language === 'ko' ? '에셋 드롭하여 로드' : 'Drop to Load Assets'}</p>
                <p className="text-[10px] font-bold text-teal-500/60 uppercase mt-1">GLTF • GLB • SVG</p>
              </div>
            </div>
          </div>
        )}
        <Scene
          ref={sceneRef}
          state={state}
          onSelect={handleSelect}
          onBoxSelect={handleBoxSelect}
          onSelectSub={handleSelectSub}
          previewSelectedIds={previewSelectedIds}
          selectedSubId={selectedSubId}
          onUpdate={handleUpdateItem}
          onUpdateLight={handleUpdateLight}
          onUpdateItems={handleUpdateItems}
          onUpdateLights={handleUpdateLights}
          onZoomChange={handleZoomChange}
          fitSignal={fitSignal}
          zoomRef={zoomRef}
          panRef={panRef}
          shiftPressed={shiftPressed}
          ctrlPressed={ctrlPressed}
          showGizmos={showGizmos}
          viewCenterRef={viewCenterRef}
          onUpdateState={(updates) => setState(prev => ({ ...prev, ...updates }))}
          onFitToSelection={(id) => { setFitTargetId(typeof id === 'string' ? id : null); setFitSignal(s => (s + 1) % 1000); }}
          fitTargetId={fitTargetId}
          onFitFinish={() => {
            setIsLoading(false);
            // Show obstacle areas gradually 3 seconds after fit finishes
            setTimeout(() => {
              setState(prev => ({ ...prev, areasFadeIn: true }));
            }, 1000);
          }}
        />
      </div>
      <UI
        state={state}
        onAddItem={handleAddItem}
        onDeleteItem={handleDeleteItems}
        onUpdateItem={handleUpdateItem}
        onUpdateItems={handleUpdateItems}
        onAlign={handleAlign}
        onDistribute={handleDistribute}
        onUpdateLight={handleUpdateLight}
        onUpdateLights={handleUpdateLights}
        onAddLight={handleAddLight}
        onUpdateState={handleUpdateState}
        onUndo={undo}
        onRedo={redo}
        canUndo={history.length > 0}
        canRedo={redoStack.length > 0}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        expandedLights={expandedLights}
        setExpandedLights={setExpandedLights}
        showGizmos={showGizmos}
        setShowGizmos={setShowGizmos}
        toggleAllLightsStatus={toggleAllLightsStatus}
        onFitToSelection={(id) => { setFitTargetId(typeof id === 'string' ? id : null); setFitSignal(s => (s + 1) % 1000); }}
        onSvgUpload={handleSvgUpload}
        onExport={exportScene}
        onImport={handleImport}
        isEditMode={isEditMode}
        setIsEditMode={setIsEditMode}
        staticTextures={staticTextures}
        selectedSubId={selectedSubId}
        setSelectedSubId={setSelectedSubId}
        zoomRef={zoomRef}
        panRef={panRef}
        onSelect={handleSelect}
        language={state.language}
      />

      {/* Loading Overlay */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[20000] flex flex-col items-center justify-center bg-black/60 backdrop-blur-xl"
          >
            <div className="relative flex items-center justify-center">
              <div className="absolute w-24 h-24 border-2 border-teal-500/20 rounded-full animate-ping" />
              <div className="absolute w-20 h-20 border-2 border-teal-500/40 rounded-full animate-pulse" />
              <div className="relative bg-teal-500/20 p-6 rounded-3xl border border-teal-500/30 backdrop-blur-md shadow-[0_20px_50px_rgba(20,184,166,0.3)]">
                <Loader2 className="w-10 h-10 text-teal-400 animate-spin" />
              </div>
            </div>
            <div className="mt-10 flex flex-col items-center">
              <h2 className="text-white text-xl font-black uppercase tracking-[0.3em] mb-2 animate-pulse">
                {state.language === 'ko' ? '데이터 처리 중' : 'Processing Data'}
              </h2>
              <p className="text-teal-400/60 text-[10px] font-bold uppercase tracking-[0.2em]">
                {state.language === 'ko' ? '3D 공간을 구성하고 있습니다...' : 'Constructing 3D environment...'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Export Progress Modal */}
      <AnimatePresence>
        {exportProgress && (
          <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-80 bg-[#0a0a0a] border border-white/10 rounded-[32px] p-8 flex flex-col items-center text-center shadow-2xl"
            >
              <div className="w-16 h-16 bg-teal-500/10 rounded-full flex items-center justify-center mb-6 relative">
                <div className="absolute inset-0 border-2 border-teal-500/20 rounded-full" />
                <motion.div
                  className="absolute inset-0 border-2 border-teal-500 rounded-full"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: exportProgress.progress / 100 }}
                  transition={{ duration: 0.5 }}
                  style={{ rotate: -90, position: 'absolute', inset: 0 }}
                />
                <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
              </div>
              <h3 className="text-white font-bold uppercase tracking-widest mb-2">
                {state.language === 'ko' ? `${exportProgress.type} 내보내는 중...` : `Exporting ${exportProgress.type}...`}
              </h3>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-tight">
                {state.language === 'ko' ? '잠시만 기다려 주세요' : 'Please wait a moment'}
              </p>

              <div className="mt-8 w-full h-1 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-teal-500"
                  initial={{ width: "0%" }}
                  animate={{ width: `${exportProgress.progress || 10}%` }}
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

