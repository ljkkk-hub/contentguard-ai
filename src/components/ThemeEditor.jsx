import { useState } from 'react';
import { X, Palette, ChevronDown, ChevronRight, RotateCcw, Check } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { THEME_PRESETS, COLOR_LABELS, COLOR_GROUPS, EFFECT_LABELS } from '../lib/themes';

export default function ThemeEditor({ open, onClose }) {
  const { themeId, colors, customColors, effects, isDark, setTheme, setColor, toggleEffect, resetCustom } = useTheme();
  const [customOpen, setCustomOpen] = useState(false);
  const [effectsOpen, setEffectsOpen] = useState(false);

  if (!open) return null;

  const presetEntries = Object.entries(THEME_PRESETS);
  const hasCustom = Object.keys(customColors).length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'color-mix(in srgb, var(--color-th-base) 80%, transparent)', backdropFilter: 'blur(12px)' }} onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl" style={{ backgroundColor: 'var(--color-th-surface)', borderColor: 'var(--color-th-line)' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--color-th-line)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center border" style={{ backgroundColor: 'var(--color-th-panel)', borderColor: 'var(--color-th-line)' }}>
              <Palette className="w-4 h-4" style={{ color: 'var(--color-th-accent)' }} />
            </div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--color-th-heading)' }}>主题编辑器</h2>
            <span className="text-[10px] px-2 py-0.5 rounded-md font-medium border" style={{ color: 'var(--color-th-accent)', backgroundColor: 'color-mix(in srgb, var(--color-th-accent) 8%, transparent)', borderColor: 'color-mix(in srgb, var(--color-th-accent) 20%, transparent)' }}>
              {THEME_PRESETS[themeId]?.name}
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--color-th-subtle)' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-th-elevated)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Presets Grid */}
        <div className="p-5 pb-3">
          <p className="text-xs font-medium mb-3 tracking-wide uppercase" style={{ color: 'var(--color-th-subtle)' }}>预设风格</p>
          <div className="grid grid-cols-5 gap-2.5">
            {presetEntries.map(([id, preset]) => {
              const isActive = themeId === id;
              return (
                <button
                  key={id}
                  onClick={() => setTheme(id)}
                  className="group relative rounded-xl border p-2.5 text-left transition-all duration-200"
                  style={{
                    borderColor: isActive ? preset.colors.accent : preset.colors.line,
                    backgroundColor: isActive ? 'color-mix(in srgb, ' + preset.colors.accent + ' 6%, ' + preset.colors.surface + ')' : preset.colors.surface,
                    boxShadow: isActive ? '0 0 0 1px ' + preset.colors.accent + '40' : 'none',
                  }}
                  onMouseEnter={e => {
                    if (!isActive) {
                      e.currentTarget.style.borderColor = preset.colors.lineHi;
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      e.currentTarget.style.borderColor = preset.colors.line;
                      e.currentTarget.style.transform = 'none';
                    }
                  }}
                >
                  {/* Mini preview */}
                  <div className="rounded-lg overflow-hidden mb-2 h-12 relative" style={{ backgroundColor: preset.colors.base, border: '1px solid ' + preset.colors.line }}>
                    <div className="absolute inset-x-2 top-2 h-1.5 rounded-sm" style={{ backgroundColor: preset.colors.panel }} />
                    <div className="absolute left-2 top-[18px] w-4 h-1 rounded-sm" style={{ backgroundColor: preset.colors.accent }} />
                    <div className="absolute left-[26px] top-[18px] w-8 h-1 rounded-sm" style={{ backgroundColor: preset.colors.heading, opacity: 0.4 }} />
                    <div className="absolute left-2 top-[26px] w-12 h-0.5 rounded-sm" style={{ backgroundColor: preset.colors.body, opacity: 0.2 }} />
                    <div className="absolute left-2 top-[30px] w-8 h-0.5 rounded-sm" style={{ backgroundColor: preset.colors.body, opacity: 0.15 }} />
                  </div>
                  {/* Name & desc */}
                  <p className="text-[11px] font-medium truncate" style={{ color: preset.colors.heading }}>{preset.icon} {preset.name}</p>
                  <p className="text-[9px] mt-0.5 truncate" style={{ color: preset.colors.dim }}>{preset.desc}</p>
                  {/* Active indicator */}
                  {isActive && (
                    <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: preset.colors.accent }}>
                      <Check className="w-2.5 h-2.5" style={{ color: preset.isDark ? '#000' : '#fff' }} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Colors */}
        <div className="px-5 pb-2">
          <button
            onClick={() => setCustomOpen(!customOpen)}
            className="w-full flex items-center gap-2 py-2 text-xs font-medium transition-colors"
            style={{ color: 'var(--color-th-subtle)' }}
          >
            {customOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            自定义调色
            {hasCustom && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-th-accent)' }} />}
          </button>

          {customOpen && (
            <div className="rounded-xl border p-4 space-y-4" style={{ backgroundColor: 'var(--color-th-panel)', borderColor: 'var(--color-th-line)' }}>
              {COLOR_GROUPS.map(group => (
                <div key={group.label}>
                  <p className="text-[10px] font-medium mb-2 uppercase tracking-wider" style={{ color: 'var(--color-th-dim)' }}>{group.label}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {group.keys.map(key => (
                      <div key={key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg border" style={{ backgroundColor: 'var(--color-th-base)', borderColor: 'var(--color-th-line)' }}>
                        <label className="relative w-6 h-6 rounded-md overflow-hidden cursor-pointer shrink-0 border" style={{ borderColor: 'var(--color-th-line)' }}>
                          <input
                            type="color"
                            value={colors[key]}
                            onChange={e => setColor(key, e.target.value)}
                            className="absolute inset-0 w-full h-full cursor-pointer opacity-0"
                          />
                          <div className="absolute inset-0.5 rounded" style={{ backgroundColor: colors[key] }} />
                        </label>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-medium" style={{ color: 'var(--color-th-heading)' }}>{COLOR_LABELS[key]}</p>
                          <p className="text-[9px] font-mono" style={{ color: 'var(--color-th-dim)' }}>{colors[key]}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Effects */}
        <div className="px-5 pb-3">
          <button
            onClick={() => setEffectsOpen(!effectsOpen)}
            className="w-full flex items-center gap-2 py-2 text-xs font-medium transition-colors"
            style={{ color: 'var(--color-th-subtle)' }}
          >
            {effectsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            视觉效果
          </button>

          {effectsOpen && (
            <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--color-th-panel)', borderColor: 'var(--color-th-line)' }}>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(EFFECT_LABELS).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => toggleEffect(key)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all text-left"
                    style={{
                      backgroundColor: effects[key] ? 'color-mix(in srgb, var(--color-th-accent) 6%, transparent)' : 'var(--color-th-base)',
                      borderColor: effects[key] ? 'color-mix(in srgb, var(--color-th-accent) 20%, transparent)' : 'var(--color-th-line)',
                    }}
                  >
                    <div className={`w-8 h-4 rounded-full relative transition-colors duration-200`} style={{ backgroundColor: effects[key] ? 'var(--color-th-accent)' : 'var(--color-th-line)' }}>
                      <div
                        className="absolute top-0.5 w-3 h-3 rounded-full transition-all duration-200"
                        style={{
                          left: effects[key] ? '17px' : '2px',
                          backgroundColor: effects[key] ? '#fff' : 'var(--color-th-subtle)',
                        }}
                      />
                    </div>
                    <span className="text-[11px] font-medium" style={{ color: effects[key] ? 'var(--color-th-heading)' : 'var(--color-th-subtle)' }}>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Reset */}
        <div className="p-5 pt-2 border-t flex items-center justify-between" style={{ borderColor: 'var(--color-th-line)' }}>
          <p className="text-[10px]" style={{ color: 'var(--color-th-dim)' }}>切换主题即时生效，关闭即保存</p>
          <button
            onClick={resetCustom}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg border transition-colors"
            style={{ color: 'var(--color-th-subtle)', borderColor: 'var(--color-th-line)', backgroundColor: 'var(--color-th-base)' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-th-line-hi)'; e.currentTarget.style.color = 'var(--color-th-body)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-th-line)'; e.currentTarget.style.color = 'var(--color-th-subtle)'; }}
          >
            <RotateCcw className="w-3 h-3" />
            重置为预设
          </button>
        </div>
      </div>
    </div>
  );
}
