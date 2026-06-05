import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { THEME_PRESETS, DEFAULT_THEME, applyThemeToDOM, resolveColors } from '../lib/themes';

const ThemeContext = createContext(null);

const STORAGE_THEME_KEY = 'tichacha_theme_id';
const STORAGE_CUSTOM_KEY = 'tichacha_theme_custom';
const STORAGE_EFFECTS_KEY = 'tichacha_theme_effects';

function loadFromStorage() {
  try {
    let themeId = localStorage.getItem(STORAGE_THEME_KEY) || DEFAULT_THEME;
    // 防止存了不存在的主题 ID 导致崩溃
    if (!THEME_PRESETS[themeId]) themeId = DEFAULT_THEME;
    const customRaw = localStorage.getItem(STORAGE_CUSTOM_KEY);
    const customColors = customRaw ? JSON.parse(customRaw) : {};
    const effectsRaw = localStorage.getItem(STORAGE_EFFECTS_KEY);
    const effects = effectsRaw ? JSON.parse(effectsRaw) : null;
    return { themeId, customColors, effects };
  } catch {
    return { themeId: DEFAULT_THEME, customColors: {}, effects: null };
  }
}

function saveToStorage(themeId, customColors, effects) {
  localStorage.setItem(STORAGE_THEME_KEY, themeId);
  localStorage.setItem(STORAGE_CUSTOM_KEY, JSON.stringify(customColors));
  localStorage.setItem(STORAGE_EFFECTS_KEY, JSON.stringify(effects));
}

export function ThemeProvider({ children }) {
  const initial = useRef(loadFromStorage());
  const [themeId, setThemeIdState] = useState(initial.current.themeId);
  const [customColors, setCustomColorsState] = useState(initial.current.customColors);
  const [effects, setEffectsState] = useState(() => {
    if (initial.current.effects) return initial.current.effects;
    const preset = THEME_PRESETS[initial.current.themeId] || THEME_PRESETS[DEFAULT_THEME];
    return { ...preset.effects };
  });

  // 应用主题到 DOM
  useEffect(() => {
    applyThemeToDOM(themeId, customColors, effects);
    saveToStorage(themeId, customColors, effects);
  }, [themeId, customColors, effects]);

  const setTheme = useCallback((id) => {
    setThemeIdState(id);
    setCustomColorsState({}); // 切换预设时清除自定义覆盖
    setEffectsState({ ...THEME_PRESETS[id].effects });
  }, []);

  const setColor = useCallback((key, value) => {
    setCustomColorsState(prev => ({ ...prev, [key]: value }));
  }, []);

  const toggleEffect = useCallback((key) => {
    setEffectsState(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const resetCustom = useCallback(() => {
    setCustomColorsState({});
    setEffectsState({ ...THEME_PRESETS[themeId].effects });
  }, [themeId]);

  const colors = resolveColors(themeId, customColors);
  const isDark = THEME_PRESETS[themeId]?.isDark ?? true;

  return (
    <ThemeContext.Provider value={{
      themeId,
      colors,
      customColors,
      effects,
      isDark,
      setTheme,
      setColor,
      toggleEffect,
      resetCustom,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
