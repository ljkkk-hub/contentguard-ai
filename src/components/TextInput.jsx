import { useState, useCallback, useRef } from 'react';
import { FileText, Upload, AlertCircle, WifiOff, Layers, FileType, X, Plus, Trash2 } from 'lucide-react';
import DFAMatcher from '../lib/dfaMatcher';
import { AD_EXTREME_WORDS, PLATFORM_LIMITED_WORDS, VIOLENCE_WORDS, PORN_WORDS } from '../data/sensitiveWords';
import { callGLM, buildTextAuditPrompt } from '../lib/glmApi';
import { matchKnowledge, buildKnowledgeContext } from '../lib/db';
import { buildCorrectionContext } from '../lib/db';

const dfa = new DFAMatcher();

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} 超时（${ms / 1000}秒），请检查网络或刷新重试`)), ms)
    ),
  ]);
}

function buildAllWords(platforms) {
  const words = [...AD_EXTREME_WORDS, ...VIOLENCE_WORDS, ...PORN_WORDS];
  if (platforms.includes('all')) {
    Object.values(PLATFORM_LIMITED_WORDS).forEach(list => words.push(...list));
  } else {
    platforms.forEach(p => {
      if (PLATFORM_LIMITED_WORDS[p]) {
        words.push(...PLATFORM_LIMITED_WORDS[p]);
      }
    });
  }
  return [...new Set(words)];
}

// 审核单条文案
async function auditSingleText(text, { apiKey, model, platforms, brand }) {
  // 1. DFA 本地词库检测
  const allWords = buildAllWords(platforms);
  dfa.build(allWords);
  const hits = dfa.match(text);

  // 2. 匹配知识库
  const matchedKB = await matchKnowledge(text, platforms, brand);
  const knowledgeContext = buildKnowledgeContext(matchedKB);

  // 3. 获取纠错记录
  const correctionContext = await buildCorrectionContext();

  // 4. AI 审核
  const messages = buildTextAuditPrompt(text, platforms, knowledgeContext, correctionContext);
  const aiResult = await withTimeout(
    callGLM({ messages, model, apiKey }),
    20000,
    'GLM 文案审核'
  );

  let parsed;
  try {
    const jsonMatch = aiResult.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch {
    parsed = null;
  }

  const localIssues = hits.map(hit => ({
    category: '敏感词',
    severity: 'high',
    severityLabel: '必须修改',
    description: `检测到敏感词「${hit.word}」`,
    original: hit.word,
    suggestion: '请替换或删除该词',
    source: 'local',
  }));

  if (parsed) {
    const aiIssues = (parsed.issues || []).map(issue => ({ ...issue, source: 'ai' }));
    return {
      originalText: text,
      platforms,
      brand,
      score: parsed.score ?? 100,
      riskLevel: parsed.riskLevel ?? 'pass',
      riskLevelLabel: parsed.riskLevelLabel ?? '通过',
      brandDetected: parsed.brandDetected || '',
      brandRisk: parsed.brandRisk || '',
      issues: [...localIssues, ...aiIssues],
      summary: parsed.summary || '',
      localHitCount: hits.length,
      matchedKBCount: matchedKB.length,
      usedModel: model,
    };
  }

  return {
    originalText: text,
    platforms,
    brand,
    score: hits.length === 0 ? 80 : Math.max(0, 80 - hits.length * 10),
    riskLevel: hits.length > 0 ? 'must_fix' : 'pass',
    riskLevelLabel: hits.length > 0 ? '必须修改' : '通过',
    brandDetected: '',
    brandRisk: '',
    issues: localIssues,
    summary: hits.length > 0 ? `本地检测到 ${hits.length} 个敏感词` : '未检测到明显问题',
    localHitCount: hits.length,
    matchedKBCount: matchedKB.length,
    rawAIResponse: aiResult,
    usedModel: model,
  };
}

export default function TextInput({ apiKey, model, platforms, brand, onResult, onAuditStart, onAuditEnd }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [localHits, setLocalHits] = useState(null);
  const [matchedKBCount, setMatchedKBCount] = useState(0);
  const [batchMode, setBatchMode] = useState(false);
  const [batchProgress, setBatchProgress] = useState('');

  // 批量模式：多卡片
  const [batchItems, setBatchItems] = useState([{ id: 1, text: '' }]);
  const nextIdRef = useRef(2);

  const addBatchItem = () => {
    setBatchItems(prev => [...prev, { id: nextIdRef.current++, text: '' }]);
  };

  const removeBatchItem = (id) => {
    setBatchItems(prev => prev.filter(item => item.id !== id));
  };

  const updateBatchItem = (id, newText) => {
    setBatchItems(prev => prev.map(item => item.id === id ? { ...item, text: newText } : item));
  };

  const handleBatchFileUpload = (id, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => updateBatchItem(id, ev.target.result);
    reader.readAsText(file);
  };

  const handleSingleAudit = useCallback(async () => {
    if (!text.trim()) return;
    if (!brand) {
      setError('请先在上方的「品牌」栏选择品牌后再提交审核');
      return;
    }
    setLoading(true);
    setError('');
    setLocalHits(null);
    onAuditStart?.();

    try {
      const result = await auditSingleText(text, { apiKey, model, platforms, brand });

      // 展示本地命中
      const allWords = buildAllWords(platforms);
      dfa.build(allWords);
      const hits = dfa.match(text);
      setLocalHits(hits);
      setMatchedKBCount(result.matchedKBCount || 0);

      onResult(result);
    } catch (err) {
      let msg = err.message || '未知错误';
      if (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed to fetch')) {
        msg = `网络请求失败：${msg}。建议：1) 检查是否开了代理/VPN；2) 刷新重试`;
      }
      setError(msg);
    } finally {
      setLoading(false);
      onAuditEnd?.();
    }
  }, [text, apiKey, model, platforms, onResult, brand, onAuditStart, onAuditEnd]);

  const handleBatchAudit = useCallback(async () => {
    if (!brand) {
      setError('请先在上方的「品牌」栏选择品牌后再提交审核');
      return;
    }

    const segments = batchItems.map(item => item.text.trim()).filter(s => s.length > 0);
    if (segments.length === 0) {
      setError('请至少输入一条文案内容');
      return;
    }

    setLoading(true);
    setError('');
    onAuditStart?.();

    const batchResults = [];
    const errors = [];

    for (let i = 0; i < batchItems.length; i++) {
      const itemText = batchItems[i].text.trim();
      if (!itemText) continue;

      setBatchProgress(`审核中 ${i + 1}/${batchItems.length}...`);
      try {
        const result = await auditSingleText(itemText, { apiKey, model, platforms, brand });
        result._batchIndex = i;
        result._batchLabel = `文案 ${i + 1}`;
        batchResults.push(result);
      } catch (err) {
        errors.push({ index: i, text: itemText.slice(0, 30), error: err.message });
        batchResults.push({
          _batchIndex: i,
          _batchLabel: `文案 ${i + 1}`,
          originalText: itemText,
          platforms,
          brand,
          score: 0,
          riskLevel: 'must_fix',
          riskLevelLabel: '审核失败',
          brandDetected: '',
          brandRisk: '',
          issues: [{
            category: '系统',
            severity: 'high',
            severityLabel: '必须修改',
            description: `审核失败：${err.message}`,
            suggestion: '请检查网络或重新审核此条',
            source: 'system',
          }],
          summary: '审核失败',
          usedModel: model,
        });
      }
      // 小间隔防止 API 限流
      if (i < batchItems.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // 计算汇总
    const scores = batchResults.map(r => r.score);
    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const allIssues = batchResults.flatMap(r => r.issues);
    const highCount = allIssues.filter(i => i.severity === 'high').length;
    const medCount = allIssues.filter(i => i.severity === 'medium').length;

    let overallRisk = 'pass';
    let overallRiskLabel = '通过';
    if (highCount > 0) { overallRisk = 'must_fix'; overallRiskLabel = '必须修改'; }
    else if (medCount > 0) { overallRisk = 'suggest_fix'; overallRiskLabel = '建议优化'; }

    onResult({
      isBatch: true,
      batchType: 'text',
      platforms,
      brand,
      score: avgScore,
      riskLevel: overallRisk,
      riskLevelLabel: overallRiskLabel,
      brandDetected: '',
      brandRisk: '',
      issues: allIssues,
      summary: `共 ${batchResults.length} 条文案，平均分 ${avgScore}，${highCount} 个高风险、${medCount} 个中风险`,
      usedModel: model,
      batchResults,
      batchSummary: {
        total: batchResults.length,
        success: batchResults.length - errors.length,
        failed: errors.length,
        avgScore,
        riskDistribution: {
          must_fix: batchResults.filter(r => r.riskLevel === 'must_fix').length,
          suggest_fix: batchResults.filter(r => r.riskLevel === 'suggest_fix').length,
          low: batchResults.filter(r => r.riskLevel === 'low').length,
          pass: batchResults.filter(r => r.riskLevel === 'pass').length,
        },
      },
    });

    setLoading(false);
    setBatchProgress('');
    onAuditEnd?.();
  }, [batchItems, apiKey, model, platforms, brand, onResult, onAuditStart, onAuditEnd]);

  const handleAudit = batchMode ? handleBatchAudit : handleSingleAudit;

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setText(ev.target.result);
    reader.readAsText(file);
  };

  // 总字数（批量模式）
  const totalBatchChars = batchItems.reduce((sum, item) => sum + item.text.length, 0);
  const validBatchCount = batchItems.filter(item => item.text.trim().length > 0).length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="w-4 h-4 text-th-accent/70" />
        <h2 className="text-sm font-semibold text-th-heading">文案审核</h2>

        {/* 单个/批量 切换 */}
        <div className="ml-auto flex items-center bg-th-base rounded-lg border border-th-line p-0.5">
          <button
            onClick={() => setBatchMode(false)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
              !batchMode ? 'bg-th-elevated text-th-accent border border-th-line shadow-sm' : 'text-th-subtle hover:text-th-body'
            }`}
          >
            <FileType className="w-3 h-3 inline -mt-0.5 mr-1" />
            单个
          </button>
          <button
            onClick={() => setBatchMode(true)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
              batchMode ? 'bg-th-elevated text-th-accent border border-th-line shadow-sm' : 'text-th-subtle hover:text-th-body'
            }`}
          >
            <Layers className="w-3 h-3 inline -mt-0.5 mr-1" />
            批量
          </button>
        </div>
      </div>

      {batchMode ? (
        /* ===== 批量模式：多卡片 ===== */
        <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
          {batchItems.map((item, index) => (
            <div
              key={item.id}
              className="bg-th-base rounded-xl border border-th-line p-3 transition-all hover:border-th-accent/15"
            >
              {/* 卡片头部 */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium text-th-subtle bg-th-panel px-1.5 py-0.5 rounded">
                    文案 {index + 1}
                  </span>
                  {item.text.trim().length > 0 && (
                    <span className="text-[10px] text-th-dim tabular-nums">
                      {item.text.length} 字
                    </span>
                  )}
                </div>
                {batchItems.length > 1 && (
                  <button
                    onClick={() => removeBatchItem(item.id)}
                    className="p-1 rounded-md text-th-dim hover:text-red-400 hover:bg-red-400/5 transition-all"
                    title="删除此条"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* 文案输入 */}
              <textarea
                value={item.text}
                onChange={e => updateBatchItem(item.id, e.target.value)}
                placeholder="输入或粘贴文案内容..."
                className="w-full min-h-[80px] p-3 border border-th-line rounded-lg text-sm leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-th-accent/20 focus:border-th-accent/30 placeholder:text-th-dim bg-th-panel/30 text-th-heading transition-all font-normal"
              />

              {/* 底部操作 */}
              <div className="flex items-center justify-between mt-2">
                <label className="flex items-center gap-1 text-[11px] text-th-subtle cursor-pointer hover:text-th-accent transition-colors">
                  <Upload className="w-3 h-3" />
                  上传文件填充
                  <input
                    type="file"
                    accept=".txt,.md"
                    onChange={e => handleBatchFileUpload(item.id, e)}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          ))}

          {/* 新增文案按钮 */}
          <button
            onClick={addBatchItem}
            className="w-full py-2.5 border border-dashed border-th-line rounded-xl text-[11px] text-th-subtle hover:text-th-accent hover:border-th-accent/25 hover:bg-th-accent/[0.02] transition-all flex items-center justify-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            新增文案
          </button>
        </div>
      ) : (
        /* ===== 单个模式：大文本框 ===== */
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="粘贴或输入需要审核的文案内容...&#10;&#10;支持视频脚本、小红书笔记、抖音文案等任何文字内容"
          className="flex-1 min-h-[200px] w-full p-4 border border-th-line rounded-xl text-sm leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-th-accent/20 focus:border-th-accent/30 placeholder:text-th-dim bg-th-base text-th-heading transition-all font-normal"
        />
      )}

      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-3">
          {!batchMode && (
            <label className="flex items-center gap-1.5 text-[11px] text-th-subtle cursor-pointer hover:text-th-accent transition-colors">
              <Upload className="w-3.5 h-3.5" />
              上传文件
              <input type="file" accept=".txt,.md,.doc,.docx" onChange={handleFileUpload} className="hidden" />
            </label>
          )}
          <span className="text-[11px] text-th-dim tabular-nums">
            {batchMode ? `${validBatchCount}/${batchItems.length} 条 · ${totalBatchChars} 字` : `${text.length} 字`}
          </span>
          {matchedKBCount > 0 && (
            <span className="text-[11px] text-th-accent/70">📚 {matchedKBCount} 个知识库已匹配</span>
          )}
        </div>

        <button
          onClick={handleAudit}
          disabled={loading || (batchMode ? validBatchCount === 0 : !text.trim()) || !brand}
          className="px-5 py-2 bg-th-accent/10 hover:bg-th-accent/20 border border-th-accent/25 hover:border-th-accent/40 disabled:bg-th-panel disabled:border-th-line disabled:text-th-dim text-th-accent text-sm font-medium rounded-lg transition-all flex items-center gap-2 shadow-sm shadow-th-accent/5 disabled:shadow-none"
          title={!brand ? '请先选择品牌' : ''}
        >
          {loading ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-th-accent/30 border-t-th-accent rounded-full animate-spin" />
              {batchProgress || '审核中...'}
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-th-accent shadow-sm shadow-th-accent/50" />
              {batchMode ? `批量审核 (${validBatchCount}条)` : '开始审核'}
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="mt-3 p-3 bg-red-500/[0.04] border border-red-500/10 rounded-xl flex items-start gap-2">
          {error.includes('网络') || error.includes('超时') || error.includes('VPN') ? (
            <WifiOff className="w-4 h-4 text-red-400/70 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-400/70 mt-0.5 shrink-0" />
          )}
          <p className="text-xs text-red-400/80 leading-relaxed">{error}</p>
        </div>
      )}

      {localHits && localHits.length > 0 && (
        <div className="mt-3 p-3 bg-th-accent/[0.03] border border-th-accent/10 rounded-xl">
          <p className="text-xs text-th-accent/70">
            快速检测到 <strong className="text-th-accent">{localHits.length}</strong> 个敏感词：
            {localHits.map((h, i) => (
              <span key={i} className="inline-block ml-1.5 px-1.5 py-0.5 bg-th-accent/8 rounded text-th-accent/80 text-[11px] border border-th-accent/15">{h.word}</span>
            ))}
          </p>
        </div>
      )}
    </div>
  );
}
