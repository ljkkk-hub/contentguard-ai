import { useState, useCallback, useEffect } from 'react';
import { Shield, Settings, FileText, Video, ImageIcon, Globe, Cpu, Palette, BookOpen, Tag, ChevronDown } from 'lucide-react';
import { ThemeProvider, useTheme } from './hooks/useTheme';
import { MODEL_OPTIONS_BY_TYPE, getDefaultModel } from './lib/glmApi';
import { getBrandOptions } from './lib/db';
import SettingsPanel from './components/SettingsPanel';
import TextInput from './components/TextInput';
import VideoInput from './components/VideoInput';
import ImageInput from './components/ImageInput';
import AuditReport from './components/AuditReport';
import WoodenFish from './components/WoodenFish';
import ThemeEditor from './components/ThemeEditor';
import KnowledgeSidebar from './components/KnowledgeSidebar';

const PLATFORMS = [
  { value: 'all', label: '全平台' },
  { value: 'douyin', label: '抖音' },
  { value: 'kuaishou', label: '快手' },
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'weishi', label: '视频号' },
];

const ALL_PLATFORMS = ['douyin', 'kuaishou', 'xiaohongshu', 'weishi'];

function AppInner() {
  const { effects } = useTheme();
  const [apiKey, setApiKeyState] = useState(() => localStorage.getItem('contentguard_api_key') || '');
  const [model, setModelState] = useState(() => localStorage.getItem('contentguard_model') || 'glm-4-flash');
  const [platforms, setPlatformsState] = useState(() => {
    try {
      const saved = localStorage.getItem('contentguard_platforms');
      return saved ? JSON.parse(saved) : ['all'];
    } catch {
      return ['all'];
    }
  });

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [themeEditorOpen, setThemeEditorOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('text');
  const [auditResult, setAuditResult] = useState(null);
  const [kbSidebarOpen, setKbSidebarOpen] = useState(true);

  // 全局审核状态：任一审核进行中时禁止切换标签
  const [isAuditing, setIsAuditing] = useState(false);

  // 品牌选择
  const [selectedBrand, setSelectedBrand] = useState(() => localStorage.getItem('contentguard_brand') || '');
  const [brandOptions, setBrandOptions] = useState([]);

  // 加载品牌列表
  useEffect(() => {
    getBrandOptions().then(setBrandOptions);
  }, []);

  const handleSelectBrand = useCallback((brand) => {
    setSelectedBrand(brand);
    if (brand) localStorage.setItem('contentguard_brand', brand);
    else localStorage.removeItem('contentguard_brand');
  }, []);

  // 当前 Tab 对应的模型选项
  const currentModelOptions = MODEL_OPTIONS_BY_TYPE[activeTab] || MODEL_OPTIONS_BY_TYPE.text;

  const setApiKey = useCallback((key) => {
    setApiKeyState(key);
    localStorage.setItem('contentguard_api_key', key);
  }, []);

  const setModel = useCallback((m) => {
    setModelState(m);
    localStorage.setItem('contentguard_model', m);
  }, []);

  // 切换 Tab 时自动切到推荐模型（必须在 setModel 之后定义）
  const handleTabSwitch = useCallback((tab) => {
    if (isAuditing) return; // 审核中禁止切换
    setActiveTab(tab);
    const defaultModel = getDefaultModel(tab);
    setModel(defaultModel);
  }, [setModel, isAuditing]);

  const handleAuditStart = useCallback(() => setIsAuditing(true), []);
  const handleAuditEnd = useCallback(() => setIsAuditing(false), []);

  const togglePlatform = useCallback((p) => {
    setPlatformsState(prev => {
      let next;
      if (p === 'all') {
        next = ['all'];
      } else if (prev.includes('all')) {
        next = [p];
      } else if (prev.includes(p)) {
        next = prev.filter(x => x !== p);
        if (next.length === 0) next = ['all'];
      } else {
        next = [...prev, p];
      }
      const selectedNonAll = next.filter(x => x !== 'all');
      if (selectedNonAll.length === ALL_PLATFORMS.length) {
        next = ['all'];
      }
      localStorage.setItem('contentguard_platforms', JSON.stringify(next));
      return next;
    });
  }, []);

  return (
    <div className="min-h-screen bg-th-base bg-grid-tech relative overflow-hidden noise-overlay">
      {/* Ambient atmosphere */}
      {effects.glow && (
        <>
          <div className="fixed top-[-200px] left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-th-accent/[0.03] rounded-full blur-[200px] pointer-events-none" />
          <div className="fixed bottom-[-100px] right-0 w-[400px] h-[300px] bg-indigo-500/[0.02] rounded-full blur-[150px] pointer-events-none" />
        </>
      )}

      {/* Header */}
      <header className="bg-th-base/70 backdrop-blur-2xl border-b border-th-line sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-9 h-9 bg-th-panel border border-th-line rounded-xl flex items-center justify-center">
                <Shield className="w-4.5 h-4.5 text-th-accent" />
              </div>
              <div className="absolute -inset-0.5 bg-th-accent/10 rounded-xl blur-sm -z-10" />
            </div>
            <h1 className="text-lg font-bold text-th-heading tracking-tight">
              题查查 <span className="text-th-accent font-extrabold">AI</span>
            </h1>
            <span className="text-[10px] px-2 py-0.5 bg-th-accent/8 text-th-accent/80 rounded-md font-medium border border-th-accent/15 tracking-wider uppercase">MVP</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Knowledge Base Toggle */}
            <button
              onClick={() => setKbSidebarOpen(!kbSidebarOpen)}
              className={`p-2.5 rounded-xl transition-all relative group border ${kbSidebarOpen ? 'bg-th-accent/10 border-th-accent/25' : 'border-transparent hover:border-th-line hover:bg-th-elevated'}`}
              title="项目知识库"
            >
              <BookOpen className={`w-4.5 h-4.5 transition-colors duration-300 ${kbSidebarOpen ? 'text-th-accent' : 'text-th-subtle group-hover:text-th-accent'}`} />
            </button>
            {!apiKey && (
              <span className="text-xs text-th-accent/70 bg-th-accent/8 px-3 py-1.5 rounded-lg border border-th-accent/15 animate-pulse">
                ⚡ 请先配置 API Key
              </span>
            )}
            <button
              onClick={() => setThemeEditorOpen(true)}
              className="p-2.5 hover:bg-th-elevated rounded-xl transition-all relative group border border-transparent hover:border-th-line"
              title="主题编辑器"
            >
              <Palette className="w-4.5 h-4.5 text-th-subtle group-hover:text-th-accent transition-colors duration-300" />
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-2.5 hover:bg-th-elevated rounded-xl transition-all relative group border border-transparent hover:border-th-line"
            >
              <Settings className="w-4.5 h-4.5 text-th-subtle group-hover:text-th-accent transition-colors duration-300 group-hover:rotate-90" />
              {!apiKey && (
                <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-th-accent rounded-full animate-pulse" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto px-6 py-6 relative z-10">
        <div className="flex gap-5 min-h-[calc(100vh-110px)]">
          {/* Knowledge Sidebar */}
          {kbSidebarOpen && (
            <div className="w-72 shrink-0">
              <KnowledgeSidebar apiKey={apiKey} onKnowledgeChange={() => {}} />
            </div>
          )}

          {/* Center: Input + Report */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Left: Input */}
            <div className="bg-th-surface rounded-2xl border border-th-line p-6 flex flex-col glow-accent-sm edge-glow card-shine">
            {/* Tab Switcher */}
            <div className={`flex gap-0.5 mb-4 p-0.5 bg-th-base rounded-xl border border-th-line relative ${isAuditing ? 'opacity-70' : ''}`}>
              {isAuditing && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-th-base/30 backdrop-blur-[1px]">
                  <span className="text-[11px] text-th-accent font-medium flex items-center gap-1.5">
                    <span className="w-3 h-3 border-2 border-th-accent/30 border-t-th-accent rounded-full animate-spin" />
                    审核进行中，请稍候...
                  </span>
                </div>
              )}
              <button
                onClick={() => handleTabSwitch('text')}
                disabled={isAuditing}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === 'text'
                    ? 'bg-th-elevated text-th-accent shadow-lg shadow-th-accent/5 border border-th-line'
                    : 'text-th-subtle hover:text-th-body disabled:text-th-dim disabled:cursor-not-allowed'
                }`}
              >
                <FileText className="w-4 h-4" />
                文案
              </button>
              <button
                onClick={() => handleTabSwitch('video')}
                disabled={isAuditing}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === 'video'
                    ? 'bg-th-elevated text-th-accent shadow-lg shadow-th-accent/5 border border-th-line'
                    : 'text-th-subtle hover:text-th-body disabled:text-th-dim disabled:cursor-not-allowed'
                }`}
              >
                <Video className="w-4 h-4" />
                视频
              </button>
              <button
                onClick={() => handleTabSwitch('image')}
                disabled={isAuditing}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === 'image'
                    ? 'bg-th-elevated text-th-accent shadow-lg shadow-th-accent/5 border border-th-line'
                    : 'text-th-subtle hover:text-th-body disabled:text-th-dim disabled:cursor-not-allowed'
                }`}
              >
                <ImageIcon className="w-4 h-4" />
                图片
              </button>
            </div>

            {/* Platform Selector */}
            <div className="flex items-center gap-2 mb-3 px-1 flex-wrap">
              <Globe className="w-3.5 h-3.5 text-th-dim" />
              <span className="text-[11px] text-th-subtle font-medium tracking-wide uppercase">平台</span>
              <div className="flex gap-1 flex-wrap">
                {PLATFORMS.map(p => {
                  const isSelected = platforms.includes(p.value);
                  const isAllMode = platforms.includes('all');
                  return (
                    <button
                      key={p.value}
                      onClick={() => togglePlatform(p.value)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all duration-200 ${
                        isSelected
                          ? 'bg-th-accent/10 text-th-accent border border-th-accent/25 shadow-sm shadow-th-accent/5'
                          : isAllMode
                            ? 'bg-th-base text-th-dim border border-th-elevated'
                            : 'bg-th-base text-th-subtle border border-th-elevated hover:border-th-line hover:text-th-body'
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Brand Selector — 强制选择品牌 */}
            <div className="flex items-center gap-2 mb-4 px-1 flex-wrap">
              <Tag className="w-3.5 h-3.5 text-th-dim" />
              <span className="text-[11px] text-th-subtle font-medium tracking-wide uppercase">品牌</span>
              <div className="relative">
                <select
                  value={selectedBrand}
                  onChange={e => handleSelectBrand(e.target.value)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all duration-200 border appearance-none pr-7 cursor-pointer focus:outline-none ${
                    selectedBrand
                      ? 'bg-violet-500/10 text-violet-400 border-violet-500/25'
                      : 'bg-red-500/5 text-red-400/80 border-red-500/20 animate-pulse'
                  }`}
                >
                  <option value="">⚠️ 请选择品牌</option>
                  {brandOptions.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
                <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-th-dim" />
              </div>
              {!selectedBrand && (
                <span className="text-[10px] text-red-400/60">请先选择品牌再提交审核</span>
              )}
            </div>

            {/* Model Selector — 根据 Tab 动态切换 */}
            <div className="flex items-center gap-2 mb-4 px-1 flex-wrap">
              <Cpu className="w-3.5 h-3.5 text-th-dim" />
              <span className="text-[11px] text-th-subtle font-medium tracking-wide uppercase">模型</span>
              <div className="flex gap-1 flex-wrap">
                {currentModelOptions.map(opt => {
                  const isSelected = model === opt.value;
                  let selectedStyle = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25 shadow-emerald-500/5';
                  if (opt.gemini) selectedStyle = 'bg-blue-500/10 text-blue-400 border-blue-500/25 shadow-blue-500/5';
                  else if (!opt.free) selectedStyle = 'bg-amber-500/10 text-amber-400 border-amber-500/25 shadow-amber-500/5';

                  return (
                    <button
                      key={opt.value}
                      onClick={() => setModel(opt.value)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all duration-200 flex items-center gap-1 border ${
                        isSelected
                          ? `${selectedStyle} shadow-sm`
                          : 'bg-th-base text-th-subtle border-th-elevated hover:border-th-line hover:text-th-body'
                      }`}
                      title={opt.textOnly ? '⚠️ 纯文本模型，无法分析画面' : opt.desc}
                    >
                      {opt.recommended && (
                        <span className={`text-[9px] px-1 py-0 rounded-sm font-bold ${
                          isSelected
                            ? opt.gemini ? 'bg-blue-500/20 text-blue-300' : 'bg-emerald-500/20 text-emerald-300'
                            : opt.gemini ? 'bg-blue-500/10 text-blue-400/60' : 'bg-emerald-500/10 text-emerald-400/60'
                        }`}>推荐</span>
                      )}
                      {opt.gemini && !isSelected && <span className="text-[9px] text-blue-400/50">★</span>}
                      {opt.label}
                      <span className="text-[9px] opacity-60">{opt.free ? '免费' : '付费'}</span>
                      {opt.textOnly && !isSelected && (
                        <span className="text-[9px] text-amber-400/50">纯文本</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {activeTab === 'video' && currentModelOptions.find(o => o.value === model)?.textOnly && (
                <span className="text-[10px] text-amber-400/70 ml-1">
                  ⚠️ 当前模型无法分析画面，仅审核文字
                </span>
              )}
            </div>

            {/* Input Area */}
            {activeTab === 'text' ? (
              <TextInput
                apiKey={apiKey}
                model={model}
                platforms={platforms}
                brand={selectedBrand}
                onResult={setAuditResult}
                onAuditStart={handleAuditStart}
                onAuditEnd={handleAuditEnd}
              />
            ) : activeTab === 'video' ? (
              <VideoInput
                apiKey={apiKey}
                model={model}
                platforms={platforms}
                brand={selectedBrand}
                onResult={setAuditResult}
                onAuditStart={handleAuditStart}
                onAuditEnd={handleAuditEnd}
              />
            ) : (
              <ImageInput
                apiKey={apiKey}
                model={model}
                platforms={platforms}
                brand={selectedBrand}
                onResult={setAuditResult}
                onAuditStart={handleAuditStart}
                onAuditEnd={handleAuditEnd}
              />
            )}
          </div>

          {/* Right: Report / WoodenFish */}
          <div className="bg-th-surface rounded-2xl border border-th-line p-6 flex flex-col overflow-hidden glow-accent-sm edge-glow card-shine">
            {auditResult ? (
              <AuditReport result={auditResult} apiKey={apiKey} />
            ) : (
              <WoodenFish />
            )}
          </div>
        </div>
        </div>
      </main>

      {/* Settings Modal */}
      <SettingsPanel
        apiKey={apiKey}
        setApiKey={setApiKey}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      {/* Theme Editor Modal */}
      <ThemeEditor
        open={themeEditorOpen}
        onClose={() => setThemeEditorOpen(false)}
      />

      {/* Data Source Footer */}
      <footer className="max-w-7xl mx-auto px-6 pb-6 pt-2 relative z-10">
        <div className="border-t border-th-line/50 pt-3 space-y-1.5">
          <p className="text-[10px] text-th-dim tracking-wide">
            📋 数据来源
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <span className="text-[10px] text-th-dim/70">
              敏感词库：<a href="https://github.com/netarch/Sensitive-lexicon" target="_blank" rel="noopener" className="text-th-subtle/70 hover:text-th-accent/70 underline decoration-th-line/40 underline-offset-2 transition-colors">Sensitive-lexicon</a>、<a href="https://github.com/ClawHub/douyin-sensitive-check" target="_blank" rel="noopener" className="text-th-subtle/70 hover:text-th-accent/70 underline decoration-th-line/40 underline-offset-2 transition-colors">douyin-sensitive-check</a>
            </span>
            <span className="text-[10px] text-th-dim/70">
              审核标准：<a href="https://www.cac.gov.cn/2020-01/02/c_1575361400155093.htm" target="_blank" rel="noopener" className="text-th-subtle/70 hover:text-th-accent/70 underline decoration-th-line/40 underline-offset-2 transition-colors">《网络短视频内容审核标准细则》</a>
            </span>
            <span className="text-[10px] text-th-dim/70">
              AI 模型：<a href="https://open.bigmodel.cn" target="_blank" rel="noopener" className="text-th-subtle/70 hover:text-th-accent/70 underline decoration-th-line/40 underline-offset-2 transition-colors">智谱 GLM</a>（文案/图片）、<a href="https://ai.google.dev" target="_blank" rel="noopener" className="text-th-subtle/70 hover:text-blue-400/70 underline decoration-th-line/40 underline-offset-2 transition-colors">Google Gemini</a>（视频理解）
            </span>
            <span className="text-[10px] text-th-dim/70">
              平台规则：基于抖音、快手、小红书、视频号公开社区规范整理
            </span>
          </div>
          <p className="text-[10px] text-th-dim/40">
            ⚠️ 本工具仅供辅助参考，审核结果不构成法律意见，发布前请以平台官方审核为准
          </p>
        </div>
      </footer>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}

export default App;
