// 主题预设定义
export const THEME_PRESETS = {
  'deep-space': {
    name: '深空科技',
    desc: '深蓝黑底 · 青色点缀',
    icon: '🚀',
    colors: {
      base: '#06080f',
      surface: '#0a0d16',
      panel: '#0f1219',
      elevated: '#141822',
      line: '#1c2333',
      lineHi: '#2a3550',
      heading: '#e8edf5',
      body: '#c0c8d4',
      subtle: '#94a3b8',
      dim: '#64748b',
      accent: '#22d3ee',
      accentHi: '#67e8f9',
      accentLo: '#06b6d4',
    },
    effects: { grid: true, noise: true, glow: true, edgeGlow: true, shine: true },
    isDark: true,
  },
  'minimal': {
    name: '极简白',
    desc: '纯净白底 · 蓝色点缀',
    icon: '⬜',
    colors: {
      base: '#f8fafc',
      surface: '#ffffff',
      panel: '#f1f5f9',
      elevated: '#e2e8f0',
      line: '#e2e8f0',
      lineHi: '#cbd5e1',
      heading: '#0f172a',
      body: '#334155',
      subtle: '#64748b',
      dim: '#94a3b8',
      accent: '#3b82f6',
      accentHi: '#60a5fa',
      accentLo: '#2563eb',
    },
    effects: { grid: false, noise: false, glow: false, edgeGlow: false, shine: false },
    isDark: false,
  },
  'warm-light': {
    name: '暖光',
    desc: '暖色调 · 琥珀点缀',
    icon: '🌅',
    colors: {
      base: '#faf6f0',
      surface: '#ffffff',
      panel: '#f5efe6',
      elevated: '#ede5d8',
      line: '#e0d6c8',
      lineHi: '#c9bda8',
      heading: '#2c1810',
      body: '#5c4033',
      subtle: '#8b7355',
      dim: '#b09a7e',
      accent: '#d97706',
      accentHi: '#f59e0b',
      accentLo: '#b45309',
    },
    effects: { grid: false, noise: false, glow: false, edgeGlow: false, shine: false },
    isDark: false,
  },
  'cyberpunk': {
    name: '赛博朋克',
    desc: '暗夜霓虹 · 品红点缀',
    icon: '🎮',
    colors: {
      base: '#0a0a0f',
      surface: '#12121f',
      panel: '#16162a',
      elevated: '#1e1e38',
      line: '#2a2a4a',
      lineHi: '#3d3d66',
      heading: '#f0e6ff',
      body: '#c8b8e0',
      subtle: '#9888b8',
      dim: '#6a5c88',
      accent: '#e040fb',
      accentHi: '#ea80fc',
      accentLo: '#aa00ff',
    },
    effects: { grid: true, noise: true, glow: true, edgeGlow: true, shine: true },
    isDark: true,
  },
  'morandi': {
    name: '莫兰迪',
    desc: '低饱和 · 优雅灰绿',
    icon: '🎨',
    colors: {
      base: '#f2efe9',
      surface: '#faf8f5',
      panel: '#eae6df',
      elevated: '#ddd8cf',
      line: '#d0c9bd',
      lineHi: '#bfb5a6',
      heading: '#3d3832',
      body: '#5c5650',
      subtle: '#8a837a',
      dim: '#aba49a',
      accent: '#7c9a8e',
      accentHi: '#9abcae',
      accentLo: '#5d7d6f',
    },
    effects: { grid: false, noise: false, glow: false, edgeGlow: false, shine: false },
    isDark: false,
  },
  'forest': {
    name: '森林',
    desc: '深色底 · 翡翠绿点缀',
    icon: '🌲',
    colors: {
      base: '#060d08',
      surface: '#0a1a0e',
      panel: '#0f2214',
      elevated: '#162e1c',
      line: '#1c3a22',
      lineHi: '#2a5532',
      heading: '#e0f5e4',
      body: '#b0d4b6',
      subtle: '#7faa86',
      dim: '#5a8860',
      accent: '#34d399',
      accentHi: '#6ee7b7',
      accentLo: '#10b981',
    },
    effects: { grid: true, noise: true, glow: true, edgeGlow: true, shine: true },
    isDark: true,
  },
  'sunset': {
    name: '落日',
    desc: '深色底 · 暖橙点缀',
    icon: '🌇',
    colors: {
      base: '#0f0806',
      surface: '#1a0f0a',
      panel: '#221610',
      elevated: '#2e1e16',
      line: '#3a2820',
      lineHi: '#554030',
      heading: '#f5e8e0',
      body: '#d4bfb0',
      subtle: '#a89080',
      dim: '#887060',
      accent: '#f97316',
      accentHi: '#fb923c',
      accentLo: '#ea580c',
    },
    effects: { grid: true, noise: true, glow: true, edgeGlow: true, shine: true },
    isDark: true,
  },
  'navy': {
    name: '靛蓝商务',
    desc: '深海蓝底 · 金色点缀',
    icon: '👔',
    colors: {
      base: '#060a14',
      surface: '#0c1424',
      panel: '#111c32',
      elevated: '#182644',
      line: '#1e3050',
      lineHi: '#2a4468',
      heading: '#e8eef5',
      body: '#b0c0d4',
      subtle: '#8898b0',
      dim: '#687890',
      accent: '#f59e0b',
      accentHi: '#fbbf24',
      accentLo: '#d97706',
    },
    effects: { grid: true, noise: false, glow: true, edgeGlow: true, shine: true },
    isDark: true,
  },
  'sakura': {
    name: '樱花',
    desc: '柔粉白底 · 玫瑰点缀',
    icon: '🌸',
    colors: {
      base: '#fdf2f4',
      surface: '#ffffff',
      panel: '#fce7eb',
      elevated: '#f9dce2',
      line: '#f5c6d0',
      lineHi: '#edaab8',
      heading: '#3d1525',
      body: '#6b3048',
      subtle: '#9a6078',
      dim: '#c090a0',
      accent: '#ec4899',
      accentHi: '#f472b6',
      accentLo: '#db2777',
    },
    effects: { grid: false, noise: false, glow: false, edgeGlow: false, shine: false },
    isDark: false,
  },
  'polar-night': {
    name: '极夜',
    desc: '纯黑底 · 银白点缀',
    icon: '🌑',
    colors: {
      base: '#000000',
      surface: '#0a0a0a',
      panel: '#111111',
      elevated: '#1a1a1a',
      line: '#222222',
      lineHi: '#333333',
      heading: '#f0f0f0',
      body: '#c0c0c0',
      subtle: '#888888',
      dim: '#666666',
      accent: '#e0e0e0',
      accentHi: '#ffffff',
      accentLo: '#b0b0b0',
    },
    effects: { grid: true, noise: false, glow: false, edgeGlow: true, shine: false },
    isDark: true,
  },
};

