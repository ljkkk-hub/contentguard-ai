import { Shield, AlertTriangle, CheckCircle, ChevronDown, ChevronUp, Tag, Eye, Download, Sparkles, Copy, Check, ThumbsUp, ThumbsDown, MessageSquare, Cpu, Layers } from 'lucide-react';
import { useState } from 'react';
import { callGLM, buildOptimizePrompt } from '../lib/glmApi';
import { matchKnowledge, buildKnowledgeContext } from '../lib/db';
import { addCorrection } from '../lib/db';

const RISK_STYLES = {
  must_fix: {
    bg: 'bg-red-500/[0.03]',
    border: 'border-red-500/15',
    text: 'text-red-400',
    badge: 'bg-red-500/8 text-red-400 border border-red-500/20',
    label: '必须修改',
    icon: AlertTriangle,
  },
  suggest_fix: {
    bg: 'bg-amber-500/[0.03]',
    border: 'border-amber-500/15',
    text: 'text-amber-400',
    badge: 'bg-amber-500/8 text-amber-400 border border-amber-500/20',
    label: '建议优化',
    icon: Eye,
  },
  low: {
    bg: 'bg-blue-500/[0.03]',
    border: 'border-blue-500/15',
    text: 'text-blue-400',
    badge: 'bg-blue-500/8 text-blue-400 border border-blue-500/20',
    label: '轻微提醒',
    icon: Eye,
  },
  pass: {
    bg: 'bg-emerald-500/[0.03]',
    border: 'border-emerald-500/15',
    text: 'text-emerald-400',
    badge: 'bg-emerald-500/8 text-emerald-400 border border-emerald-500/20',
    label: '通过',
    icon: CheckCircle,
  },
};

const CATEGORY_COLORS = {
  '平台红线': 'bg-red-500/6 text-red-400/80 border border-red-500/15',
  '广告合规': 'bg-amber-500/6 text-amber-400/80 border border-amber-500/15',
  '品牌风险': 'bg-violet-500/6 text-violet-400/80 border border-violet-500/15',
  '价值观风险': 'bg-orange-500/6 text-orange-400/80 border border-orange-500/15',
  '内容标注': 'bg-blue-500/6 text-blue-400/80 border border-blue-500/15',
  '舆情风险': 'bg-rose-500/6 text-rose-400/80 border border-rose-500/15',
  '敏感词': 'bg-red-500/6 text-red-400/80 border border-red-500/15',
  '画面审核': 'bg-indigo-500/6 text-indigo-400/80 border border-indigo-500/15',
};

