import React, { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, Upload, Image as ImageIcon } from 'lucide-react';
import { TextureConfig, identifyTextureType } from '../types';

interface TextureManagerPanelProps {
  textures: TextureConfig[];
  onUpdate: (id: string, updates: Partial<TextureConfig>) => void;
  onDelete: (id: string) => void;
  onAddNew: () => void;
  language?: 'en' | 'ko';
  expandedId?: string | null;
  onExpandedChange?: (id: string | null) => void;
}

export const TextureManagerPanel: React.FC<TextureManagerPanelProps> = ({ 
  textures = [], onUpdate, onDelete, onAddNew, language = 'en', 
  expandedId: externalExpandedId, onExpandedChange 
}) => {
  const [internalExpandedId, setInternalExpandedId] = useState<string | null>(null);
  const t = (en: string, ko: string) => (language === 'ko' ? ko : en);

  const expandedId = externalExpandedId !== undefined ? externalExpandedId : internalExpandedId;
  const setExpandedId = (id: string | null) => {
    if (onExpandedChange) onExpandedChange(id);
    setInternalExpandedId(id);
  };

  React.useEffect(() => {
    if (externalExpandedId) {
      setInternalExpandedId(externalExpandedId);
    }
  }, [externalExpandedId]);

  return (
    <div className="flex flex-col gap-2">
      <div className="space-y-1.5">
        {textures && textures.length === 0 && <div className="text-[10px] text-white/20 italic text-center py-3 border border-white/5 border-dashed rounded-xl">{t('No custom textures', '등록된 커스텀 재질이 없습니다')}</div>}
        {textures.map((tex) => (
          <div key={tex.id} className={`bg-white/2 rounded-xl border transition-all ${expandedId === tex.id ? 'border-teal-500/30 bg-white/5' : 'border-white/5 hover:bg-white/5'}`}>
            <div className="flex items-center justify-between p-2.5 cursor-pointer" onClick={() => setExpandedId(expandedId === tex.id ? null : tex.id)}>
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="w-6 h-6 rounded-lg bg-black/40 shrink-0 overflow-hidden border border-white/10 shadow-inner">
                  {tex.url || tex.maps?.color ? (
                    <img src={tex.maps?.color || tex.url} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <div className="w-full h-full" style={{ backgroundColor: tex.color || '#999' }} />
                  )}
                </div>
                <span className="text-[10px] font-bold truncate text-white/80">{tex.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={(e) => { e.stopPropagation(); onDelete(tex.id); }} className="p-1.5 text-white/20 hover:text-red-500 transition-colors hover:bg-red-500/10 rounded-lg"><Trash2 size={12} /></button>
                <div className="text-white/10">{expandedId === tex.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</div>
              </div>
            </div>
            {expandedId === tex.id && (
              <div className="p-3 border-t border-white/5 space-y-4 bg-black/40 shadow-inner">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <span className="text-[10px] text-white/30 font-black uppercase pl-1">{t('Material Name', '재질 이름')}</span>
                    <input 
                      type="text" 
                      value={tex.name} 
                      onChange={(e) => onUpdate(tex.id, { name: e.target.value })} 
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-[10px] text-white focus:border-teal-500/50 outline-none transition-all" 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-[10px] text-white/30 font-black uppercase pl-1">{t('Color Tint', '색상 틴트')}</span>
                    <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-2 py-1.5 h-[34px]">
                      <div className="relative w-5 h-5 rounded-md overflow-hidden border border-white/20 shadow-lg">
                         <input 
                          type="color" 
                          value={tex.color || '#ffffff'} 
                          onChange={(e) => onUpdate(tex.id, { color: e.target.value })} 
                          className="absolute -inset-2 w-10 h-10 bg-transparent border-none cursor-pointer p-0" 
                        />
                      </div>
                      <span className="text-[10px] font-mono text-white/40 uppercase">{tex.color || '#FFFFFF'}</span>
                    </div>
                  </div>
                </div>

                {/* Map Grid */}
                <div className="space-y-2">
                  <span className="text-[10px] text-white/30 font-black uppercase pl-1">{t('Texture Maps', '텍스처 맵')}</span>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { key: 'color', label: t('Color', '색상') },
                      { key: 'normal', label: t('Normal', '노멀') },
                      { key: 'roughness', label: t('Rough', '러프니스') },
                      { key: 'metalness', label: t('Metal', '메탈릭') },
                      { key: 'displacement', label: t('Disp', '변위') },
                      { key: 'ao', label: t('AO', '교합') },
                      { key: 'emissive', label: t('Emit', '방사') },
                    ].map(map => {
                      const mapType = map.key as keyof NonNullable<TextureConfig['maps']>;
                      const hasMap = tex.maps?.[mapType];
                      return (
                        <div key={map.key} className="relative group/map">
                          <label className={`flex flex-col items-center justify-center aspect-square rounded-xl border-2 border-dashed transition-all cursor-pointer overflow-hidden ${hasMap ? 'border-teal-500/50 bg-teal-500/5' : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/10'}`}>
                            <input 
                              type="file" 
                              accept="image/*" 
                              className="hidden" 
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onload = (ev) => {
                                    const url = ev.target?.result as string;
                                    const detectedType = identifyTextureType(file.name);
                                    const newMaps = { ...(tex.maps || {}), [detectedType]: url };
                                    onUpdate(tex.id, { maps: newMaps });
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                            {hasMap ? (
                              <img src={tex.maps![mapType]} className="w-full h-full object-cover" alt="" />
                            ) : (
                              <div className="flex flex-col items-center gap-1">
                                <Upload size={10} className="text-white/20" />
                                <span className="text-[10px] font-black uppercase tracking-tight text-white/20">{map.label}</span>
                              </div>
                            )}
                            {hasMap && (
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/map:opacity-100 flex items-center justify-center transition-opacity">
                                <Trash2 size={10} className="text-red-500" onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const nextMaps = { ...(tex.maps || {}) };
                                  delete nextMaps[mapType];
                                  onUpdate(tex.id, { maps: nextMaps });
                                }} />
                              </div>
                            )}
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-4 pt-2">
                  {[
                    { label: t('Opacity', '투명도'), field: 'opacity', default: 1 },
                    { label: t('Metalness', '금속성'), field: 'metalness', default: 0.1 },
                    { label: t('Roughness', '거칠기'), field: 'roughness', default: 0.7 },
                    { label: t('Emit Intensity', '방사 강도'), field: 'emissiveIntensity', default: 0 },
                    { label: t('Disp Scale', '변위 스케일'), field: 'displacementScale', default: 0.1 }
                  ].map(slider => (
                    <div key={slider.field} className="space-y-1.5 group/slider">
                      <div className="flex justify-between text-[10px] text-white/30 font-black uppercase pl-1">
                        <span>{slider.label}</span>
                        <span className="text-teal-500 opacity-0 group-hover/slider:opacity-100 transition-opacity">{(tex as any)[slider.field] ?? slider.default}</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max={slider.field === 'emissiveIntensity' ? "10" : slider.field === 'displacementScale' ? "2" : "1"} 
                        step={slider.field === 'displacementScale' ? "0.001" : "0.01"} 
                        value={(tex as any)[slider.field] ?? slider.default} 
                        onChange={(e) => onUpdate(tex.id, { [slider.field]: parseFloat(e.target.value) })} 
                        className="w-full accent-teal-500 h-1 bg-white/5 rounded-full appearance-none cursor-pointer hover:bg-white/10 transition-colors" 
                      />
                    </div>
                  ))}

                  <div className="space-y-4 pt-4 border-t border-white/5">
                    <div className="flex items-center justify-between px-1.5 py-1 bg-white/5 rounded-xl border border-white/5">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">{t('Reflection', '반사 적용')}</span>
                        <span className="text-[8px] text-white/20 uppercase tracking-tighter">{t('Enable real-time floor mirror effects', '실시간 바닥 거울 반사 효과 활성화')}</span>
                      </div>
                      <button
                        onClick={() => onUpdate(tex.id, { showReflection: !tex.showReflection })}
                        className={`w-10 h-5 rounded-full transition-all relative p-0.5 border ${tex.showReflection ? 'bg-teal-500/20 border-teal-500/30' : 'bg-black/40 border-white/10'}`}
                      >
                        <div className={`w-3.5 h-3.5 rounded-full transition-all ${tex.showReflection ? 'translate-x-5 bg-teal-500 shadow-[0_0_10px_rgba(45,212,191,0.5)]' : 'translate-x-0 bg-white/20'}`} />
                      </button>
                    </div>

                    {tex.showReflection && (
                      <div className="space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                        {[
                          { label: t('Reflectivity', '반사율'), field: 'reflectivity', default: 1, min: 0, max: 1 },
                          { label: t('Blur X', '흐림도 X'), field: 'blurX', default: 300, min: 0, max: 2000 },
                          { label: t('Blur Y', '흐림도 Y'), field: 'blurY', default: 300, min: 0, max: 2000 },
                          { label: t('Mix Blur', '혼합 흐림도'), field: 'mixBlur', default: 10, min: 0, max: 50 },
                          { label: t('Mix Strength', '혼합 강도'), field: 'mixStrength', default: 10, min: 0, max: 50 },
                          { label: t('Depth Scale', '깊이 스케일'), field: 'depthScale', default: 0.5, min: 0, max: 10 },
                          { label: t('Min Depth', '최소 깊이'), field: 'minDepth', default: 0.4, min: 0, max: 10 },
                          { label: t('Max Depth', '최대 깊이'), field: 'maxDepth', default: 1.4, min: 0, max: 100 },
                          { label: t('Resolution', '해상도'), field: 'resolution', default: 1024, min: 256, max: 2048, step: 256 }
                        ].map(slider => (
                          <div key={slider.field} className="space-y-1.5 group/slider">
                            <div className="flex justify-between text-[10px] text-white/30 font-black uppercase pl-1">
                              <span>{slider.label}</span>
                              <span className="text-teal-500 opacity-0 group-hover/slider:opacity-100 transition-opacity">{(tex as any)[slider.field] ?? slider.default}</span>
                            </div>
                            <input 
                              type="range" 
                              min={slider.min} 
                              max={slider.max} 
                              step={slider.step ?? (slider.max > 10 ? "1" : "0.01")} 
                              value={(tex as any)[slider.field] ?? slider.default} 
                              onChange={(e) => onUpdate(tex.id, { [slider.field]: parseFloat(e.target.value) })} 
                              className="w-full accent-teal-500 h-1 bg-white/5 rounded-full appearance-none cursor-pointer hover:bg-white/10 transition-colors" 
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