// 颜色键值中文映射
export const COLOR_LABELS = {
  base: '底色',
  surface: '卡片',
  panel: '面板',
  elevated: '悬浮',
  line: '边框',
  lineHi: '悬浮边框',
  heading: '标题文字',
  body: '正文文字',
  subtle: '辅助文字',
  dim: '禁用文字',
  accent: '主题色',
  accentHi: '主题亮色',
  accentLo: '主题暗色',
};

// 颜色分组
export const COLOR_GROUPS = [
  { label: '背景色', keys: ['base', 'surface', 'panel', 'elevated'] },
  { label: '边框色', keys: ['line', 'lineHi'] },
  { label: '文字色', keys: ['heading', 'body', 'subtle', 'dim'] },
  { label: '强调色', keys: ['accent', 'accentHi', 'accentLo'] },
];

// 效果中文映射
export const EFFECT_LABELS = {
  grid: '网格纹理',
  noise: '噪点纹理',
  glow: '光晕效果',
  edgeGlow: '边缘光线',
  shine: '卡片光泽',
};

// hex → RGB
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 0, g: 0, b: 0 };
}

// 将主题应用到 DOM
export function applyThemeToDOM(themeId, customColors = {}, effects = null) {
  const preset = THEME_PRESETS[themeId];
  if (!preset) return;

  const colors = { ...preset.colors, ...customColors };
  const fx = effects || preset.effects;
  const root = document.documentElement;

  // 设置 CSS 变量
  root.style.setProperty('--color-th-base', colors.base);
  root.style.setProperty('--color-th-surface', colors.surface);
  root.style.setProperty('--color-th-panel', colors.panel);
  root.style.setProperty('--color-th-elevated', colors.elevated);
  root.style.setProperty('--color-th-line', colors.line);
  root.style.setProperty('--color-th-line-hi', colors.lineHi);
  root.style.setProperty('--color-th-heading', colors.heading);
  root.style.setProperty('--color-th-body', colors.body);
  root.style.setProperty('--color-th-subtle', colors.subtle);
  root.style.setProperty('--color-th-dim', colors.dim);
  root.style.setProperty('--color-th-accent', colors.accent);
  root.style.setProperty('--color-th-accent-hi', colors.accentHi);
  root.style.setProperty('--color-th-accent-lo', colors.accentLo);

  // 强调色 RGB 分解（用于 CSS rgba() 效果）
  const accentRgb = hexToRgb(colors.accent);
  root.style.setProperty('--th-accent-r', accentRgb.r);
  root.style.setProperty('--th-accent-g', accentRgb.g);
  root.style.setProperty('--th-accent-b', accentRgb.b);

  // body 样式
  document.body.style.backgroundColor = colors.base;
  document.body.style.color = colors.heading;

  // 颜色方案（影响表单元素、滚动条等）
  root.style.colorScheme = preset.isDark ? 'dark' : 'light';

  // 效果 class
  const body = document.body;
  body.classList.toggle('fx-grid', fx.grid);
  body.classList.toggle('fx-noise', fx.noise);
  body.classList.toggle('fx-glow', fx.glow);
  body.classList.toggle('fx-edge-glow', fx.edgeGlow);
  body.classList.toggle('fx-shine', fx.shine);
}

// 获取解析后的颜色（preset + custom）
export function resolveColors(themeId, customColors = {}) {
  const preset = THEME_PRESETS[themeId];
  return preset ? { ...preset.colors, ...customColors } : THEME_PRESETS['deep-space'].colors;
}

// 默认主题
export const DEFAULT_THEME = 'deep-space';
