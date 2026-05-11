// HMR trigger
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  Plus,
  Trash2,
  Upload,
  Square,
  Sun,
  Download,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Layout,
  Search,
  Hand,
  Maximize,
  Box,
  Settings,
  Lightbulb,
  Trash,
  Scissors,
  Move,
  RotateCw,
  Scaling,
  Power,
  Layers,
  Circle,
  Zap,
  Lock,
  Unlock,
  AlignLeft,
  AlignCenterHorizontal as AlignCenterH,
  AlignRight,
  AlignStartVertical as AlignTop,
  AlignCenterVertical as AlignCenterV,
  AlignEndVertical as AlignBottom,
  MoveHorizontal,
  MoveVertical,
  MoreHorizontal,
  Folder,
  Eye,
  EyeOff,
  MousePointer,
  Library,
  CheckCircle,
  Loader2,
  ExternalLink,
  RefreshCw,
  Image
} from 'lucide-react';
import {
  FurnitureType,
  FurnitureItem,
  AppState,
  TextureConfig,
  LightType,
  identifyTextureType
} from '../types';
import { TextureSelector } from './TextureSelector';
import { TextureManagerPanel } from './TextureManagerPanel';

import { motion, AnimatePresence } from 'framer-motion';
import { FloorplanToSvg } from './FloorplanToSvg';
import { GLBCompressor } from './GLBCompressor';
import { useGLBCompression, FileState } from './useGLBCompression';
import { ACCENT_400, accentRgba } from '../theme';

interface UIProps {
  state: AppState;
  onAddItem: (type: FurnitureType, url?: string, name?: string) => void;
  onDeleteItem: () => void;
  onUpdateItem: (id: string, updates: Partial<FurnitureItem>, undoable?: boolean) => void;
  onUpdateItems: (updatesMap: { [id: string]: Partial<FurnitureItem> }, undoable?: boolean) => void;
  onAlign?: (axis: 0 | 1 | 2, type: 'min' | 'center' | 'max') => void;
  onDistribute?: (axis: 0 | 1 | 2) => void;
  onUpdateLight: (id: string, updates: Partial<any>) => void;
  onUpdateLights: (updatesMap: { [id: string]: Partial<any> }, undoable?: boolean) => void;
  onAddLight: (type: string) => void;
  onUpdateState: (updates: Partial<AppState>) => void;
  onFitToSelection: (id?: string) => void;
  onSvgUpload?: (files: File[]) => void;
  onExport: (mode: 'all' | 'objects' | 'lights' | 'json') => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  expandedLights: Set<string>;
  setExpandedLights: (expanded: Set<string>) => void;
  showGizmos: boolean;
  setShowGizmos: (show: boolean) => void;
  toggleAllLightsStatus: () => void;
  setSelectedSubId: (id: string | null) => void;
  selectedSubId: string | null;
  staticTextures: TextureConfig[];
  zoomRef: React.RefObject<HTMLDivElement>;
  panRef: React.RefObject<HTMLDivElement>;
  onSelect: (id: string | null, multi?: boolean, isGroupSelect?: boolean) => void;
  language?: 'en' | 'ko';
}

