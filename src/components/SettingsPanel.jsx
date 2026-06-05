import { useState } from 'react';
import { Settings, X, Key, Sparkles, Cloud } from 'lucide-react';
import { isFirebaseReady } from '../lib/firestoreService';

export default function SettingsPanel({ apiKey, setApiKey, open, onClose }) {
  const [tempKey, setTempKey] = useState(apiKey);
  const [tempGeminiKey, setTempGeminiKey] = useState(
    () => localStorage.getItem('contentguard_gemini_key') || ''
  );

  const handleSave = () => {
    setApiKey(tempKey);
    localStorage.setItem('contentguard_gemini_key', tempGeminiKey);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-th-base/80 backdrop-blur-xl z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-th-surface border border-th-line rounded-2xl shadow-2xl shadow-black/50 w-full max-w-lg relative overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Top edge glow */}
        <div className="absolute top-0 left-[10%] right-[10%] h-px bg-gradient-to-r from-transparent via-th-accent/30 to-transparent" />

        <div className="flex items-center justify-between p-6 border-b border-th-line">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-th-panel border border-th-line rounded-lg flex items-center justify-center">
              <Settings className="w-4 h-4 text-th-accent/60" />
            </div>
            <h2 className="text-base font-semibold text-th-heading">设置</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-th-elevated rounded-lg transition-colors">
            <X className="w-4 h-4 text-th-subtle" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* 智谱 API Key */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-th-body mb-2.5">
              <Key className="w-4 h-4 text-th-accent/50" />
              智谱 API Key
            </label>
            <input
              type="password"
              value={tempKey}
              onChange={e => setTempKey(e.target.value)}
              placeholder="输入你的智谱 API Key"
              className="w-full px-4 py-3 border border-th-line rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-th-accent/20 focus:border-th-accent/30 transition-all bg-th-base text-th-heading placeholder:text-th-dim"
            />
            <p className="mt-2 text-[11px] text-th-dim leading-relaxed">
              用于文案/图片审核。Key 仅存储在浏览器本地，不会上传。
              <a href="https://open.bigmodel.cn" target="_blank" rel="noopener" className="text-th-accent/60 hover:text-th-accent ml-1 transition-colors">
                前往获取 →
              </a>
            </p>
          </div>

          {/* Gemini API Key */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-th-body mb-2.5">
              <Sparkles className="w-4 h-4 text-blue-400/50" />
              Gemini API Key
            </label>
            <input
              type="password"
              value={tempGeminiKey}
              onChange={e => setTempGeminiKey(e.target.value)}
              placeholder="输入你的 Gemini API Key（视频审核用）"
              className="w-full px-4 py-3 border border-th-line rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/20 focus:border-blue-500/30 transition-all bg-th-base text-th-heading placeholder:text-th-dim"
            />
            <p className="mt-2 text-[11px] text-th-dim leading-relaxed">
              用于视频审核（Gemini 可直接理解视频，无需抽帧，画面+音频+字幕一次搞定）。
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" className="text-blue-400/60 hover:text-blue-400 ml-1 transition-colors">
                前往获取 →
              </a>
            </p>
            <div className="mt-2 p-2.5 bg-blue-500/[0.03] rounded-lg border border-blue-500/10">
              <p className="text-[10px] text-blue-400/60 leading-relaxed">
                💡 Gemini 1.5/2.0/2.5 Flash 均免费，新用户注册即送额度。视频理解能力远超抽帧方案，支持画面+音频+字幕同时分析。
              </p>
            </div>
          </div>

          {/* Firebase 共享知识库 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-th-body mb-2.5">
              <Cloud className="w-4 h-4 text-emerald-400/50" />
              共享知识库
            </label>
            <div className="flex items-center gap-2 mb-2">
              <span className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full ${
                isFirebaseReady()
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-th-base text-th-dim border border-th-line'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isFirebaseReady() ? 'bg-emerald-400' : 'bg-th-dim'}`} />
                {isFirebaseReady() ? '已连接' : '未连接'}
              </span>
            </div>
            <div className="p-3 bg-emerald-500/[0.03] rounded-xl border border-emerald-500/10">
              <p className="text-[11px] text-emerald-400/70 leading-relaxed mb-2">
                🌐 共享知识库让所有团队成员上传的知识库互相可见，AI 审核时自动匹配本地 + 云端知识库，让审核更精准。
              </p>
              <p className="text-[10px] text-th-dim leading-relaxed">
                搭建步骤（5分钟，免费）：<br />
                1. 打开 <a href="https://console.firebase.google.com" target="_blank" rel="noopener" className="text-emerald-400/60 hover:text-emerald-400">Firebase 控制台</a>，用 Google 账号登录<br />
                2. 点击「创建项目」，输入项目名（如 contentguard-ai）<br />
                3. 项目创建后，点击左上角齿轮 → 项目设置 → 添加 Web 应用<br />
                4. 复制 firebaseConfig 中的配置项<br />
                5. 填入 <code className="px-1 py-0.5 bg-th-base rounded text-[9px]">src/lib/firebase.js</code> 中对应字段<br />
                6. 在 Firebase 控制台 → Firestore Database → 创建数据库（选择测试模式）<br />
                7. 重新构建部署即可
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-th-line flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-th-subtle hover:text-th-body hover:bg-th-elevated rounded-lg transition-colors">
            取消
          </button>
          <button onClick={handleSave} className="px-5 py-2 text-sm text-th-accent bg-th-accent/10 hover:bg-th-accent/15 border border-th-accent/20 hover:border-th-accent/35 rounded-lg transition-all font-medium shadow-sm shadow-th-accent/5">
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