function ScoreRing({ score }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  let color = '#34d399';
  if (score < 60) color = '#f43f5e';
  else if (score < 80) color = '#f59e0b';

  return (
    <div className="relative w-24 h-24">
      <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={radius} stroke="var(--color-th-line)" strokeWidth="6" fill="none" />
        <circle
          cx="50" cy="50" r={radius}
          stroke={color} strokeWidth="6" fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000"
          style={{ filter: `drop-shadow(0 0 6px ${color}40)` }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-2xl font-bold tabular-nums" style={{ color }}>{score}</span>
      </div>
    </div>
  );
}

export default function AuditReport({ result, apiKey: apiKeyProp }) {
  const [expandedIssues, setExpandedIssues] = useState({});
  const [showRaw, setShowRaw] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizedText, setOptimizedText] = useState('');
  const [showOptimized, setShowOptimized] = useState(false);
  const [copied, setCopied] = useState(false);
  const [corrections, setCorrections] = useState({}); // { issueIdx: 'correction text' }
  const [correctionReasons, setCorrectionReasons] = useState({}); // { issueIdx: 'reason text' }
  const [showCorrectionInput, setShowCorrectionInput] = useState({}); // { issueIdx: true }
  const [feedbackGiven, setFeedbackGiven] = useState({}); // { issueIdx: 'up' | 'down' }

  // Read apiKey from props or localStorage
  const apiKey = apiKeyProp || localStorage.getItem('contentguard_api_key') || '';

  if (!result) return null;

  // 批量审核报告
  if (result.isBatch) {
    return <BatchAuditReport result={result} apiKey={apiKey} />;
  }

  const riskStyle = RISK_STYLES[result.riskLevel] || RISK_STYLES.pass;
  const RiskIcon = riskStyle.icon;

  const toggleIssue = (idx) => {
    setExpandedIssues(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const handleExport = () => {
    const reportText = generateReportText(result);
    const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `审核报告_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleOptimize = async () => {
    if (!result.originalText || !apiKey) return;
    setOptimizing(true);
    setOptimizedText('');
    try {
      // 匹配知识库
      const matchedKB = await matchKnowledge(result.originalText, result.platforms || []);
      const knowledgeContext = buildKnowledgeContext(matchedKB);

      const messages = buildOptimizePrompt(result.originalText, result.issues, result.platforms, knowledgeContext);
      const aiResult = await callGLM({ messages, model: 'glm-4-flash', apiKey });
      setOptimizedText(aiResult.trim());
      setShowOptimized(true);
    } catch (err) {
      setOptimizedText('优化失败：' + err.message);
      setShowOptimized(true);
    } finally {
      setOptimizing(false);
    }
  };

  const handleCopyOptimized = () => {
    navigator.clipboard.writeText(optimizedText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const highCount = result.issues.filter(i => i.severity === 'high').length;
  const medCount = result.issues.filter(i => i.severity === 'medium').length;
  const lowCount = result.issues.filter(i => i.severity === 'low').length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-th-accent/70" />
          <h2 className="text-sm font-semibold text-th-heading">审核报告</h2>
        </div>
        <div className="flex items-center gap-2">
          {result.issues.length > 0 && result.originalText && (
            <button
              onClick={handleOptimize}
              disabled={optimizing}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-[11px] bg-violet-500/8 hover:bg-violet-500/15 border border-violet-500/20 hover:border-violet-500/35 text-violet-400 rounded-lg transition-all disabled:opacity-40 font-medium"
            >
              {optimizing ? (
                <div className="w-3 h-3 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              一键优化
            </button>
          )}
          <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-th-subtle hover:text-th-accent hover:bg-th-accent/5 rounded-lg transition-all border border-th-line hover:border-th-accent/15">
            <Download className="w-3 h-3" />
            导出
          </button>
        </div>
      </div>

      {/* 评分总览 */}
      <div className="bg-th-base rounded-xl p-5 mb-4 border border-th-line relative overflow-hidden">
        <div className="absolute top-0 left-[10%] right-[10%] h-px bg-gradient-to-r from-transparent via-th-accent/20 to-transparent" />
        <div className="flex items-center gap-5">
          <ScoreRing score={result.score} />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${riskStyle.badge}`}>
                <RiskIcon className="w-3 h-3 inline mr-1 -mt-0.5" />
                {result.riskLevelLabel}
              </span>
            </div>
            <p className="text-sm text-th-body">{result.summary}</p>

            {result.brand && (
              <div className="mt-2 flex items-center gap-1.5 text-xs">
                <Tag className="w-3 h-3 text-violet-400/70" />
                <span className="text-th-subtle">审核品牌：</span>
                <span className="px-1.5 py-0.5 bg-violet-500/8 text-violet-400/80 rounded text-[11px] font-medium border border-violet-500/15">{result.brand}</span>
              </div>
            )}
            {result.usedModel && (
              <div className="mt-1 flex items-center gap-1.5 text-xs">
                <Cpu className="w-3 h-3 text-th-dim" />
                <span className="text-th-subtle">使用模型：</span>
                <span className="px-1.5 py-0.5 bg-th-base text-th-subtle rounded text-[11px] font-medium border border-th-line">{result.usedModel}</span>
              </div>
            )}
            {result.brandDetected && (
              <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                <span className="text-th-subtle">识别品牌：</span>
                <span className="px-1.5 py-0.5 bg-violet-500/8 text-violet-400/80 rounded text-[11px] font-medium border border-violet-500/15">{result.brandDetected}</span>
                {result.brandRisk && (
                  <span className="text-amber-400/70 ml-1">{result.brandRisk}</span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-4 mt-4">
          {highCount > 0 && (
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              <span className="text-red-400/70 font-medium">{highCount} 必须修改</span>
            </div>
          )}
          {medCount > 0 && (
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span className="text-amber-400/70 font-medium">{medCount} 建议优化</span>
            </div>
          )}
          {lowCount > 0 && (
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              <span className="text-blue-400/70 font-medium">{lowCount} 轻微提醒</span>
            </div>
          )}
        </div>
      </div>

      {/* 逐条问题 */}
      <div className="flex-1 overflow-y-auto space-y-1.5">
        {result.issues.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle className="w-10 h-10 text-emerald-400/30 mx-auto mb-2" />
            <p className="text-sm text-th-subtle">未检测到问题，内容审核通过</p>
          </div>
        ) : (
          result.issues.map((issue, idx) => {
            const catColor = CATEGORY_COLORS[issue.category] || 'bg-th-panel/50 text-th-subtle border border-th-line';
            const isExpanded = expandedIssues[idx];
            const sevStyle = RISK_STYLES[issue.severity] || RISK_STYLES.low;

            return (
              <div key={idx} className={`rounded-lg border ${sevStyle.border} ${sevStyle.bg} overflow-hidden`}>
                <button
                  onClick={() => toggleIssue(idx)}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left"
                >
                  <span className={`shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold ${sevStyle.badge}`}>
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${catColor}`}>
                        {issue.category}
                      </span>
                      {issue.platform && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-th-base text-th-subtle border border-th-line">
                          {issue.platform}
                        </span>
                      )}
                      <span className={`text-[10px] font-medium ${sevStyle.text} opacity-70`}>
                        {issue.severityLabel}
                      </span>
                    </div>
                    <p className="text-sm text-th-heading truncate">{issue.description}</p>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-th-dim shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-th-dim shrink-0" />
                  )}
                </button>

                {isExpanded && (
                  <div className="px-4 pb-3 space-y-2 border-t border-white/[0.02] pt-2">
                    {issue.original && (
                      <div>
                        <p className="text-[10px] text-th-subtle mb-0.5">原文内容</p>
                        <p className="text-sm text-th-body bg-th-base rounded-lg px-3 py-1.5 font-mono text-[13px] border border-th-line">
                          "{issue.original}"
                        </p>
                      </div>
                    )}
                    {issue.suggestion && (
                      <div>
                        <p className="text-[10px] text-th-subtle mb-0.5">修改建议</p>
                        <p className="text-sm text-emerald-400/80 bg-emerald-500/[0.03] rounded-lg px-3 py-1.5 border border-emerald-500/10">
                          {issue.suggestion}
                        </p>
                      </div>
                    )}
                    {issue.source === 'local' && (
                      <p className="text-[10px] text-th-dim">来源：本地词库检测</p>
                    )}
                    {issue.source === 'ai' && (
                      <p className="text-[10px] text-th-dim">来源：AI 语义分析</p>
                    )}

                    {/* 纠错反馈 */}
                    <div className="flex items-center gap-2 pt-1 border-t border-th-line/30">
                      <span className="text-[10px] text-th-dim">此判定：</span>
                      <button
                        onClick={() => {
                          setFeedbackGiven(prev => ({ ...prev, [idx]: 'up' }));
                          setShowCorrectionInput(prev => ({ ...prev, [idx]: false }));
                        }}
                        className={`p-1 rounded transition-colors ${feedbackGiven[idx] === 'up' ? 'text-emerald-400 bg-emerald-500/10' : 'text-th-dim hover:text-emerald-400 hover:bg-emerald-500/5'}`}
                        title="判定正确"
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setFeedbackGiven(prev => ({ ...prev, [idx]: 'down' }));
                          setShowCorrectionInput(prev => ({ ...prev, [idx]: true }));
                        }}
                        className={`p-1 rounded transition-colors ${feedbackGiven[idx] === 'down' ? 'text-red-400 bg-red-500/10' : 'text-th-dim hover:text-red-400 hover:bg-red-500/5'}`}
                        title="判定有误，提交纠正"
                      >
                        <ThumbsDown className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* 纠错输入框 */}
                    {showCorrectionInput[idx] && (
                      <div className="space-y-1.5 p-2.5 bg-red-500/[0.02] rounded-lg border border-red-500/10">
                        <div>
                          <label className="text-[10px] text-red-400/70 mb-0.5 block">正确判定应该是：</label>
                          <input
                            type="text"
                            value={corrections[idx] || ''}
                            onChange={e => setCorrections(prev => ({ ...prev, [idx]: e.target.value }))}
                            placeholder="例：这不是绝对化用语，是正常口语表达"
                            className="w-full px-2.5 py-1.5 text-xs bg-th-base border border-th-line rounded-lg text-th-body placeholder:text-th-dim focus:outline-none focus:border-red-400/30"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-red-400/70 mb-0.5 block">原因（可选）：</label>
                          <input
                            type="text"
                            value={correctionReasons[idx] || ''}
                            onChange={e => setCorrectionReasons(prev => ({ ...prev, [idx]: e.target.value }))}
                            placeholder="例：这是品牌方要求的固定表达方式"
                            className="w-full px-2.5 py-1.5 text-xs bg-th-base border border-th-line rounded-lg text-th-body placeholder:text-th-dim focus:outline-none focus:border-red-400/30"
                          />
                        </div>
                        <button
                          onClick={async () => {
                            if (!corrections[idx]) return;
                            await addCorrection({
                              auditId: Date.now(),
                              issueIndex: idx,
                              originalIssue: `${issue.category}: ${issue.description}`,
                              correction: corrections[idx],
                              reason: correctionReasons[idx] || '',
                              brand: result.brandDetected || '',
                              platform: result.platforms?.[0] || 'all',
                              keywords: issue.original ? [issue.original] : [],
                            });
                            setShowCorrectionInput(prev => ({ ...prev, [idx]: false }));
                            setCorrections(prev => ({ ...prev, [idx]: '' }));
                            setCorrectionReasons(prev => ({ ...prev, [idx]: '' }));
                            // 小提示
                            const toast = document.createElement('div');
                            toast.textContent = '✅ 纠错已保存，下次审核将自动参考';
                            toast.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-emerald-500/90 text-white text-xs rounded-lg shadow-lg z-50';
                            document.body.appendChild(toast);
                            setTimeout(() => toast.remove(), 3000);
                          }}
                          disabled={!corrections[idx]}
                          className="w-full py-1.5 text-[11px] font-medium bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors border border-red-500/15"
                        >
                          提交纠错
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 一键优化结果 */}
      {showOptimized && optimizedText && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-violet-400/70" />
              <h3 className="text-sm font-medium text-th-heading">AI 优化版</h3>
              <span className="text-[10px] text-th-subtle">违禁词已自动替换</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyOptimized}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] text-th-subtle hover:text-th-accent hover:bg-th-accent/5 rounded-lg transition-colors border border-th-line hover:border-th-accent/15"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copied ? '已复制' : '复制'}
              </button>
              <button
                onClick={() => setShowOptimized(false)}
                className="text-[11px] text-th-subtle hover:text-th-body px-2 py-1"
              >
                收起
              </button>
            </div>
          </div>
          <div className="p-4 bg-violet-500/[0.02] border border-violet-500/10 rounded-xl">
            <p className="text-sm text-th-body leading-relaxed whitespace-pre-wrap">{optimizedText}</p>
          </div>
        </div>
      )}

      {/* 原始 AI 回复 */}
      {result.rawAIResponse && (
        <div className="mt-4">
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="text-[11px] text-th-dim hover:text-th-subtle"
          >
            {showRaw ? '隐藏' : '查看'} AI 原始回复
          </button>
          {showRaw && (
            <pre className="mt-2 p-3 bg-th-base rounded-xl text-[11px] text-th-subtle overflow-auto max-h-40 border border-th-line">
              {result.rawAIResponse}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ===== 批量审核报告 =====
function BatchAuditReport({ result, apiKey }) {
  const [expandedItems, setExpandedItems] = useState({});
  const bs = result.batchSummary || {};

  const toggleItem = (idx) => {
    setExpandedItems(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const handleBatchExport = () => {
    const lines = [
      '=== 题查查 AI 批量审核报告 ===',
      `生成时间：${new Date().toLocaleString('zh-CN')}`,
      `审核类型：${result.batchType === 'text' ? '文案' : '图片'}`,
      `总数量：${bs.total || 0}`,
      `平均分：${bs.avgScore || 0}`,
      '',
      '--- 风险分布 ---',
    ];
    const rd = bs.riskDistribution || {};
    if (rd.must_fix) lines.push(`🔴 必须修改：${rd.must_fix} 条`);
    if (rd.suggest_fix) lines.push(`🟡 建议优化：${rd.suggest_fix} 条`);
    if (rd.low) lines.push(`🔵 轻微提醒：${rd.low} 条`);
    if (rd.pass) lines.push(`🟢 通过：${rd.pass} 条`);
    if (bs.failed) lines.push(`⚠️ 审核失败：${bs.failed} 条`);

    (result.batchResults || []).forEach((r, i) => {
      lines.push('', `=== ${r._batchLabel || `第 ${i + 1} 条`} ===`);
      lines.push(`评分：${r.score}/100  风险：${r.riskLevelLabel}`);
      lines.push(`结论：${r.summary}`);
      if (r.issues?.length > 0) {
        r.issues.forEach((issue, j) => {
          lines.push(`  ${j + 1}. [${issue.severityLabel}] ${issue.category}: ${issue.description}`);
          if (issue.suggestion) lines.push(`     建议：${issue.suggestion}`);
        });
      }
    });

    lines.push('', '=== 报告结束 ===');
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `批量审核报告_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const rd = bs.riskDistribution || {};

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-violet-400/70" />
          <h2 className="text-sm font-semibold text-th-heading">批量审核报告</h2>
          <span className="text-[10px] px-1.5 py-0.5 bg-violet-500/8 text-violet-400/70 rounded font-medium border border-violet-500/15">
            {result.batchType === 'text' ? '文案' : '图片'} × {bs.total || 0}
          </span>
        </div>
        <button onClick={handleBatchExport} className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-th-subtle hover:text-th-accent hover:bg-th-accent/5 rounded-lg transition-all border border-th-line hover:border-th-accent/15">
          <Download className="w-3 h-3" />
          导出
        </button>
      </div>

      {/* 汇总统计 */}
      <div className="bg-th-base rounded-xl p-4 mb-4 border border-th-line">
        <div className="flex items-center gap-5">
          <ScoreRing score={bs.avgScore || 0} />
          <div className="flex-1">
            <p className="text-sm text-th-body mb-2">{result.summary}</p>
            {result.brand && (
              <div className="flex items-center gap-1.5 text-xs">
                <Tag className="w-3 h-3 text-violet-400/70" />
                <span className="text-th-subtle">审核品牌：</span>
                <span className="px-1.5 py-0.5 bg-violet-500/8 text-violet-400/80 rounded text-[11px] font-medium border border-violet-500/15">{result.brand}</span>
              </div>
            )}
            {result.usedModel && (
              <div className="mt-1 flex items-center gap-1.5 text-xs">
                <Cpu className="w-3 h-3 text-th-dim" />
                <span className="text-th-subtle">使用模型：</span>
                <span className="px-1.5 py-0.5 bg-th-base text-th-subtle rounded text-[11px] font-medium border border-th-line">{result.usedModel}</span>
              </div>
            )}
          </div>
        </div>

        {/* 风险分布条 */}
        <div className="flex gap-3 mt-3 flex-wrap">
          {rd.must_fix > 0 && (
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              <span className="text-red-400/70 font-medium">{rd.must_fix} 必须修改</span>
            </div>
          )}
          {rd.suggest_fix > 0 && (
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span className="text-amber-400/70 font-medium">{rd.suggest_fix} 建议优化</span>
            </div>
          )}
          {rd.low > 0 && (
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              <span className="text-blue-400/70 font-medium">{rd.low} 轻微提醒</span>
            </div>
          )}
          {rd.pass > 0 && (
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-emerald-400/70 font-medium">{rd.pass} 通过</span>
            </div>
          )}
          {bs.failed > 0 && (
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
              <span className="text-gray-400/70 font-medium">{bs.failed} 失败</span>
            </div>
          )}
        </div>
      </div>

      {/* 每条结果 */}
      <div className="flex-1 overflow-y-auto space-y-1.5">
        {(result.batchResults || []).map((item, idx) => {
          const itemRisk = RISK_STYLES[item.riskLevel] || RISK_STYLES.pass;
          const ItemIcon = itemRisk.icon;
          const isExpanded = expandedItems[idx];

          return (
            <div key={idx} className={`rounded-lg border ${itemRisk.border} ${itemRisk.bg} overflow-hidden`}>
              <button
                onClick={() => toggleItem(idx)}
                className="w-full px-4 py-3 flex items-center gap-3 text-left"
              >
                {/* 分数圆点 */}
                <div className="shrink-0 w-10 h-10 rounded-lg flex flex-col items-center justify-center" style={{ background: item.score >= 80 ? 'rgba(52,211,153,0.1)' : item.score >= 60 ? 'rgba(245,158,11,0.1)' : 'rgba(244,63,94,0.1)' }}>
                  <span className="text-sm font-bold tabular-nums" style={{ color: item.score >= 80 ? '#34d399' : item.score >= 60 ? '#f59e0b' : '#f43f5e' }}>{item.score}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${itemRisk.badge}`}>
                      {item.riskLevelLabel}
                    </span>
                    <span className="text-[11px] text-th-dim truncate">
                      {item._batchLabel || `第 ${idx + 1} 条`}
                    </span>
                  </div>
                  <p className="text-xs text-th-subtle truncate">
                    {item.issues.length > 0 ? `${item.issues.length} 个问题` : '无问题'}
                    {item.summary && ` · ${item.summary}`}
                  </p>
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-th-dim shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-th-dim shrink-0" />
                )}
              </button>

              {isExpanded && (
                <div className="px-4 pb-3 space-y-1.5 border-t border-white/[0.02] pt-2">
                  {/* 文案预览 */}
                  {item.originalText && (
                    <div className="p-2 bg-th-base rounded-lg border border-th-line">
                      <p className="text-[11px] text-th-dim mb-1">原文</p>
                      <p className="text-xs text-th-body line-clamp-3">{item.originalText.slice(0, 200)}</p>
                    </div>
                  )}

                  {/* 问题列表 */}
                  {item.issues.length > 0 ? item.issues.map((issue, j) => {
                    const catColor = CATEGORY_COLORS[issue.category] || 'bg-th-panel/50 text-th-subtle border border-th-line';
                    const sevStyle = RISK_STYLES[issue.severity] || RISK_STYLES.low;
                    return (
                      <div key={j} className="flex items-start gap-2 py-1.5">
                        <span className={`shrink-0 w-4 h-4 rounded flex items-center justify-center text-[9px] font-bold mt-0.5 ${sevStyle.badge}`}>
                          {j + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 mb-0.5">
                            <span className={`px-1 py-0 rounded text-[9px] font-medium ${catColor}`}>{issue.category}</span>
                            <span className={`text-[9px] font-medium ${sevStyle.text} opacity-70`}>{issue.severityLabel}</span>
                          </div>
                          <p className="text-xs text-th-heading">{issue.description}</p>
                          {issue.suggestion && (
                            <p className="text-[11px] text-emerald-400/70 mt-0.5">→ {issue.suggestion}</p>
                          )}
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="flex items-center gap-2 py-2">
                      <CheckCircle className="w-4 h-4 text-emerald-400/50" />
                      <p className="text-xs text-emerald-400/70">审核通过，未检测到问题</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function generateReportText(result) {
  const lines = [
    '=== 题查查 AI 审核报告 ===',
    `生成时间：${new Date().toLocaleString('zh-CN')}`,
    `综合评分：${result.score}/100`,
    `风险等级：${result.riskLevelLabel}`,
    `审核结论：${result.summary}`,
    '',
  ];

  if (result.brandDetected) {
    lines.push(`识别品牌：${result.brandDetected}`);
    if (result.brandRisk) lines.push(`品牌风险：${result.brandRisk}`);
    lines.push('');
  }

  if (result.issues.length > 0) {
    lines.push('--- 问题详情 ---');
    result.issues.forEach((issue, idx) => {
      lines.push('');
      lines.push(`${idx + 1}. [${issue.severityLabel}] ${issue.category}${issue.platform ? ` - ${issue.platform}` : ''}`);
      lines.push(`   问题：${issue.description}`);
      if (issue.original) lines.push(`   原文："${issue.original}"`);
      if (issue.suggestion) lines.push(`   建议：${issue.suggestion}`);
    });
  } else {
    lines.push('未检测到问题，内容审核通过。');
  }

  lines.push('', '=== 报告结束 ===');
  return lines.join('\n');
}