export const UI: React.FC<UIProps> = ({
  state,
  onAddItem,
  onDeleteItem,
  onUpdateItem,
  onUpdateItems,
  onAlign,
  onDistribute,
  onUpdateLight,
  onUpdateLights,
  onAddLight,
  onUpdateState,
  onFitToSelection,
  onSvgUpload,
  onExport,
  onImport,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  sidebarOpen,
  setSidebarOpen,
  expandedLights,
  setExpandedLights,
  showGizmos,
  setShowGizmos,
  toggleAllLightsStatus,
  setSelectedSubId,
  selectedSubId,
  staticTextures,
  zoomRef,
  panRef,
  onSelect,
  language = 'en'
}) => {
  const [activeTab, setActiveTab] = useState<'objects' | 'lights' | 'materials' | 'settings'>('objects');
  const [showCompressor, setShowCompressor] = useState(false);
  const [isDraggingBackground, setIsDraggingBackground] = useState(false);
  const {
    files: compressionFiles,
    addFiles: addCompressionFiles,
    removeFile: removeCompressionFile,
    clearFiles: clearCompressionFiles,
    setFiles: setCompressionFiles
  } = useGLBCompression();

  const [showCompletionToast, setShowCompletionToast] = useState(false);
  const [lastCompletedCount, setLastCompletedCount] = useState(0);

  const downloadCompressedFile = useCallback((file: FileState) => {
    if (!file.compressedBuffer) return;
    const blob = new Blob([file.compressedBuffer], { type: 'model/gltf-binary' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    const downloadName = file.name.replace(/\.(glb|gltf)$/i, '_optimized.glb');
    a.download = downloadName;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    const completed = compressionFiles.filter(f => f.status === 'completed').length;
    const processing = compressionFiles.filter(f => f.status === 'processing' || f.status === 'pending').length;

    if (completed > lastCompletedCount && processing === 0 && !showCompressor) {
      setShowCompletionToast(true);
      const timer = setTimeout(() => setShowCompletionToast(false), 10000);
      return () => clearTimeout(timer);
    }
    setLastCompletedCount(completed);
  }, [compressionFiles, lastCompletedCount, showCompressor]);

  const isCompressing = compressionFiles.some(f => f.status === 'processing' || f.status === 'pending');
  const totalCompressionProgress = compressionFiles.length > 0
    ? compressionFiles.reduce((acc, f) => acc + f.progress, 0) / compressionFiles.length
    : 0;
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState("");
  const [jumpToMaterialId, setJumpToMaterialId] = useState<string | null>(null);
  const [isDraggingMaterials, setIsDraggingMaterials] = useState(false);
  const lastSelectedIdRef = useRef<string | null>(null);
  const internalUIActionRef = useRef(false);
  const lastSelectedIndexRef = useRef<number | null>(null);

  const t = (en: string, ko: string) => (language === 'ko' ? ko : en);
  const handleFloorplanStateChange = useCallback((fps: any) => {
    onUpdateState({ floorplanPersistedState: fps });
  }, [onUpdateState]);

  const EditableNumber: React.FC<{ value: number, onChange: (val: number) => void, precision?: number }> = ({ value, onChange, precision = 1 }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [tempValue, setTempValue] = useState(value.toString());

    if (isEditing) {
      return (
        <input
          autoFocus
          className="w-10 bg-teal-500/10 border border-teal-500/50 rounded text-[10px] text-teal-500 font-mono px-1 outline-none"
          value={tempValue}
          onChange={(e) => setTempValue(e.target.value)}
          onBlur={() => {
            const val = parseFloat(tempValue);
            if (!isNaN(val)) onChange(val);
            setIsEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const val = parseFloat(tempValue);
              if (!isNaN(val)) onChange(val);
              setIsEditing(false);
            }
            if (e.key === 'Escape') {
              setTempValue(value.toString());
              setIsEditing(false);
            }
          }}
        />
      );
    }
    return (
      <span
        className="text-teal-500 cursor-pointer hover:underline decoration-teal-500/30"
        onClick={() => {
          setTempValue(value.toString());
          setIsEditing(true);
        }}
      >
        {value.toFixed(precision)}
      </span>
    );
  };

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroupExpansion = (groupId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const sceneHierarchy = React.useMemo(() => {
    const nodes: Array<{ type: 'item', item: FurnitureItem } | { type: 'group', groupId: string, items: FurnitureItem[] }> = [];
    const groupedIds = new Set<string>();

    state.items.forEach(item => {
      if (item.groupId) {
        if (!groupedIds.has(item.groupId)) {
          const groupItems = state.items.filter(i => i.groupId === item.groupId);
          nodes.push({ type: 'group', groupId: item.groupId, items: groupItems });
          groupedIds.add(item.groupId);
        }
      } else {
        nodes.push({ type: 'item', item });
      }
    });
    return nodes;
  }, [state.items]);

  const { unit = 'm' } = state;

  // Tab switching effect - only triggers on NEW selection
  useEffect(() => {
    if (state.selectedIds.length === 0) {
      lastSelectedIdRef.current = null;
      return;
    }
    const lastId = state.selectedIds[state.selectedIds.length - 1];
    if (lastId === lastSelectedIdRef.current) return;

    lastSelectedIdRef.current = lastId;
    const isLight = state.lights.find(l => l.id === lastId);
    const isItem = state.items.find(i => i.id === lastId);

    if (isLight) setActiveTab('lights');
    else if (isItem) setActiveTab('objects');
  }, [state.selectedIds, state.lights, state.items]);

  const lastHandledScrollIdRef = useRef<string | null>(null);

  // Scroll effect for both lights and objects
  useEffect(() => {
    if (state.selectedIds.length === 0) {
      internalUIActionRef.current = false;
      lastHandledScrollIdRef.current = null;
      return;
    }

    const lastId = state.selectedIds[state.selectedIds.length - 1];
    if (lastId === lastHandledScrollIdRef.current) return;

    // If it was an internal UI action (list click, item add), don't scroll top
    if (internalUIActionRef.current) {
      internalUIActionRef.current = false;
      lastHandledScrollIdRef.current = lastId; // Mark as handled
      return;
    }

    const timer = setTimeout(() => {
      if (!lastId) return;
      lastHandledScrollIdRef.current = lastId;

      const isLight = state.lights.some(l => l.id === lastId);
      const isItem = state.items.some(i => i.id === lastId);

      // Auto-expand group if item belongs to one
      if (isItem) {
        const item = state.items.find(i => i.id === lastId);
        if (item?.groupId) {
          setExpandedGroups(prev => {
            if (prev.has(item.groupId!)) return prev;
            return new Set(prev).add(item.groupId!);
          });
        }
      }

      const itemPanelId = (isLight ? 'light-panel-' : 'object-panel-') + lastId;
      const itemEl = document.getElementById(itemPanelId);

      if (itemEl) {
        // Use a longer delay for items that might be inside a group that just expanded
        setTimeout(() => {
          itemEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [state.selectedIds]); // Only trigger when selection actually changes

  const selectedItems = state.items.filter(item => state.selectedIds.includes(item.id));
  const selectedItem = selectedItems[0] || null;

  const allTextures = [
    { id: 'none', name: 'None', color: '#94a3b8' },
    ...staticTextures,

    ...(state.customTextures || []).map(t => ({ ...t, isCustom: true }))
  ];

  const updateField = (id: string, field: 'position' | 'scale' | 'rotation', index: number, value: number) => {
    const item = state.items.find(i => i.id === id);
    if (!item) return;
    const newArray = [...item[field]] as [number, number, number];
    newArray[index] = value;
    onUpdateItem(id, { [field]: newArray }, true);
  };

  const toggleAllLightsExpansion = () => {
    if (expandedLights.size === state.lights.length && state.lights.length > 0) {
      setExpandedLights(new Set());
    } else {
      setExpandedLights(new Set(state.lights.map(l => l.id)));
    }
  };

  return (
    <>
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-40">
        <div className="absolute top-6 left-6 pointer-events-auto flex items-center gap-3">
          <div className="flex items-center gap-3 glass-panel px-4 py-2 rounded-full border border-white/10 shadow-2xl">
            <div className="w-8 h-8 bg-teal-500 rounded-full flex items-center justify-center">
              <Box className="w-5 h-5 text-black" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-white leading-tight">simple3D</h1>
              <p className="text-[10px] text-white/50 font-mono">Architect Visual Room</p>
            </div>
          </div>

          <div className="flex bg-black/40 backdrop-blur-xl border border-white/10 rounded-full p-1 shadow-2xl">
            <button
              onClick={() => onUpdateState({ language: 'ko' })}
              className={`px-3 py-1 rounded-full text-[10px] font-black uppercase transition-all ${language === 'ko' ? `bg-teal-500 text-black shadow-[0_0_15px_${accentRgba(0.3)}]` : 'text-white/40 hover:text-white/70'}`}
            >
              KO
            </button>
            <button
              onClick={() => onUpdateState({ language: 'en' })}
              className={`px-3 py-1 rounded-full text-[10px] font-black uppercase transition-all ${language === 'en' ? `bg-teal-500 text-black shadow-[0_0_15px_${accentRgba(0.3)}]` : 'text-white/40 hover:text-white/70'}`}
            >
              EN
            </button>
          </div>
        </div>

        {/* Alignment Modal */}
        <AnimatePresence>
          {state.selectedIds.length > 1 && onAlign && onDistribute && (
            <div
              id="alignment-tools-modal"
              style={{
                right: sidebarOpen ? '480px' : '160px',
                top: '24px',
                transition: 'right 0.5s ease-in-out'
              }}
              className="absolute pointer-events-auto overflow-hidden border border-teal-500/20 bg-black/80 backdrop-blur-xl rounded-2xl p-3 space-y-2 shadow-[0_15px_35px_rgba(0,0,0,0.5)] w-[200px]"
            >
              <div className="flex items-center justify-between mb-1 pb-1.5 border-b border-white/10">
                <span className="text-[10px] font-black uppercase tracking-widest text-teal-500/80">Alignment</span>
                <span className="text-[10px] font-mono text-teal-500/60 uppercase font-black">{state.selectedIds.length} Selected</span>
              </div>

              {/* X Axis */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-white/30 w-2.5">X</span>
                  <div className="flex gap-1 flex-1">
                    <button onClick={() => onAlign(0, 'min')} title="Align Left" className="flex-1 h-6 flex items-center justify-center bg-white/5 hover:bg-teal-500 text-white hover:text-black rounded-md transition-all border border-white/10"><AlignLeft size={10} /></button>
                    <button onClick={() => onAlign(0, 'center')} title="Align Center X" className="flex-1 h-6 flex items-center justify-center bg-white/5 hover:bg-teal-500 text-white hover:text-black rounded-md transition-all border border-white/10"><AlignCenterH size={10} /></button>
                    <button onClick={() => onAlign(0, 'max')} title="Align Right" className="flex-1 h-6 flex items-center justify-center bg-white/5 hover:bg-teal-500 text-white hover:text-black rounded-md transition-all border border-white/10"><AlignRight size={10} /></button>
                    <button onClick={() => onDistribute(0)} title="Distribute X" className="flex-1 h-6 flex items-center justify-center bg-white/5 hover:bg-teal-500 text-white hover:text-black rounded-md transition-all border border-teal-500/30 border-dashed"><MoveHorizontal size={10} /></button>
                  </div>
                </div>
              </div>

              {/* Y Axis */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-white/30 w-2.5">Y</span>
                  <div className="flex gap-1 flex-1">
                    <button onClick={() => onAlign(1, 'min')} title="Align Bottom" className="flex-1 h-6 flex items-center justify-center bg-white/5 hover:bg-teal-500 text-white hover:text-black rounded-md transition-all border border-white/10"><AlignBottom size={10} /></button>
                    <button onClick={() => onAlign(1, 'center')} title="Align Center Y" className="flex-1 h-6 flex items-center justify-center bg-white/5 hover:bg-teal-500 text-white hover:text-black rounded-md transition-all border border-white/10"><AlignCenterV size={10} /></button>
                    <button onClick={() => onAlign(1, 'max')} title="Align Top" className="flex-1 h-6 flex items-center justify-center bg-white/5 hover:bg-teal-500 text-white hover:text-black rounded-md transition-all border border-white/10"><AlignTop size={10} /></button>
                    <button onClick={() => onDistribute(1)} title="Distribute Y" className="flex-1 h-6 flex items-center justify-center bg-white/5 hover:bg-teal-500 text-white hover:text-black rounded-md transition-all border border-teal-500/30 border-dashed"><MoveVertical size={10} /></button>
                  </div>
                </div>
              </div>

              {/* Z Axis */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-white/30 w-2.5">Z</span>
                  <div className="flex gap-1 flex-1">
                    <button onClick={() => onAlign(2, 'min')} title="Align Back" className="flex-1 h-6 flex items-center justify-center bg-white/5 hover:bg-teal-500 text-white hover:text-black rounded-md transition-all border border-white/10"><AlignLeft className="rotate-90" size={10} /></button>
                    <button onClick={() => onAlign(2, 'center')} title="Align Center Z" className="flex-1 h-6 flex items-center justify-center bg-white/5 hover:bg-teal-500 text-white hover:text-black rounded-md transition-all border border-white/10"><AlignCenterH className="rotate-90" size={10} /></button>
                    <button onClick={() => onAlign(2, 'max')} title="Align Front" className="flex-1 h-6 flex items-center justify-center bg-white/5 hover:bg-teal-500 text-white hover:text-black rounded-md transition-all border border-white/10"><AlignRight className="rotate-90" size={10} /></button>
                    <button onClick={() => onDistribute(2)} title="Distribute Z" className="flex-1 h-6 flex items-center justify-center bg-white/5 hover:bg-teal-500 text-white hover:text-black rounded-md transition-all border border-teal-500/30 border-dashed"><MoreHorizontal size={10} /></button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </AnimatePresence>

        <div
          style={{
            right: sidebarOpen ? '376px' : '16px',
            transition: 'right 0.5s ease-in-out'
          }}
          className="absolute top-[130px] flex flex-col items-end gap-3 pointer-events-auto"
        >
          <div
            ref={zoomRef}
            className="bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white rounded-full p-2.5 cursor-ns-resize shadow-xl flex items-center justify-center w-10 h-10 border border-white/5 transition-colors"
            title="Drag up/down to Zoom"
          >
            <Search size={18} />
          </div>
          <div
            ref={panRef}
            className="bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white rounded-full p-2.5 cursor-all-scroll shadow-xl flex items-center justify-center w-10 h-10 border border-white/5 transition-colors"
            title="Drag to Pan"
          >
            <Hand size={18} />
          </div>
          <div
            onClick={() => onFitToSelection()}
            className="bg-[#2a2a2a] hover:bg-[#3a3a3a] text-teal-500 rounded-full p-2.5 cursor-pointer shadow-xl flex items-center justify-center w-10 h-10 border border-white/5 transition-colors"
            title="Fit to Model"
          >
            <Maximize size={18} />
          </div>

          <div className="mt-1 glass-panel px-2.5 py-1.5 rounded-xl border border-white/5 flex flex-col items-center bg-black/60 shadow-inner">
            <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest leading-none mb-1">Zoom</span>
            <span className="text-[10px] font-mono font-black text-teal-500">{state.zoomPercent}%</span>
          </div>
        </div>

        {/* Bottom-Left: Create SVG Floorplan Button */}
        <div className="absolute bottom-6 left-6 pointer-events-auto z-20">
          <button
            onClick={() => onUpdateState({ showFloorplanModal: true })}
            className="flex items-center gap-2.5 px-5 py-3 bg-[#1a1a1a]/90 backdrop-blur-xl hover:bg-teal-500 text-white/70 hover:text-black rounded-2xl border border-white/10 hover:border-teal-500 transition-all shadow-[0_10px_40px_rgba(0,0,0,0.5)] group"
          >
            <svg className="w-4 h-4 text-teal-500 group-hover:text-black transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 3v18" />
            </svg>
            <span className="text-[10px] font-black uppercase tracking-widest">{t('Create SVG Floorplan', 'SVG 평면도 생성')}</span>
          </button>
        </div>

        <AnimatePresence>
          {state.items.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20, x: 'calc(-50% - 180px)' }}
              animate={{
                opacity: 1,
                y: 20,
                x: sidebarOpen ? 'calc(-50% - 180px)' : '-50%'
              }}
              transition={{ type: 'spring', stiffness: 50, damping: 20 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-10 left-1/2 pointer-events-auto"
            >
              <div className="glass-panel px-8 py-3 rounded-full border border-white/10 opacity-90 flex items-center gap-3 shadow-2xl">
                <Upload className="w-4 h-4 text-teal-500" />
                <span className="text-[11px] text-white/80 font-mono tracking-widest uppercase font-bold">
                  {t('Drag & Drop .gltf, .glb, or .svg to load', '.gltf, .glb, 또는 .svg 파일을 드래그하여 불러오세요')}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <aside
        style={{
          width: sidebarOpen ? '360px' : '0px',
          opacity: sidebarOpen ? 1 : 0,
          transition: 'width 0.5s ease-in-out, opacity 0.5s ease-in-out',
          background: `radial-gradient(circle at bottom right, rgba(var(--accent-r), var(--accent-g), var(--accent-b), 0.3) 0%, #1a1a1a 80%)`
        }}
        className="h-full border-l border-white/10 bg-[#1a1a1a] flex flex-col relative z-30 overflow-hidden shrink-0 pointer-events-auto"
      >
        <div className="flex border-b border-white/10 shrink-0">
          <button
            onClick={() => setActiveTab('objects')}
            className={`flex-1 py-3 text-[12px] font-black uppercase transition-all relative ${activeTab === 'objects' ? 'text-teal-500 bg-white/5' : 'text-white/30 hover:text-white/60'}`}
          >
            {activeTab === 'objects' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-500" />}
            {t('Objects', '오브젝트')}
          </button>
          <button
            onClick={() => setActiveTab('lights')}
            className={`flex-1 py-3 text-[12px] font-black uppercase transition-all relative ${activeTab === 'lights' ? 'text-teal-500 bg-white/5' : 'text-white/30 hover:text-white/60'}`}
          >
            {activeTab === 'lights' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-500" />}
            {t('Lights', '조명')}
          </button>
          <button
            onClick={() => setActiveTab('materials')}
            className={`flex-1 py-3 text-[12px] font-black uppercase transition-all relative ${activeTab === 'materials' ? 'text-teal-500 bg-white/5' : 'text-white/30 hover:text-white/60'}`}
          >
            {activeTab === 'materials' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-500" />}
            {t('Materials', '재질')}
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex-1 py-3 text-[12px] font-black uppercase transition-all relative ${activeTab === 'settings' ? 'text-teal-500 bg-white/5' : 'text-white/30 hover:text-white/60'}`}
          >
            {activeTab === 'settings' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-500" />}
            {t('Scene', '설정')}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
          <div className="p-5 flex flex-col gap-6 w-[360px]">
            {activeTab === 'objects' && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
                <section className="space-y-1.5">
                  <div className="flex items-center gap-2.5 mb-1 px-1.5 h-7">
                    <Box className="w-3.5 h-3.5 text-teal-500" />
                    <h2 className="text-xs font-black uppercase tracking-widest text-white/50">{t('Primitives', '도형')}</h2>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { type: 'box', icon: <Box size={12} />, label: 'Box' },
                      { type: 'sphere', icon: <Circle size={12} />, label: 'Sphere' },
                      { type: 'plane', icon: <Layout size={12} />, label: 'Plane' },
                    ].map(btn => (
                      <button
                        key={btn.type}
                        onClick={() => {
                          internalUIActionRef.current = true;
                          onAddItem(btn.type as any, undefined, btn.label);
                        }}
                        className="flex flex-col items-center justify-center gap-1.5 p-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg transition-all text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white group"
                      >
                        <span className="text-teal-500 group-hover:scale-110 transition-transform">{btn.icon}</span>
                        <span className="opacity-60">{btn.type}</span>
                      </button>
                    ))}
                  </div>
                </section>


                <section id="scene-objects-section">
                  <div id="scene-objects-layer" className="flex items-center justify-between mb-1 px-1.5 h-7 scroll-mt-4">
                    <div className="flex items-center gap-2.5">
                      <Layers className="w-3.5 h-3.5 text-teal-500" />
                      <h2 className="text-xs font-black uppercase tracking-widest text-white/50">{t('Scene Objects', '씬 오브젝트')}</h2>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => {
                          const anyVisible = state.items.some(i => i.visible !== false);
                          onUpdateItems(Object.fromEntries(state.items.map(i => [i.id, { visible: !anyVisible }])));
                        }}
                        className={`p-1 rounded-lg transition-all border ${state.items.some(i => i.visible !== false) ? 'bg-amber-500 text-black border-amber-500' : 'bg-white/5 text-white/50 border-white/5 hover:bg-white/10'}`}
                        title="Toggle visibility for all objects"
                      >
                        {state.items.some(i => i.visible !== false) ? <Eye size={12} /> : <EyeOff size={12} />}
                      </button>
                      <button
                        onClick={() => {
                          const anyUnlocked = state.items.some(i => !i.locked);
                          onUpdateItems(Object.fromEntries(state.items.map(i => [i.id, { locked: anyUnlocked }])));
                        }}
                        className={`p-1 rounded-lg transition-all border ${state.items.some(i => !i.locked) ? 'bg-teal-500 text-black border-teal-500' : 'bg-white/5 text-white/50 border-white/5 hover:bg-white/10'}`}
                        title="Toggle lock for all objects"
                      >
                        {state.items.some(i => !i.locked) ? <Unlock size={12} /> : <Lock size={12} />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                    {sceneHierarchy.map((node, idx) => {
                      if (node.type === 'item') {
                        const item = node.item;
                        return (
                          <div
                            key={item.id}
                            id={'object-panel-' + item.id}
                            onClick={(e) => {
                              internalUIActionRef.current = true;
                              const isMulti = e.ctrlKey || e.metaKey;
                              const isShift = e.shiftKey;

                              if (isShift && lastSelectedIndexRef.current !== null) {
                                const start = Math.min(lastSelectedIndexRef.current, idx);
                                const end = Math.max(lastSelectedIndexRef.current, idx);
                                const rangeNodes = sceneHierarchy.slice(start, end + 1);
                                const rangeIds: string[] = [];
                                rangeNodes.forEach(rn => {
                                  if (rn.type === 'item') rangeIds.push(rn.item.id);
                                  else rn.items.forEach(ri => rangeIds.push(ri.id));
                                });

                                const nextIds = Array.from(new Set([...state.selectedIds, ...rangeIds]));
                                onUpdateState({ selectedIds: nextIds });
                              } else {
                                onSelect(item.id, isMulti);
                                if (!isMulti) lastSelectedIndexRef.current = idx;
                              }
                            }}
                            className={`px-3 py-2 rounded-xl border transition-all duration-300 relative overflow-hidden flex items-center justify-between cursor-pointer ${state.selectedIds.includes(item.id) ? `border-teal-500 bg-teal-500/[0.04] shadow-[0_5px_15px_${accentRgba(0.05)}]` : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05]'}`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`p-1 rounded-lg transition-all ${state.selectedIds.includes(item.id) ? 'bg-teal-500/10 text-teal-500' : 'bg-white/5 text-white/30'}`}>
                                {item.type === 'box' && <Box size={12} />}
                                {item.type === 'sphere' && <Circle size={12} />}
                                {item.type === 'plane' && <Layout size={12} />}
                                {item.type === 'model' && <Box size={12} />}
                              </div>
                              <div className="flex flex-col min-w-0">
                                {editingNameId === item.id ? (
                                  <input
                                    type="text"
                                    value={editingNameValue}
                                    autoFocus
                                    onClick={e => e.stopPropagation()}
                                    className="bg-black/60 border border-teal-500/50 rounded px-1.5 py-0.5 text-[10px] text-white outline-none"
                                    onBlur={() => {
                                      onUpdateItem(item.id, { name: editingNameValue });
                                      setEditingNameId(null);
                                    }}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') {
                                        onUpdateItem(item.id, { name: editingNameValue });
                                        setEditingNameId(null);
                                      }
                                    }}
                                  />
                                ) : (
                                  <span
                                    onDoubleClick={(e) => {
                                      e.stopPropagation();
                                      setEditingNameId(item.id);
                                      setEditingNameValue(item.name);
                                    }}
                                    className={`text-[10px] font-black uppercase tracking-tight truncate transition-colors ${state.selectedIds.includes(item.id) ? 'text-white' : 'text-white/50'}`}
                                  >
                                    {item.name}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 pr-1 opacity-40 hover:opacity-300 transition-opacity">
                              <button
                                onClick={(e) => { e.stopPropagation(); onUpdateItem(item.id, { visible: item.visible === false }); }}
                                className="p-1 rounded-md text-white/300 hover:text-amber-500 transition-all"
                                title={item.visible === false ? "Show object" : "Hide object"}
                              >
                                {item.visible !== false ? <Eye size={12} /> : <EyeOff size={12} />}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); onUpdateItem(item.id, { locked: !item.locked }); }}
                                className="p-1 rounded-md text-white/300 hover:text-teal-500 transition-all"
                                title={item.locked ? "Unlock object" : "Lock object"}
                              >
                                {!item.locked ? <Unlock size={12} /> : <Lock size={12} />}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const nextIds = state.selectedIds.filter(sid => sid !== item.id);
                                  onUpdateState({ items: state.items.filter(i => i.id !== item.id), selectedIds: nextIds });
                                }}
                                className="p-1 rounded-md text-white/300 hover:text-red-500 transition-all"
                                title="Delete object"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      } else {
                        const isGroupSelected = node.items.some(i => state.selectedIds.includes(i.id));
                        const isExpanded = expandedGroups.has(node.groupId);

                        return (
                          <div key={node.groupId} id={'object-panel-' + node.groupId} className="space-y-1">
                            <div
                              className={`px-3 py-2 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${isGroupSelected ? `border-teal-500 bg-teal-500/[0.04] shadow-[0_5px_15px_${accentRgba(0.05)}]` : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05]'}`}
                              onClick={(e) => {
                                internalUIActionRef.current = true;
                                const isShift = e.shiftKey;
                                if (isShift && lastSelectedIndexRef.current !== null) {
                                  const start = Math.min(lastSelectedIndexRef.current, idx);
                                  const end = Math.max(lastSelectedIndexRef.current, idx);
                                  const rangeNodes = sceneHierarchy.slice(start, end + 1);
                                  const rangeIds: string[] = [];
                                  rangeNodes.forEach(rn => {
                                    if (rn.type === 'item') rangeIds.push(rn.item.id);
                                    else rn.items.forEach(ri => rangeIds.push(ri.id));
                                  });
                                  const nextIds = Array.from(new Set([...state.selectedIds, ...rangeIds]));
                                  onUpdateState({ selectedIds: nextIds });
                                } else {
                                  onSelect(node.groupId, e.shiftKey || e.ctrlKey || e.metaKey, true);
                                  if (!e.shiftKey && !(e.ctrlKey || e.metaKey)) lastSelectedIndexRef.current = idx;
                                }
                              }}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <button
                                  onClick={(e) => toggleGroupExpansion(node.groupId, e)}
                                  className={`p-1 -ml-1.5 rounded bg-transparent ${isGroupSelected ? 'text-teal-500 hover:text-teal-400' : 'text-white/30 hover:text-white/80'} transition-colors`}
                                >
                                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </button>
                                <span className={`text-white/50 ${isGroupSelected ? 'text-teal-500' : ''}`}><Folder size={12} /></span>
                                <span className={`text-[10px] font-black uppercase tracking-tight truncate ${isGroupSelected ? 'text-white' : 'text-white/60'}`}>{node.groupId}</span>
                              </div>
                              <div className="flex items-center gap-1 opacity-40 hover:opacity-100 transition-opacity">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const anyVisible = node.items.some(i => i.visible !== false);
                                    const updatesMap = Object.fromEntries(node.items.map(i => [i.id, { visible: !anyVisible }]));
                                    onUpdateItems(updatesMap, true);
                                  }}
                                  className="p-1 rounded-md text-white hover:text-amber-500 transition-all"
                                  title="Toggle group visibility"
                                >
                                  {node.items.some(i => i.visible !== false) ? <Eye size={12} /> : <EyeOff size={12} />}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const anyUnlocked = node.items.some(i => !i.locked);
                                    const updatesMap = Object.fromEntries(node.items.map(i => [i.id, { locked: anyUnlocked }]));
                                    onUpdateItems(updatesMap, true);
                                  }}
                                  className="p-1 rounded-md text-white hover:text-teal-500 transition-all"
                                  title="Toggle group lock"
                                >
                                  {node.items.some(i => !i.locked) ? <Unlock size={12} /> : <Lock size={12} />}
                                </button>
                              </div>
                            </div>

                            <AnimatePresence initial={false}>
                              {isExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="pl-4 ml-3 border-l border-white/10 space-y-1 overflow-hidden"
                                >
                                  {node.items.map(item => (
                                    <div
                                      key={item.id}
                                      id={'object-panel-' + item.id}
                                      onClick={(e) => {
                                        internalUIActionRef.current = true;
                                        onSelect(item.id, e.shiftKey || e.ctrlKey || e.metaKey);
                                      }}
                                      className={`px-3 py-1.5 rounded-lg border transition-all duration-300 relative flex items-center justify-between cursor-pointer ${state.selectedIds.includes(item.id) ? 'border-teal-500/50 bg-teal-500/5' : 'border-transparent hover:bg-white/5'}`}
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <div className={`text-white/30 ${state.selectedIds.includes(item.id) ? 'text-teal-500' : ''}`}>
                                          {item.type === 'box' && <Square size={10} />}
                                          {item.type === 'sphere' && <div className="w-2 h-2 rounded-full border border-current" />}
                                          {item.type === 'plane' && <Layout size={10} />}
                                          {item.type === 'model' && <Box size={10} />}
                                        </div>
                                        {editingNameId === item.id ? (
                                          <input
                                            type="text"
                                            value={editingNameValue}
                                            autoFocus
                                            onClick={e => e.stopPropagation()}
                                            className="bg-black/80 border border-teal-500/50 rounded px-1.5 py-0.5 text-[10px] text-white outline-none w-full"
                                            onBlur={() => {
                                              onUpdateItem(item.id, { name: editingNameValue });
                                              setEditingNameId(null);
                                            }}
                                            onKeyDown={e => {
                                              if (e.key === 'Enter') {
                                                onUpdateItem(item.id, { name: editingNameValue });
                                                setEditingNameId(null);
                                              }
                                            }}
                                          />
                                        ) : (
                                          <span
                                            onDoubleClick={(e) => {
                                              e.stopPropagation();
                                              setEditingNameId(item.id);
                                              setEditingNameValue(item.name);
                                            }}
                                            className={`text-[10px] font-bold uppercase tracking-tight truncate ${state.selectedIds.includes(item.id) ? 'text-white' : 'text-white/50'}`}
                                          >
                                            {item.name}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1 pr-1 opacity-40 hover:opacity-300 transition-opacity">
                                        <button
                                          onClick={(e) => { e.stopPropagation(); onUpdateItem(item.id, { visible: item.visible === false }); }}
                                          className="p-1 rounded-md text-white/300 hover:text-amber-500 transition-all"
                                          title={item.visible === false ? "Show object" : "Hide object"}
                                        >
                                          {item.visible !== false ? <Eye size={10} /> : <EyeOff size={10} />}
                                        </button>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); onUpdateItem(item.id, { locked: !item.locked }); }}
                                          className="p-1 rounded-md text-white/300 hover:text-teal-500 transition-all"
                                          title={item.locked ? "Unlock object" : "Lock object"}
                                        >
                                          {!item.locked ? <Unlock size={10} /> : <Lock size={10} />}
                                        </button>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const nextIds = state.selectedIds.filter(sid => sid !== item.id);
                                            onUpdateState({ items: state.items.filter(i => i.id !== item.id), selectedIds: nextIds });
                                          }}
                                          className="p-1 rounded-md text-white/300 hover:text-red-500 transition-all"
                                          title="Delete object"
                                        >
                                          <Trash2 size={10} />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      }
                    })}
                    {state.items.length === 0 && (
                      <div className="py-8 text-center border-2 border-dashed border-white/5 rounded-2xl opacity-30">
                        <span className="text-[10px] font-black uppercase tracking-widest text-white">Empty Scene</span>
                      </div>
                    )}
                  </div>
                </section>

                {selectedItem && (
                  <section id="selected-object-properties" className="space-y-4 pt-4 border-t border-white/5 animate-in slide-in-from-right duration-400">
                    <div className="flex items-center justify-between bg-teal-500/5 p-2 rounded-lg border border-teal-500/10">
                      <div className="flex items-center gap-2">
                        <div className={`w-1 h-1 rounded-full bg-teal-500 shadow-[0_0_10px_${ACCENT_400}] animate-pulse`} />
                        <h2 className="text-[10px] font-black uppercase tracking-widest text-teal-500">{t('Properties', '속성')}</h2>
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      <div className="space-y-1.5">
                        <span className="text-[10px] text-white/30 font-black uppercase tracking-widest">{t('Identity', '이름')}</span>
                        <input
                          type="text"
                          value={selectedItem.name}
                          onChange={(e) => onUpdateItem(selectedItem.id, { name: e.target.value })}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[10px] font-bold text-white focus:border-teal-500/50 outline-none transition-all shadow-inner"
                        />
                      </div>

                      {selectedItem.areaGradient && (
                        <div className="space-y-1.5 pt-1 animate-in fade-in slide-in-from-top-1 duration-300">
                          <div className="flex items-center gap-2 mb-1">
                            <Zap className="w-3 h-3 text-teal-500" />
                            <span className="text-[10px] text-white/30 font-black uppercase tracking-widest">{t('Obstacle Status', '장애 등급 설정')}</span>
                          </div>
                          <select
                            value={selectedItem.status || 'Normal'}
                            onChange={(e) => onUpdateItem(selectedItem.id, { status: e.target.value as any })}
                            className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-[10px] font-bold text-white focus:border-teal-500/50 outline-none transition-all shadow-inner appearance-none cursor-pointer"
                          >
                            <option value="Critical" className="bg-[#1a1a1a] text-red-500 font-bold">CRITICAL (빨강)</option>
                            <option value="Major" className="bg-[#1a1a1a] text-orange-500 font-bold">MAJOR (주황)</option>
                            <option value="Minor" className="bg-[#1a1a1a] text-yellow-500 font-bold">MINOR (노랑)</option>
                            <option value="Warning" className="bg-[#1a1a1a] text-blue-500 font-bold">WARNING (파랑)</option>
                            <option value="Normal" className="bg-[#1a1a1a] text-green-500 font-bold">NORMAL (정상 연두)</option>
                          </select>
                        </div>
                      )}

                      <div className="space-y-4 pt-1">
                        {[
                          { field: 'position', icon: <Move />, label: t('Position', '위치') },
                          { field: 'scale', icon: <Scaling />, label: t('Scale', '크기') },
                          { field: 'rotation', icon: <RotateCw />, label: t('Rotation', '회전') }
                        ].map(config => (
                          <div key={config.field} className="space-y-1.5">
                            <div className="flex items-center gap-1.5 pr-2">
                              <div className="text-teal-500/40">{React.cloneElement(config.icon as any, { size: 10 })}</div>
                              <span className="text-[7.5px] text-white/30 font-black uppercase tracking-widest">{config.label}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-1">
                              {['X', 'Y', 'Z'].map((l, i) => (
                                <div key={l} className="relative group">
                                  <input
                                    type="number" step={config.field === 'rotation' ? "1" : "0.001"}
                                    value={config.field === 'rotation'
                                      ? Math.round((selectedItem.rotation[i] * 180) / Math.PI)
                                      : Number(selectedItem[config.field as 'position' | 'scale' | 'rotation'][i].toFixed(3))
                                    }
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value) || 0;
                                      if (config.field === 'rotation') {
                                        updateField(selectedItem.id, 'rotation', i, val * (Math.PI / 180));
                                      } else {
                                        updateField(selectedItem.id, config.field as any, i, val);
                                      }
                                    }}
                                    className="w-full bg-black/40 border border-white/5 group-hover:border-teal-500/30 rounded px-1.5 py-1 text-center text-[10px] font-mono font-bold text-white outline-none focus:border-teal-500/50 transition-all shadow-inner"
                                  />
                                  <span className="absolute top-0.5 right-1.5 text-[10px] text-white/[0.30] font-black group-hover:text-teal-500/20">{l}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}

                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Box className="w-3 h-3 text-teal-500/40" />
                            <span className="text-[10px] text-white/30 font-black uppercase tracking-widest">{t('Dimensions', '치수')}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-1.5">
                            {['W', 'H', 'D'].map((l, i) => (
                              <div key={l} className="relative group">
                                <input
                                  type="number" step="0.001"
                                  value={Number((selectedItem.dimensions?.[i] ?? 1).toFixed(3))}
                                  onChange={(e) => {
                                    const dims = [...(selectedItem.dimensions || [1, 1, 1])] as [number, number, number];
                                    const val = parseFloat(e.target.value);
                                    dims[i] = isNaN(val) ? 0 : val;
                                    onUpdateItem(selectedItem.id, { dimensions: dims });
                                  }}
                                  className="w-full bg-black/60 border border-white/5 group-hover:border-teal-500/30 rounded-lg px-2 py-2 text-center text-[10px] font-mono font-bold text-white outline-none focus:border-teal-500/50 transition-all shadow-inner"
                                />
                                <span className="absolute top-0.5 right-1.5 text-[10px] text-white/[0.30] font-black group-hover:text-teal-500/20">{l}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="pt-3 border-t border-white/5 space-y-3">
                          {!selectedItem.areaGradient && (
                            <div className="grid grid-cols-4 gap-2">
                              <button
                                onClick={() => onUpdateItem(selectedItem.id, { doubleSide: !selectedItem.doubleSide })}
                                className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all ${!selectedItem.doubleSide ? 'bg-teal-500/10 border-teal-500/30' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                              >
                                <span className="text-[10px] font-black uppercase text-white/50">Culling</span>
                                <span className={`text-[10px] font-black ${!selectedItem.doubleSide ? 'text-teal-500' : 'text-white/30'}`}>{!selectedItem.doubleSide ? 'ACTIVE' : 'OFF'}</span>
                              </button>
                              {(() => {
                                const lowerId = (selectedItem.id || '').toLowerCase();
                                const lowerGroup = (selectedItem.groupId || '').toLowerCase();
                                const isWall = (lowerId.includes('wall') || lowerGroup.includes('wall')) &&
                                  !lowerId.includes('floor') && !lowerId.includes('ceiling');
                                const isBox = selectedItem.type === 'box';
                                const isGlass = lowerId.includes('glass') || lowerGroup.includes('glass');
                                if (!isWall && !isBox && !isGlass) return null;
                                return (
                                  <button
                                    onClick={() => onUpdateItem(selectedItem.id, { showBlackTop: selectedItem.showBlackTop === true ? false : true })}
                                    className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all ${selectedItem.showBlackTop === true ? 'bg-teal-500/10 border-teal-500/30' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                                  >
                                    <span className="text-[10px] font-black uppercase text-white/50">Top Color</span>
                                    <span className={`text-[10px] font-black ${selectedItem.showBlackTop === true ? 'text-teal-500' : 'text-white/30'}`}>{selectedItem.showBlackTop === true ? 'BLACK' : 'OFF'}</span>
                                  </button>
                                );
                              })()}
                            </div>
                          )}

                          {selectedItem.type === 'box' && (
                            <div className="space-y-4 pt-4 border-t border-white/5 animate-in slide-in-from-top-2 duration-300">
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 text-teal-500/40">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="4" /></svg>
                                </div>
                                <span className="text-[10px] text-white/30 font-black uppercase tracking-widest">{t('Rounding', '모서리 둥글리기')}</span>
                              </div>
                              <div className="space-y-4">
                                <div className="space-y-2">
                                  <div className="flex justify-between text-[10px] text-white/50 font-black uppercase tracking-widest">
                                    <span>{t('Radius', '반지름')}</span>
                                    <span className="text-teal-500">{(selectedItem.borderRadius ?? 0).toFixed(3)}</span>
                                  </div>
                                  <input
                                    type="range" min="0" max="2" step="0.001"
                                    value={selectedItem.borderRadius ?? 0}
                                    onChange={(e) => onUpdateItem(selectedItem.id, { borderRadius: parseFloat(e.target.value) })}
                                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-teal-500"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <div className="flex justify-between text-[10px] text-white/50 font-black uppercase tracking-widest">
                                    <span>{t('Segments', '세그먼트')}</span>
                                    <span className="text-teal-500">{selectedItem.borderSegments ?? 4}</span>
                                  </div>
                                  <input
                                    type="range" min="1" max="32" step="1"
                                    value={selectedItem.borderSegments ?? 4}
                                    onChange={(e) => onUpdateItem(selectedItem.id, { borderSegments: parseInt(e.target.value) })}
                                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-teal-500"
                                  />
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="space-y-4 pt-2">
                            {!selectedItem.areaGradient && (
                              <div className={`flex items-center justify-between p-3 bg-black/40 rounded-xl border border-white/5 shadow-inner transition-all ${selectedItem.textureId && selectedItem.textureId !== 'none' ? 'opacity-30 pointer-events-none' : ''}`}>
                                <div className="flex flex-col">
                                  <span className="text-[10px] font-black text-white/50 uppercase tracking-widest leading-none mb-1">{t('Base Color Tint', '베이스 색상 틴트')}</span>
                                  <span className="text-[10px] font-mono text-teal-500 uppercase tracking-widest">{selectedItem.color || 'Default'}</span>
                                </div>
                                <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-white/20 hover:border-teal-500 transition-all shadow-lg">
                                  <input
                                    type="color"
                                    value={selectedItem.color || '#94a3b8'}
                                    onChange={(e) => onUpdateItem(selectedItem.id, { color: e.target.value })}
                                    className="absolute -inset-4 w-16 h-16 cursor-pointer"
                                  />
                                  <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-black/20 to-transparent" />
                                </div>
                              </div>
                            )}

                            {!selectedItem.areaGradient && (
                              <>
                                <div className="space-y-2">
                                  <span className="text-[10px] font-black text-white/50 uppercase tracking-widest px-1">Material Asset</span>
                                  <TextureSelector
                                    textures={allTextures}
                                    selectedId={selectedItem.textureId || 'none'}
                                    onSelect={(tid) => {
                                      const updates: Partial<FurnitureItem> = { textureId: tid };
                                      if (tid !== 'none' && selectedItem.textureTiling === undefined) {
                                        updates.textureTiling = true;
                                      }
                                      onUpdateItem(selectedItem.id, updates);
                                    }}
                                    onEditMaterial={(mid) => {
                                      setActiveTab('materials');
                                      setJumpToMaterialId(mid);
                                    }}
                                    language={state.language}
                                  />
                                </div>



                                {selectedItem.textureId && selectedItem.textureId !== 'none' && (() => {
                                  const appliedTex = allTextures.find(t => t.id === selectedItem.textureId);
                                  if (!appliedTex?.maps?.displacement) return null;
                                  const dispVal = selectedItem.displacementScale ?? appliedTex?.displacementScale ?? 0.1;
                                  return (
                                    <div className="p-3 bg-black/40 rounded-xl border border-white/5 shadow-inner space-y-2">
                                      <div className="flex justify-between text-[10px] font-black text-white/30 uppercase tracking-widest">
                                        <span>Displacement Scale</span>
                                        <EditableNumber
                                          value={dispVal}
                                          onChange={(val) => onUpdateItem(selectedItem.id, { displacementScale: val })}
                                          precision={3}
                                        />
                                      </div>
                                      <input
                                        type="range" min="0" max="1" step="0.001"
                                        value={dispVal}
                                        onChange={(e) => onUpdateItem(selectedItem.id, { displacementScale: parseFloat(e.target.value) })}
                                        className="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-teal-500"
                                      />
                                    </div>
                                  );
                                })()}
                              </>
                            )}
                          </div>

                          {selectedItem.hasGlass && (
                            <div className="p-4 bg-teal-500/5 rounded-2xl border border-teal-500/20 shadow-inner space-y-4 animate-in fade-in slide-in-from-top-2 duration-400">
                              <div className="flex items-center gap-2 mb-1 px-0.5">
                                <Maximize className="w-3.5 h-3.5 text-teal-500" />
                                <span className="text-[10px] font-black text-teal-500 uppercase tracking-widest">{t('Glass Properties', '유리 재질 속성')}</span>
                              </div>

                              <div className="flex items-center justify-between p-3 bg-black/40 rounded-xl border border-white/5 shadow-inner transition-all">
                                <div className="flex flex-col">
                                  <span className="text-[10px] font-black text-white/50 uppercase tracking-widest leading-none mb-1">{t('Glass Tint', '유리 색상')}</span>
                                  <span className="text-[10px] font-mono text-teal-500 uppercase tracking-widest">{selectedItem.glassColor || 'Default'}</span>
                                </div>
                                <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-white/20 hover:border-teal-500 transition-all shadow-lg">
                                  <input
                                    type="color"
                                    value={selectedItem.glassColor || '#ffffff'}
                                    onChange={(e) => onUpdateItem(selectedItem.id, { glassColor: e.target.value })}
                                    className="absolute -inset-4 w-16 h-16 cursor-pointer"
                                  />
                                  <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-black/20 to-transparent" />
                                </div>
                              </div>

                              <div className="space-y-2">
                                <div className="flex justify-between text-[10px] font-black text-white/50 uppercase tracking-widest leading-none">
                                  <span>{t('Glass Opacity', '유리 투명도')}</span>
                                  <span className="text-teal-500">{(selectedItem.glassOpacity ?? 0.3).toFixed(2)}</span>
                                </div>
                                <input
                                  type="range" min="0" max="1" step="0.01"
                                  value={selectedItem.glassOpacity ?? 0.3}
                                  onChange={(e) => onUpdateItem(selectedItem.id, { glassOpacity: parseFloat(e.target.value) })}
                                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-teal-500"
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <div className="flex justify-between text-[10px] font-black text-white/30 uppercase tracking-widest leading-none">
                                    <span>{t('Metalness', '금속성')}</span>
                                    <span className="text-teal-500">{(selectedItem.glassMetalness ?? 1.0).toFixed(1)}</span>
                                  </div>
                                  <input
                                    type="range" min="0" max="1" step="0.1"
                                    value={selectedItem.glassMetalness ?? 1.0}
                                    onChange={(e) => onUpdateItem(selectedItem.id, { glassMetalness: parseFloat(e.target.value) })}
                                    className="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-teal-500"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <div className="flex justify-between text-[10px] font-black text-white/30 uppercase tracking-widest leading-none">
                                    <span>{t('Roughness', '거칠기')}</span>
                                    <span className="text-teal-500">{(selectedItem.glassRoughness ?? 0.0).toFixed(1)}</span>
                                  </div>
                                  <input
                                    type="range" min="0" max="1" step="0.1"
                                    value={selectedItem.glassRoughness ?? 0.0}
                                    onChange={(e) => onUpdateItem(selectedItem.id, { glassRoughness: parseFloat(e.target.value) })}
                                    className="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-teal-500"
                                  />
                                </div>
                              </div>
                            </div>
                          )}

                          {!selectedItem.areaGradient && (
                            <div className="pt-3 space-y-3">
                              <div className="flex items-center justify-between px-1">
                                <div className="flex items-center gap-2">
                                  <Scissors className="w-3 h-3 text-teal-500/40" />
                                  <span className="text-[10px] text-white/30 font-black uppercase tracking-widest">{t('Subtraction System', '객체 결합 및 제거')}</span>
                                </div>
                                <button
                                  onClick={() => {
                                    const newSub = { id: uuidv4(), type: 'box' as const, position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], dimensions: [0.5, 0.5, 0.5] as [number, number, number] };
                                    onUpdateItem(selectedItem.id, { subtractions: [...(selectedItem.subtractions || []), newSub] }, true);
                                    setSelectedSubId(newSub.id);
                                  }}
                                  className="px-2 py-0.5 bg-teal-500/10 hover:bg-teal-500 text-teal-500 hover:text-black rounded-lg text-[10px] font-black uppercase tracking-widest border border-teal-500/20 transition-all"
                                >
                                  {t('Add Hole', '구멍 추가')}
                                </button>
                              </div>
                              <div className="space-y-2">
                                {(selectedItem.subtractions || []).map(sub => (
                                  <div key={sub.id} className="space-y-2">
                                    <div
                                      onClick={() => setSelectedSubId(selectedSubId === sub.id ? null : sub.id)}
                                      className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${selectedSubId === sub.id ? 'bg-teal-500/10 border-teal-500/50' : 'bg-black/40 border-white/5 hover:border-white/10'}`}
                                    >
                                      <div className="flex items-center gap-3">
                                        <div className={`w-2 h-2 rounded-full ${selectedSubId === sub.id ? 'bg-teal-500 shadow-[0_0_8px_#2dd4bf] animate-pulse' : 'bg-white/10'}`} />
                                        <div className="flex flex-col">
                                          <span className="text-[10px] font-black text-white/80 uppercase tracking-widest">{sub.type} Boolean</span>
                                          <span className="text-[10px] text-white/30 font-mono tracking-tighter uppercase">{sub.id.slice(0, 8)}</span>
                                        </div>
                                      </div>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onUpdateItem(selectedItem.id, { subtractions: selectedItem.subtractions?.filter(s => s.id !== sub.id) }, true);
                                          if (selectedSubId === sub.id) setSelectedSubId(null);
                                        }}
                                        className="p-1.5 rounded-lg text-white/30 hover:text-red-500 transition-colors hover:bg-red-500/10"
                                      >
                                        <Trash size={12} />
                                      </button>
                                    </div>
                                    {selectedSubId === sub.id && (
                                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="ml-3 pl-3 border-l-2 border-teal-500/20 space-y-3">
                                        <div className="space-y-2">
                                          <span className="text-[10px] text-white/30 font-black uppercase tracking-widest">Position Matrix</span>
                                          <div className="grid grid-cols-3 gap-1.5">
                                            {['X', 'Y', 'Z'].map((l, i) => (
                                              <input
                                                key={l} type="number" step="0.1"
                                                value={Number(sub.position[i].toFixed(2))}
                                                onChange={(e) => {
                                                  const newSubs = selectedItem.subtractions!.map(s => {
                                                    if (s.id !== sub.id) return s;
                                                    const pos = [...s.position] as [number, number, number];
                                                    pos[i] = parseFloat(e.target.value) || 0;
                                                    return { ...s, position: pos };
                                                  });
                                                  onUpdateItem(selectedItem.id, { subtractions: newSubs }, true);
                                                }}
                                                className="bg-black/60 border border-white/5 rounded-lg px-1 py-1.5 text-center text-[10px] font-mono font-bold text-white outline-none focus:border-teal-500/30 shadow-inner"
                                              />
                                            ))}
                                          </div>
                                        </div>
                                        <div className="space-y-2">
                                          <span className="text-[10px] text-white/30 font-black uppercase tracking-widest">Dimension Matrix</span>
                                          <div className="grid grid-cols-3 gap-1.5">
                                            {['W', 'H', 'D'].map((l, i) => (
                                              <input
                                                key={l} type="number" step="0.1"
                                                value={sub.dimensions[i] ?? 1}
                                                onChange={(e) => {
                                                  const newSubs = selectedItem.subtractions!.map(s => {
                                                    if (s.id !== sub.id) return s;
                                                    const dims = [...s.dimensions] as [number, number, number];
                                                    const val = parseFloat(e.target.value);
                                                    dims[i] = isNaN(val) ? 0 : val;
                                                    return { ...s, dimensions: dims };
                                                  });
                                                  onUpdateItem(selectedItem.id, { subtractions: newSubs }, true);
                                                }}
                                                className="bg-black/60 border border-white/5 rounded-lg px-1 py-1.5 text-center text-[10px] font-mono font-bold text-white outline-none focus:border-teal-500/30 shadow-inner"
                                              />
                                            ))}
                                          </div>
                                        </div>
                                      </motion.div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </section>
                )}
              </div>
            )}

            {activeTab === 'lights' && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
                <section>
                  <div className="flex items-center gap-2.5 mb-1 px-1.5 h-7">
                    <Lightbulb className="w-3.5 h-3.5 text-teal-500" />
                    <h2 className="text-xs font-black uppercase tracking-widest text-white/50">{t('Lighting', '조명 설정')}</h2>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { type: 'point', icon: <Lightbulb size={14} />, color: 'amber' },
                      { type: 'spot', icon: <Zap size={14} />, color: 'teal' },
                      { type: 'directional', icon: <Sun size={14} />, color: 'blue' },
                      { type: 'ambient', icon: <Circle size={14} />, color: 'indigo' }
                    ].map(btn => (
                      <button
                        key={btn.type}
                        onClick={() => onAddLight(btn.type)}
                        className="flex flex-col items-center gap-1.5 p-2 bg-white/[0.03] hover:bg-white/10 border border-white/5 rounded-xl transition-all group"
                      >
                        <div className="text-white/30 group-hover:text-white">{btn.icon}</div>
                        <span className="text-[10px] font-black uppercase text-white/30 group-hover:text-white tracking-widest">{t(btn.type.slice(0, 3), btn.type === 'point' ? '점' : btn.type === 'spot' ? '스포트' : btn.type === 'directional' ? '직사' : '주변')}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <section id="lights-section">
                  <div id="scene-lights-layer" className="flex items-center justify-between mb-1 px-1.5 h-7 scroll-mt-4">
                    <div className="flex items-center gap-2.5">
                      <Layers className="w-3.5 h-3.5 text-teal-500" />
                      <h2 className="text-xs font-black uppercase tracking-widest text-white/50">{t('Scene Lights', '씬 라이트')}</h2>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={toggleAllLightsStatus}
                        className={`p-1 rounded-lg transition-all border ${state.lights.some(l => l.enabled) ? 'bg-amber-500 text-black border-amber-500' : 'bg-white/5 text-white/50 border-white/5 hover:bg-white/10'}`}
                        title="Toggle all lights"
                      >
                        <Power size={12} />
                      </button>
                      <button
                        onClick={() => setShowGizmos(!showGizmos)}
                        className={`p-1 rounded-lg transition-all border ${showGizmos ? 'bg-teal-500 text-black border-teal-500' : 'bg-white/5 text-white/50 border-white/5 hover:bg-white/10'}`}
                        title="Toggle global gizmos"
                      >
                        {showGizmos ? <Unlock size={12} /> : <Lock size={12} />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                    {state.lights.map((light, index) => (
                      <div
                        key={light.id}
                        id={'light-panel-' + light.id}
                        onClick={(e) => {
                          internalUIActionRef.current = true;
                          const isShift = e.shiftKey;
                          const isMulti = e.ctrlKey || e.metaKey;
                          if (isShift && lastSelectedIndexRef.current !== null) {
                            const start = Math.min(lastSelectedIndexRef.current, index);
                            const end = Math.max(lastSelectedIndexRef.current, index);
                            const rangeIds = state.lights.slice(start, end + 1).map(l => l.id);
                            const nextIds = Array.from(new Set([...state.selectedIds, ...rangeIds]));
                            onUpdateState({ selectedIds: nextIds });
                          } else {
                            onSelect(light.id, isMulti);
                            if (!isMulti) lastSelectedIndexRef.current = index;
                          }
                        }}
                        className={`px-3 py-2 rounded-xl border transition-all duration-300 relative overflow-hidden flex items-center justify-between cursor-pointer ${state.selectedIds.includes(light.id) ? 'border-teal-500 bg-teal-500/[0.04] shadow-[0_5px_15px_rgba(45,212,191,0.05)]' : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05]'}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`p-1 rounded-lg transition-all ${light.enabled ? 'bg-amber-500/10 text-amber-500' : 'bg-white/5 text-white/30'}`}>
                            {light.type === 'point' && <Lightbulb size={12} />}
                            {light.type === 'spot' && <Zap size={12} />}
                            {light.type === 'directional' && <Sun size={12} />}
                            {light.type === 'ambient' && <Circle size={12} />}
                          </div>
                          <div className="flex flex-col min-w-0">
                            {editingNameId === light.id ? (
                              <input
                                type="text"
                                value={editingNameValue}
                                autoFocus
                                onClick={e => e.stopPropagation()}
                                className="bg-black/60 border border-teal-500/50 rounded px-1.5 py-0.5 text-[10px] text-white outline-none"
                                onBlur={() => {
                                  onUpdateLight(light.id, { name: editingNameValue });
                                  setEditingNameId(null);
                                }}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    onUpdateLight(light.id, { name: editingNameValue });
                                    setEditingNameId(null);
                                  }
                                }}
                              />
                            ) : (
                              <span
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  setEditingNameId(light.id);
                                  setEditingNameValue(light.name || (light.type.charAt(0).toUpperCase() + light.type.slice(1) + ' Light'));
                                }}
                                className={`text-[10px] font-black uppercase tracking-tight truncate transition-colors ${state.selectedIds.includes(light.id) ? 'text-white' : 'text-white/50'}`}
                              >
                                {light.name || (light.type.charAt(0).toUpperCase() + light.type.slice(1) + ' Light')}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 pr-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); onUpdateLight(light.id, { enabled: !light.enabled }); }}
                            className={`p-1 rounded-md transition-all border ${light.enabled ? 'bg-amber-500 text-black border-amber-500' : 'bg-white/5 text-white/30 border-white/5 hover:bg-white/10'}`}
                          >
                            <Power size={10} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const nextLights = state.lights.filter(l => l.id !== light.id);
                              onUpdateState({ lights: nextLights, selectedIds: state.selectedIds.filter(sid => sid !== light.id) });
                            }}
                            className="p-1 rounded-md hover:bg-red-500 text-white/30 hover:text-black border border-transparent transition-all"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {(() => {
                  const selectedLight = state.lights.find(l => state.selectedIds.includes(l.id));
                  if (!selectedLight) return null;

                  return (
                    <section id="selected-light-properties" className="space-y-6 pt-6 border-t border-white/5 animate-in slide-in-from-right duration-400">
                      <div className="flex items-center justify-between bg-teal-500/5 p-3 rounded-xl border border-teal-500/10">
                        <div className="flex items-center gap-3">
                          <div className="w-1.5 h-1.5 rounded-full bg-teal-500 shadow-[0_0_10px_#2dd4bf] animate-pulse" />
                          <h2 className="text-[10px] font-black uppercase tracking-widest text-teal-500">{t('Properties', '속성')}</h2>
                        </div>
                        <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest">{selectedLight.type} module</span>
                      </div>

                      <div className="space-y-5">
                        {selectedLight.type !== 'ambient' && (
                          <div className="space-y-4">
                            <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.2rem]">{t('Spatial Matrix', '공간 좌표')} ({unit})</span>
                            <div className="grid grid-cols-3 gap-2">
                              {[0, 1, 2].map(i => (
                                <div key={i} className="relative group">
                                  <input
                                    type="number" step={unit === 'm' ? "0.001" : "1"}
                                    value={unit === 'm' ? Number((selectedLight.position?.[i] || 0).toFixed(3)) : Number(((selectedLight.position?.[i] || 0) * 100).toFixed(1))}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value) || 0;
                                      const pos = [...(selectedLight.position || [0, 0, 0])] as [number, number, number];
                                      pos[i] = unit === 'm' ? val : val / 100;
                                      onUpdateLight(selectedLight.id, { position: pos });
                                    }}
                                    className="w-full bg-black/60 border border-white/5 rounded-xl px-2 py-3 text-[11px] font-mono font-bold text-white focus:border-teal-500/50 outline-none transition-all shadow-inner"
                                  />
                                  <span className="absolute top-1 right-2 text-[10px] text-white/[0.30] font-black group-hover:text-teal-500/20">{['X', 'Y', 'Z'][i]}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="space-y-4">
                          <div className="space-y-2">
                            <div className="flex justify-between text-[10px] font-black text-white/30 uppercase tracking-[0.15em]">
                              <span>{t('Flux Intensity', '광도 강도')}</span>
                              <span className="text-teal-500">{selectedLight.intensity.toFixed(2)}</span>
                            </div>
                            <input
                              type="range" min="0" max={selectedLight.type === 'ambient' ? 2 : 10} step="0.01"
                              value={selectedLight.intensity}
                              onChange={(e) => onUpdateLight(selectedLight.id, { intensity: parseFloat(e.target.value) })}
                              className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-teal-500"
                            />
                          </div>

                          {(selectedLight.type === 'point' || selectedLight.type === 'spot') && (
                            <div className="space-y-2">
                              <div className="flex justify-between text-[10px] font-black text-white/30 uppercase tracking-[0.15em]">
                                <span>Beam Distance</span>
                                <span className="text-teal-500">{selectedLight.distance?.toFixed(2) || '0.00'}</span>
                              </div>
                              <input
                                type="range" min="0" max="100" step="0.1"
                                value={selectedLight.distance || 0}
                                onChange={(e) => onUpdateLight(selectedLight.id, { distance: parseFloat(e.target.value) })}
                                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-teal-500"
                              />
                            </div>
                          )}

                          {selectedLight.type === 'spot' && (
                            <>
                              <div className="space-y-2">
                                <div className="flex justify-between text-[10px] font-black text-white/30 uppercase">
                                  <span>{t('Aperture Angle', '조사 각도')}</span>
                                  <span className="text-teal-500">{((selectedLight.angle || 0) * (180 / Math.PI)).toFixed(1)}°</span>
                                </div>
                                <input
                                  type="range" min="0.05" max="1.5" step="0.01"
                                  value={selectedLight.angle || Math.PI / 3}
                                  onChange={(e) => onUpdateLight(selectedLight.id, { angle: parseFloat(e.target.value) })}
                                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-teal-500"
                                />
                              </div>
                              <div className="space-y-2">
                                <div className="flex justify-between text-[10px] font-black text-white/30 uppercase">
                                  <span>{t('Penumbra (Softness)', '반영 (부드러움)')}</span>
                                  <span className="text-teal-500">{(selectedLight.penumbra || 0).toFixed(2)}</span>
                                </div>
                                <input
                                  type="range" min="0" max="1" step="0.01"
                                  value={selectedLight.penumbra || 0}
                                  onChange={(e) => onUpdateLight(selectedLight.id, { penumbra: parseFloat(e.target.value) })}
                                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-teal-500"
                                />
                              </div>
                            </>
                          )}

                          {(selectedLight.type === 'point' || selectedLight.type === 'spot') && (
                            <div className="space-y-2">
                              <div className="flex justify-between text-[10px] font-black text-white/30 uppercase">
                                <span>{t('Beam Decay', '광량 감쇄')}</span>
                                <span className="text-teal-500">{(selectedLight.decay || 1).toFixed(2)}</span>
                              </div>
                              <input
                                type="range" min="0" max="10" step="0.1"
                                value={selectedLight.decay || 2}
                                onChange={(e) => onUpdateLight(selectedLight.id, { decay: parseFloat(e.target.value) })}
                                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-teal-500"
                              />
                            </div>
                          )}

                          {selectedLight.type !== 'ambient' && (
                            <div className="space-y-2 mt-4 mb-2 p-3 bg-black/40 rounded-xl border border-white/5 shadow-inner">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-black text-white/50 uppercase leading-none mt-0.5">{t('Cast Shadows', '그림자 생성')}</span>
                                </div>
                                <button
                                  onClick={() => onUpdateLight(selectedLight.id, { castShadow: selectedLight.castShadow === false ? true : false })}
                                  className={`w-9 h-4.5 rounded-full transition-all relative p-0.5 border ${selectedLight.castShadow !== false ? 'bg-teal-500/20 border-teal-500/30' : 'bg-black/40 border-white/10'}`}
                                >
                                  <div className={`w-3 h-3 rounded-full transition-all ${selectedLight.castShadow !== false ? 'translate-x-[18px] bg-teal-500 shadow-[0_0_10px_rgba(45,212,191,0.5)]' : 'translate-x-0 bg-white/20'}`} />
                                </button>
                              </div>

                              {selectedLight.castShadow !== false && (
                                <div className="pt-3 mt-1 border-t border-white/10 space-y-2">
                                  <div className="flex justify-between text-[10px] font-black text-white/30 uppercase">
                                    <span>{t('Shadow Softness', '그림자 부드러움')}</span>
                                    <span className="text-teal-500">{Number(selectedLight.shadowRadius ?? 2).toFixed(1)}</span>
                                  </div>
                                  <input
                                    type="range" min="0.5" max="15" step="0.5"
                                    value={selectedLight.shadowRadius ?? 2}
                                    onChange={(e) => onUpdateLight(selectedLight.id, { shadowRadius: parseFloat(e.target.value) })}
                                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-teal-500"
                                  />
                                </div>
                              )}
                            </div>
                          )}

                          <div className="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-white/5 shadow-inner mt-2">
                            <div className="flex flex-col">
                              <span className="text-[10px] font-black text-white/50 uppercase leading-none mb-1">{t('Chromaticity Vector', '색도 벡터')}</span>
                              <span className="text-[10px] font-mono text-teal-500 uppercase tracking-widest">{selectedLight.color}</span>
                            </div>
                            <div className="relative w-10 h-10 rounded-xl overflow-hidden border border-white/20 hover:border-teal-500 transition-all shadow-lg">
                              <input
                                type="color"
                                value={selectedLight.color}
                                onChange={(e) => onUpdateLight(selectedLight.id, { color: e.target.value })}
                                className="absolute -inset-4 w-20 h-20 cursor-pointer"
                              />
                              <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-black/20 to-transparent" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>
                  );
                })()}

                {state.lights.length === 0 && (
                  <div className="py-12 text-center border-2 border-dashed border-white/5 rounded-[40px] bg-black/20">
                    <Layers className="w-10 h-10 text-white/30 mx-auto mb-4" />
                    <p className="text-[10px] text-white/30 font-black uppercase">No active nodes</p>
                  </div>
                )}
              </div>
            )}


            {activeTab === 'materials' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-2 duration-300 pb-12">


                <section>
                  <div className="flex items-center justify-between mb-4 px-1.5 h-7">
                    <div className="flex items-center gap-2.5">
                      <Layers className="w-3.5 h-3.5 text-teal-500" />
                      <h2 className="text-xs font-black uppercase text-white/50">{t('Custom Materials', '커스텀 재질 관리')}</h2>
                    </div>
                    <button
                      onClick={() => {
                        const newId = uuidv4();
                        const newTex: TextureConfig = { id: newId, name: 'New Material', color: '#ffffff', opacity: 1, metalness: 0.1, roughness: 0.7, displacementScale: 0, isCustom: true };
                        onUpdateState({ customTextures: [...(state.customTextures || []), newTex] });
                      }}
                      className="p-1.5 bg-teal-500/10 hover:bg-teal-500 text-teal-500 hover:text-black rounded-lg transition-all"
                      title={t('Add New Material', '새 재질 추가')}
                    >
                      <Plus size={12} />
                    </button>
                  </div>



                  <TextureManagerPanel
                    textures={state.customTextures || []}
                    expandedId={jumpToMaterialId}
                    onExpandedChange={(id) => {
                      if (id !== jumpToMaterialId) setJumpToMaterialId(id);
                    }}
                    onUpdate={(id, updates) => {
                      const next = (state.customTextures || []).map(t => t.id === id ? { ...t, ...updates } : t);
                      onUpdateState({ customTextures: next });
                    }}
                    onDelete={(id) => onUpdateState({ customTextures: (state.customTextures || []).filter(t => t.id !== id) })}
                    onAddNew={() => {
                      const newId = uuidv4();
                      const newTex = { id: newId, name: 'New Material', color: '#ffffff', opacity: 1, metalness: 0.1, roughness: 0.7, isCustom: true };
                      onUpdateState({ customTextures: [...(state.customTextures || []), newTex] });
                    }}
                    language={state.language}
                  />
                </section>
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-2 duration-300 pb-12">
                <section>
                  <div className="flex items-center gap-2.5 mb-1 px-1.5 h-7">
                    <Sun className="w-3.5 h-3.5 text-teal-500" />
                    <h2 className="text-xs font-black uppercase text-white/50">{t('Environment', '환경 설정')}</h2>
                  </div>

                  <div className="mt-4 space-y-4 px-1.5">
                    <div className="space-y-3 p-3 bg-black/40 rounded-xl border border-white/5 shadow-inner">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">{t('Background Color', '배경 색상')}</span>
                          <span className="text-[10px] text-white/30 uppercase tracking-tighter">{t('Solid canvas backdrop', '단색 배경 채우기')}</span>
                        </div>
                        <button
                          onClick={() => onUpdateState({ showBackgroundColor: !state.showBackgroundColor })}
                          className={`w-10 h-5 rounded-full transition-all relative p-0.5 border ${state.showBackgroundColor ? 'bg-teal-500/20 border-teal-500/30' : 'bg-black/40 border-white/10'}`}
                        >
                          <div className={`w-3.5 h-3.5 rounded-full transition-all ${state.showBackgroundColor ? 'translate-x-5 bg-teal-500 shadow-[0_0_10px_rgba(45,212,191,0.5)]' : 'translate-x-0 bg-white/20'}`} />
                        </button>
                      </div>

                      {state.showBackgroundColor && (
                        <div className="pt-3 border-t border-white/5 space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                          <div className="grid grid-cols-4 gap-1 bg-black/40 p-1 rounded-xl border border-white/5">
                            {[
                              { id: 'solid', label: t('Solid', '단색') },
                              { id: 'linear', label: t('Linear', '선형') },
                              { id: 'radial', label: t('Radial', '원형') },
                              { id: 'image', label: t('Image', '이미지') }
                            ].map(type => (
                              <button
                                key={type.id}
                                onClick={() => onUpdateState({ backgroundType: type.id as any })}
                                className={`px-2 py-1.5 rounded-lg text-[10px] font-black transition-all ${state.backgroundType === type.id ? 'bg-teal-500 text-black shadow-lg shadow-teal-500/20' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                              >
                                {type.label}
                              </button>
                            ))}
                          </div>

                          {(state.backgroundType === 'linear' || state.backgroundType === 'radial') && (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between px-1">
                                <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">{t('Color Stops', '색상 단계')}</span>
                                <button
                                  onClick={() => {
                                    const stops = [...(state.backgroundStops || [])];
                                    stops.push({ color: '#ffffff', offset: 100 });
                                    onUpdateState({ backgroundStops: stops });
                                  }}
                                  className="p-1 text-teal-500 hover:bg-teal-500/10 rounded-lg transition-colors"
                                >
                                  <Plus size={12} />
                                </button>
                              </div>

                              <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
                                {(state.backgroundStops || []).map((stop, idx) => (
                                  <div key={idx} className="flex items-center gap-2 bg-black/20 p-2 rounded-xl border border-white/5 group">
                                    <div className="relative w-6 h-6 rounded-lg overflow-hidden border border-white/10 shrink-0">
                                      <input
                                        type="color"
                                        value={stop.color}
                                        onChange={(e) => {
                                          const stops = [...(state.backgroundStops || [])];
                                          stops[idx].color = e.target.value;
                                          onUpdateState({ backgroundStops: stops });
                                        }}
                                        className="absolute -inset-4 w-14 h-14 cursor-pointer"
                                      />
                                    </div>
                                    <div className="flex-1 space-y-1">
                                      <div className="flex justify-between text-[9px] font-mono text-white/40">
                                        <span>{stop.color.toUpperCase()}</span>
                                        <span>{stop.offset}%</span>
                                      </div>
                                      <input
                                        type="range" min="0" max="100"
                                        value={stop.offset}
                                        onChange={(e) => {
                                          const stops = [...(state.backgroundStops || [])];
                                          stops[idx].offset = parseInt(e.target.value);
                                          onUpdateState({ backgroundStops: stops });
                                        }}
                                        className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-teal-500"
                                      />
                                    </div>
                                    {(state.backgroundStops || []).length > 2 && (
                                      <button
                                        onClick={() => {
                                          const stops = (state.backgroundStops || []).filter((_, i) => i !== idx);
                                          onUpdateState({ backgroundStops: stops });
                                        }}
                                        className="p-1 text-white/10 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>

                              {state.backgroundType === 'linear' && (
                                <div className="space-y-2 pt-2 border-t border-white/5">
                                  <div className="flex justify-between text-[10px] font-black text-white/30 uppercase tracking-widest">
                                    <span>{t('Angle', '각도')}</span>
                                    <span className="text-teal-500">{state.backgroundAngle}°</span>
                                  </div>
                                  <input
                                    type="range" min="0" max="360"
                                    value={state.backgroundAngle}
                                    onChange={(e) => onUpdateState({ backgroundAngle: parseInt(e.target.value) })}
                                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-teal-500"
                                  />
                                </div>
                              )}
                            </div>
                          )}

                          {state.backgroundType === 'image' && (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between px-1">
                                <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">{t('Background Image', '배경 이미지')}</span>
                              </div>

                              <div className="space-y-3">
                                {state.backgroundImage ? (
                                  <div
                                    className={`relative group rounded-2xl overflow-hidden border transition-all aspect-video flex items-center justify-center ${isDraggingBackground ? 'border-teal-500 bg-teal-500/10 scale-95' : 'border-white/10 bg-black/40'}`}
                                    onDragOver={(e) => { e.preventDefault(); setIsDraggingBackground(true); }}
                                    onDragLeave={() => setIsDraggingBackground(false)}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      setIsDraggingBackground(false);
                                      const file = e.dataTransfer.files?.[0];
                                      if (file && file.type.startsWith('image/')) {
                                        const reader = new FileReader();
                                        reader.onload = (ev) => onUpdateState({ backgroundImage: ev.target?.result as string });
                                        reader.readAsDataURL(file);
                                      }
                                    }}
                                  >
                                    <img src={state.backgroundImage} alt="Background" className="w-full h-full object-cover opacity-50 transition-all group-hover:opacity-70" />
                                    <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                      <button
                                        onClick={() => {
                                          const input = document.createElement('input');
                                          input.type = 'file';
                                          input.accept = 'image/*';
                                          input.onchange = async (e) => {
                                            const file = (e.target as HTMLInputElement).files?.[0];
                                            if (file) {
                                              const reader = new FileReader();
                                              reader.onload = (ev) => onUpdateState({ backgroundImage: ev.target?.result as string });
                                              reader.readAsDataURL(file);
                                            }
                                          };
                                          input.click();
                                        }}
                                        className="p-2 bg-teal-500 text-black rounded-xl hover:scale-110 transition-all shadow-xl"
                                      >
                                        <RefreshCw size={14} />
                                      </button>
                                      <button
                                        onClick={() => onUpdateState({ backgroundImage: undefined })}
                                        className="p-2 bg-red-500 text-white rounded-xl hover:scale-110 transition-all shadow-xl"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                    {isDraggingBackground && (
                                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-teal-500/20 backdrop-blur-sm">
                                        <Upload className="text-teal-400 animate-bounce" size={24} />
                                        <span className="text-[10px] font-black text-teal-400 uppercase mt-2">{t('Drop to Replace', '이미지 교체')}</span>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => {
                                      const input = document.createElement('input');
                                      input.type = 'file';
                                      input.accept = 'image/*';
                                      input.onchange = async (e) => {
                                        const file = (e.target as HTMLInputElement).files?.[0];
                                        if (file) {
                                          const reader = new FileReader();
                                          reader.onload = (ev) => onUpdateState({ backgroundImage: ev.target?.result as string });
                                          reader.readAsDataURL(file);
                                        }
                                      };
                                      input.click();
                                    }}
                                    onDragOver={(e) => { e.preventDefault(); setIsDraggingBackground(true); }}
                                    onDragLeave={() => setIsDraggingBackground(false)}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      setIsDraggingBackground(false);
                                      const file = e.dataTransfer.files?.[0];
                                      if (file && file.type.startsWith('image/')) {
                                        const reader = new FileReader();
                                        reader.onload = (ev) => onUpdateState({ backgroundImage: ev.target?.result as string });
                                        reader.readAsDataURL(file);
                                      }
                                    }}
                                    className={`w-full py-8 border-2 border-dashed rounded-[24px] flex flex-col items-center justify-center gap-3 transition-all group ${isDraggingBackground ? 'border-teal-500 bg-teal-500/10 scale-95 shadow-[0_0_30px_rgba(20,184,166,0.1)]' : 'border-white/5 bg-black/40 hover:border-teal-500/50 hover:bg-teal-500/5'}`}
                                  >
                                    <div className={`p-3 rounded-full transition-all ${isDraggingBackground ? 'bg-teal-500 text-black scale-110' : 'bg-white/5 text-white/20 group-hover:bg-teal-500/20 group-hover:text-teal-500'}`}>
                                      <Image size={20} />
                                    </div>
                                    <span className={`text-[10px] font-black uppercase tracking-widest transition-all ${isDraggingBackground ? 'text-teal-400' : 'text-white/30 group-hover:text-white'}`}>
                                      {isDraggingBackground ? t('Drop Now', '지금 놓으세요') : t('Upload or Drag Image', '이미지 업로드 / 드래그')}
                                    </span>
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Solid Color Input */}
                          {state.backgroundType === 'solid' && (
                            <div className="space-y-2">
                              <div className="flex justify-between text-[10px] font-black text-white/30 uppercase tracking-widest leading-none">
                                <span>{t('Backdrop Color', '배경 색상')}</span>
                                <span className="text-teal-500 font-mono uppercase">{state.backgroundColor}</span>
                              </div>
                              <div className="flex gap-2">
                                <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-white/20 hover:border-teal-500 transition-all shrink-0 shadow-lg">
                                  <input
                                    type="color"
                                    value={state.backgroundColor?.startsWith('#') ? state.backgroundColor.slice(0, 7) : '#ffffff'}
                                    onChange={(e) => onUpdateState({ backgroundColor: e.target.value })}
                                    className="absolute -inset-4 w-16 h-16 cursor-pointer"
                                  />
                                  <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-black/20 to-transparent" />
                                </div>
                                <input
                                  type="text"
                                  placeholder="#FFFFFF"
                                  value={state.backgroundColor}
                                  onChange={(e) => onUpdateState({ backgroundColor: e.target.value })}
                                  className="w-full h-8 bg-black/40 text-white text-[10px] px-3 rounded-lg border border-white/10 outline-none focus:border-teal-500 transition-colors font-mono"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                {/* 4. Post-processing Section */}
                <section className="pt-6 border-t border-white/5 space-y-4">
                  <div className="flex items-center gap-2.5 mb-1 px-1.5 h-7">
                    <Maximize className="w-3.5 h-3.5 text-teal-500" />
                    <h2 className="text-xs font-black uppercase tracking-widest text-white/50">{t('Post Processing', '후처리 설정')}</h2>
                  </div>

                  <div className="space-y-4 px-1.5">


                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] font-black text-white/50 uppercase tracking-widest leading-none">
                        <span>{t('Bloom Intensity', '블룸 강도')}</span>
                        <span className="text-teal-500">{(state.bloomIntensity || 0).toFixed(2)}</span>
                      </div>
                      <input
                        type="range" min="0" max="5" step="0.01"
                        value={state.bloomIntensity || 0}
                        onChange={(e) => onUpdateState({ bloomIntensity: parseFloat(e.target.value) })}
                        className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-teal-500"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] font-black text-white/50 uppercase tracking-widest leading-none">
                        <span>{t('Bloom Threshold', '블룸 임계값')}</span>
                        <span className="text-teal-500">{(state.bloomThreshold || 0).toFixed(2)}</span>
                      </div>
                      <input
                        type="range" min="0" max="2" step="0.01"
                        value={state.bloomThreshold || 0}
                        onChange={(e) => onUpdateState({ bloomThreshold: parseFloat(e.target.value) })}
                        className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-teal-500"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] font-black text-white/50 uppercase tracking-widest leading-none">
                        <span>{t('Bloom Smoothing', '블룸 부드러움')}</span>
                        <span className="text-teal-500">{(state.bloomSmoothing || 0).toFixed(2)}</span>
                      </div>
                      <input
                        type="range" min="0" max="1" step="0.01"
                        value={state.bloomSmoothing || 0}
                        onChange={(e) => onUpdateState({ bloomSmoothing: parseFloat(e.target.value) })}
                        className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-teal-500"
                      />
                    </div>
                  </div>
                </section>

                {/* 4. Scene Management Section */}
                <section className="pt-6 border-t border-white/5 space-y-3">
                  <div className="flex items-center gap-2.5 mb-1 px-1.5 h-7">
                    <Settings className="w-3.5 h-3.5 text-teal-500" />
                    <h2 className="text-xs font-black uppercase tracking-widest text-white/50">{t('Scene Management', '씬 관리')}</h2>
                  </div>
                  <div className="space-y-2">


                    <div className="pt-3 border-t border-white/5 mt-2">
                      <div className="text-[10px] font-black text-white/30 uppercase tracking-[0.1em] px-1.5 mb-2 flex items-center gap-2">
                        <Upload size={10} /> {t('Scene Configuration', '씬 구성 설정')}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => onExport('json')}
                          className="flex items-center justify-center gap-3 px-4 py-3 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white font-black uppercase tracking-widest rounded-xl text-[10px] transition-all border border-white/5 group"
                        >
                          <Download size={14} /> {t('Export JSON', 'JSON 내보내기')}
                        </button>
                        <label className="flex items-center justify-center gap-3 px-4 py-3 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white font-black uppercase tracking-widest rounded-xl text-[10px] transition-all border border-white/5 cursor-pointer group">
                          <Upload size={14} /> {t('Import JSON', 'JSON 불러오기')}
                          <input type="file" accept=".json" className="hidden" onChange={onImport} />
                        </label>
                      </div>
                    </div>
                  </div>
                </section>

                {/* 5. System Footer */}
                <div className="mt-6 pt-6 border-t border-white/5 opacity-50">
                  <div className="bg-black/40 p-4 rounded-2xl border border-white/5 shadow-inner">
                    <p className="text-[10px] font-mono leading-relaxed text-white/30 uppercase space-y-1">
                      <span className="block border-b border-white/5 pb-2 mb-2 text-teal-500/80 font-black text-[10px]">{t('Engine Status', '엔진 상태')} (V4.2)</span>
                      <span className="flex justify-between"><span>{t('Core', '코어')}:</span> <span className="text-white/60">PHYSICAL_PBR_BETA</span></span>
                      <span className="flex justify-between"><span>{t('Active Nodes', '활성 노드')}:</span> <span className="text-white/60">{state.items.length + state.lights.length} CHANNEL(S)</span></span>
                      <span className="flex justify-between"><span>{t('Render State', '렌더링 상태')}:</span> <span className="text-teal-500/50">STABLE_DIFFUSION_O1</span></span>
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      <button
        style={{
          right: sidebarOpen ? '345px' : '15px',
          transition: 'right 0.5s ease-in-out'
        }}
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="absolute top-1/2 -translate-y-1/2 z-50 bg-[#0a0a0a]/80 backdrop-blur-xl hover:bg-teal-500 text-white hover:text-black p-2 rounded-full border border-white/10 transition-all pointer-events-auto shadow-[0_15px_35px_rgba(0,0,0,0.5)] group"
      >
        {sidebarOpen ? <ChevronRight size={18} className="group-hover:scale-110 transition-transform" /> : <ChevronLeft size={18} className="group-hover:scale-110 transition-transform" />}
      </button>

      {/* Floorplan to SVG Modal */}
      <FloorplanToSvg
        isOpen={!!state.showFloorplanModal}
        onClose={() => onUpdateState({ showFloorplanModal: false })}
        onApply={(svgData) => {
          if (onSvgUpload) {
            const blob = new Blob([svgData], { type: 'image/svg+xml' });
            const file = new File([blob], "edited_floorplan.svg", { type: 'image/svg+xml' });
            onSvgUpload([file]);
          }
        }}
        language={state.language}
        onLanguageChange={(lang) => onUpdateState({ language: lang })}
        persistedState={state.floorplanPersistedState}
        onStateChange={handleFloorplanStateChange}
      />
      <GLBCompressor
        isOpen={showCompressor}
        onClose={() => setShowCompressor(false)}
        language={state.language}
        files={compressionFiles}
        onAddFiles={addCompressionFiles}
        onRemoveFile={removeCompressionFile}
        onClearFiles={clearCompressionFiles}
        onDownloadFile={downloadCompressedFile}
      />

      <AnimatePresence>
        {isCompressing && !showCompressor && (
          <motion.div
            initial={{ opacity: 0, y: 50, right: '384px' }}
            animate={{
              opacity: 1,
              y: 0,
              right: sidebarOpen ? '384px' : '24px'
            }}
            exit={{ opacity: 0, y: 20 }}
            onClick={() => setShowCompressor(true)}
            className="fixed bottom-6 z-[9000] bg-[#0a0a0a]/80 backdrop-blur-xl border border-white/10 rounded-full py-2 px-5 flex items-center gap-4 shadow-2xl cursor-pointer hover:bg-[#111]/90 transition-all group overflow-hidden"
          >
            <div className="absolute inset-0 bg-teal-500/5 group-hover:bg-teal-500/10 transition-colors" />
            <Loader2 className="relative w-3.5 h-3.5 text-teal-500 animate-spin" />
            <div className="relative flex items-center gap-3">
              <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.15em] whitespace-nowrap">
                {t('Optimizing Assets', '에셋 최적화 중')}
              </span>
              <div className="w-24 h-1 bg-white/5 rounded-full overflow-hidden border border-white/5">
                <motion.div
                  className="h-full bg-teal-500 shadow-[0_0_8px_rgba(45,212,191,0.5)]"
                  initial={{ width: 0 }}
                  animate={{ width: `${totalCompressionProgress}%` }}
                  transition={{ type: 'spring', stiffness: 50, damping: 20 }}
                />
              </div>
              <span className="text-teal-500 font-mono font-black text-[10px] min-w-[32px] text-right">
                {Math.round(totalCompressionProgress)}%
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCompletionToast && !isCompressing && !showCompressor && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9, right: '384px' }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              right: sidebarOpen ? '384px' : '24px'
            }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-6 z-[9000] bg-[#0a0a0a]/95 backdrop-blur-2xl border border-teal-500/30 rounded-3xl p-6 flex flex-col gap-4 shadow-2xl min-w-[320px]"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-500/20 rounded-2xl flex items-center justify-center border border-green-500/30">
                <CheckCircle className="w-6 h-6 text-green-500" />
              </div>
              <div className="flex flex-col">
                <h4 className="text-white font-bold text-sm uppercase tracking-tight">
                  {t('Compression Completed', '압축 최적화 완료')}
                </h4>
                <p className="text-white/40 text-[10px] font-medium">
                  {t('Your files are ready', '파일 최적화가 완료되었습니다.')}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowCompressor(true); setShowCompletionToast(false); }}
                className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[11px] font-bold uppercase tracking-widest py-3 rounded-xl flex items-center justify-center gap-2 transition-all"
              >
                <ExternalLink size={14} className="text-teal-500" />
                {t('View', '모달 이동')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
