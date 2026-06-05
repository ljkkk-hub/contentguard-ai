import { useState, useCallback } from 'react';
import { ImageIcon, Upload, AlertCircle, WifiOff, Layers, Image } from 'lucide-react';
import { callGLMVision, buildImageAuditPrompt } from '../lib/glmApi';
import { callGeminiImage } from '../lib/geminiApi';
import DFAMatcher from '../lib/dfaMatcher';
import { AD_EXTREME_WORDS, VIOLENCE_WORDS, PORN_WORDS, PLATFORM_LIMITED_WORDS } from '../data/sensitiveWords';
import { matchKnowledge, buildKnowledgeContext, buildCorrectionContext } from '../lib/db';

// 带超时的 fetch 包装
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} 超时（${ms / 1000}秒），请检查网络或更换模型`)), ms)
    ),
  ]);
}

/**
 * 压缩图片到指定最大尺寸，返回 base64 data URL
 */
function compressImage(dataUrl, maxDim = 1024, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('图片加载失败，可能格式不支持'));
    img.src = dataUrl;
  });
}

// 审核单张图片
async function auditSingleImage(file, preview, { apiKey, model, platforms, brand }) {
  // Step 1: 压缩图片
  let compressedImage = await compressImage(preview, 512, 0.7);
  let base64Data = compressedImage.replace(/^data:image\/\w+;base64,/, '');
  let imageSizeMB = (base64Data.length * 0.75) / 1024 / 1024;
  if (imageSizeMB > 5) {
    compressedImage = await compressImage(preview, 512, 0.5);
    base64Data = compressedImage.replace(/^data:image\/\w+;base64,/, '');
    imageSizeMB = (base64Data.length * 0.75) / 1024 / 1024;
  }
  if (imageSizeMB > 5) {
    compressedImage = await compressImage(preview, 384, 0.5);
    base64Data = compressedImage.replace(/^data:image\/\w+;base64,/, '');
    imageSizeMB = (base64Data.length * 0.75) / 1024 / 1024;
  }
  if (imageSizeMB > 5) {
    throw new Error(`图片过大（${imageSizeMB.toFixed(1)}MB），压缩后仍超 5MB 限制`);
  }

  // Step 2: 匹配知识库
  const matchedKB = await matchKnowledge(file.name, platforms, brand);
  const knowledgeContext = buildKnowledgeContext(matchedKB);
  const correctionContext = await buildCorrectionContext();
  const prompt = buildImageAuditPrompt(platforms, knowledgeContext + correctionContext);

  // Step 3: 视觉模型分析
  let visionResponse;
  let usedModel = model;
  const isGemini = model?.startsWith('gemini-');

  if (isGemini) {
    const geminiKey = localStorage.getItem('contentguard_gemini_key');
    if (!geminiKey) {
      throw new Error('使用 Gemini 模型需要先在设置中配置 Gemini API Key');
    }
    const base64Only = compressedImage.replace(/^data:image\/\w+;base64,/, '');
    const mimeType = compressedImage.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/jpeg';
    try {
      visionResponse = await withTimeout(
        callGeminiImage({ imageBase64: base64Only, mimeType, prompt, apiKey: geminiKey, model }),
        15000,
        'Gemini 图片分析'
      );
    } catch (geminiErr) {
      usedModel = 'glm-4v-flash';
      visionResponse = await withTimeout(
        callGLMVision({ images: [compressedImage], prompt, apiKey, model: 'glm-4v-flash' }),
        15000,
        'GLM-4V 图片分析'
      );
    }
  } else {
    visionResponse = await withTimeout(
      callGLMVision({ images: [compressedImage], prompt, apiKey, model: 'glm-4v-flash' }),
      15000,
      'GLM-4V 图片分析'
    );
  }

  // Step 4: 解析结果
  let visualParsed = null;
  try {
    const jsonMatch = visionResponse.match(/\{[\s\S]*\}/);
    visualParsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch {
    visualParsed = null;
  }

  // Step 5: 本地词库扫描
  const localIssues = [];
  const textToScan = file.name.replace(/\.\w+$/, '');
  const selectedPlatforms = platforms.includes('all')
    ? ['douyin', 'kuaishou', 'xiaohongshu', 'weishi']
    : platforms;
  const allWords = [...AD_EXTREME_WORDS, ...VIOLENCE_WORDS, ...PORN_WORDS];
  for (const p of selectedPlatforms) {
    allWords.push(...(PLATFORM_LIMITED_WORDS[p] || []));
  }
  const matcher = new DFAMatcher();
  matcher.build([...new Set(allWords)]);
  const matches = matcher.match(textToScan);
  for (const word of [...new Set(matches)]) {
    localIssues.push({
      category: '敏感词',
      severity: 'high',
      severityLabel: '必须修改',
      description: `文件名中包含敏感词"${word}"`,
      original: word,
      suggestion: '建议修改文件名或检查图片中是否有相关文字',
      source: 'local',
    });
  }

  // Step 6: 合并结果
  const visualIssues = (visualParsed?.issues || []).map(i => ({
    ...i, source: 'ai', category: i.category || '画面合规',
  }));
  const allIssues = [...visualIssues, ...localIssues];
  const uniqueIssues = [];
  const seenDescs = new Set();
  for (const issue of allIssues) {
    if (!seenDescs.has(issue.description)) {
      seenDescs.add(issue.description);
      uniqueIssues.push(issue);
    }
  }

  const aiScore = visualParsed?.score ?? 100;
  const localPenalty = localIssues.length * 5;
  const finalScore = Math.max(0, aiScore - localPenalty);

  let riskLevel = visualParsed?.riskLevel || 'pass';
  let riskLevelLabel = visualParsed?.riskLevelLabel || '通过';
  if (uniqueIssues.some(i => i.severity === 'high')) {
    riskLevel = 'must_fix'; riskLevelLabel = '必须修改';
  } else if (uniqueIssues.some(i => i.severity === 'medium')) {
    riskLevel = 'suggest_fix'; riskLevelLabel = '建议优化';
  }

  return {
    originalText: `[图片审核] ${file.name}`,
    platforms,
    brand,
    score: finalScore,
    riskLevel,
    riskLevelLabel,
    brandDetected: visualParsed?.brandDetected || '',
    brandRisk: visualParsed?.brandRisk || '',
    issues: uniqueIssues,
    summary: visualParsed?.summary || '图片审核完成',
    rawAIResponse: visionResponse,
    usedModel,
    _fileName: file.name,
  };
}

export default function ImageInput({ apiKey, model, platforms, brand, onResult, onAuditStart, onAuditEnd }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [batchMode, setBatchMode] = useState(false);
  const [batchFiles, setBatchFiles] = useState([]);
  const [batchPreviews, setBatchPreviews] = useState([]);
  const [batchProgress, setBatchProgress] = useState('');

  const handleFileChange = (e) => {
    if (batchMode) {
      const files = Array.from(e.target.files || []);
      setBatchFiles(files);
      // 生成预览
      const previews = [];
      let loaded = 0;
      if (files.length === 0) { setBatchPreviews([]); return; }
      files.forEach((f, i) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          previews[i] = ev.target.result;
          loaded++;
          if (loaded === files.length) setBatchPreviews([...previews]);
        };
        reader.readAsDataURL(f);
      });
    } else {
      const f = e.target.files?.[0];
      if (f) {
        setFile(f);
        const reader = new FileReader();
        reader.onload = (ev) => setPreview(ev.target.result);
        reader.readAsDataURL(f);
      }
    }
  };

  // 单张审核
  const handleSingleAudit = useCallback(async () => {
    if (!file || !preview) return;
    if (!brand) {
      setError('请先在上方的「品牌」栏选择品牌后再提交审核');
      return;
    }
    setLoading(true);
    setError('');
    setProgress('正在准备图片...');
    onAuditStart?.();

    try {
      const result = await auditSingleImage(file, preview, { apiKey, model, platforms, brand });
      onResult(result);
    } catch (err) {
      let msg = err.message || '未知错误';
      if (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed to fetch')) {
        msg = `网络请求失败：${msg}。建议：1) 检查是否开了代理/VPN；2) 换 GLM-4V 模型；3) 刷新重试`;
      }
      setError(msg);
    } finally {
      setLoading(false);
      setProgress('');
      onAuditEnd?.();
    }
  }, [file, preview, apiKey, model, platforms, onResult, brand, onAuditStart, onAuditEnd]);

  // 批量审核
  const handleBatchAudit = useCallback(async () => {
    if (batchFiles.length === 0) return;
    if (!brand) {
      setError('请先在上方的「品牌」栏选择品牌后再提交审核');
      return;
    }

    setLoading(true);
    setError('');
    onAuditStart?.();

    const batchResults = [];

    for (let i = 0; i < batchFiles.length; i++) {
      setBatchProgress(`审核中 ${i + 1}/${batchFiles.length}...`);
      try {
        const f = batchFiles[i];
        // 读取 data URL
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve(ev.target.result);
          reader.onerror = reject;
          reader.readAsDataURL(f);
        });

        const result = await auditSingleImage(f, dataUrl, { apiKey, model, platforms, brand });
        result._batchIndex = i;
        result._batchLabel = f.name;
        batchResults.push(result);
      } catch (err) {
        batchResults.push({
          _batchIndex: i,
          _batchLabel: batchFiles[i].name,
          originalText: `[图片审核] ${batchFiles[i].name}`,
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
            suggestion: '请检查网络或重新审核此图',
            source: 'system',
          }],
          summary: '审核失败',
          usedModel: model,
          _fileName: batchFiles[i].name,
        });
      }
      // 间隔防限流
      if (i < batchFiles.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // 汇总
    const scores = batchResults.map(r => r.score);
    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const allIssues = batchResults.flatMap(r => r.issues);
    const highCount = allIssues.filter(i => i.severity === 'high').length;
    const medCount = allIssues.filter(i => i.severity === 'medium').length;

    let overallRisk = 'pass', overallRiskLabel = '通过';
    if (highCount > 0) { overallRisk = 'must_fix'; overallRiskLabel = '必须修改'; }
    else if (medCount > 0) { overallRisk = 'suggest_fix'; overallRiskLabel = '建议优化'; }

    onResult({
      isBatch: true,
      batchType: 'image',
      originalText: `[批量图片审核] ${batchFiles.length} 张`,
      platforms,
      brand,
      score: avgScore,
      riskLevel: overallRisk,
      riskLevelLabel: overallRiskLabel,
      brandDetected: '',
      brandRisk: '',
      issues: allIssues,
      summary: `共 ${batchFiles.length} 张图片，平均分 ${avgScore}，${highCount} 个高风险、${medCount} 个中风险`,
      usedModel: model,
      batchResults,
      batchSummary: {
        total: batchFiles.length,
        success: batchResults.filter(r => r.riskLevel !== 'must_fix' || r.issues.every(i => i.source === 'local')).length,
        failed: batchResults.filter(r => r.riskLevelLabel === '审核失败').length,
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
  }, [batchFiles, apiKey, model, platforms, brand, onResult, onAuditStart, onAuditEnd]);

  const handleAudit = batchMode ? handleBatchAudit : handleSingleAudit;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3">
        <ImageIcon className="w-4 h-4 text-th-accent/70" />
        <h2 className="text-sm font-semibold text-th-heading">图片审核</h2>

        {/* 单个/批量 切换 */}
        <div className="ml-auto flex items-center bg-th-base rounded-lg border border-th-line p-0.5">
          <button
            onClick={() => { setBatchMode(false); setBatchFiles([]); setBatchPreviews([]); }}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
              !batchMode ? 'bg-th-elevated text-th-accent border border-th-line shadow-sm' : 'text-th-subtle hover:text-th-body'
            }`}
          >
            <Image className="w-3 h-3 inline -mt-0.5 mr-1" />
            单个
          </button>
          <button
            onClick={() => { setBatchMode(true); setFile(null); setPreview(''); }}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
              batchMode ? 'bg-th-elevated text-th-accent border border-th-line shadow-sm' : 'text-th-subtle hover:text-th-body'
            }`}
          >
            <Layers className="w-3 h-3 inline -mt-0.5 mr-1" />
            批量
          </button>
        </div>
      </div>

      <div className={`flex-1 min-h-[200px] border border-dashed rounded-xl flex flex-col items-center justify-center p-6 hover:border-th-accent/20 transition-colors bg-th-base/50 overflow-hidden ${batchMode ? 'border-violet-500/20' : 'border-th-line'}`}>
        {batchMode ? (
          // 批量模式
          batchFiles.length > 0 ? (
            <div className="w-full">
              <div className="flex gap-2 flex-wrap max-h-[180px] overflow-y-auto">
                {batchPreviews.filter(Boolean).map((p, i) => (
                  <div key={i} className="w-14 h-14 rounded-lg overflow-hidden border border-th-line bg-th-base shrink-0">
                    <img src={p} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
              <p className="text-sm font-medium text-th-heading mt-3">{batchFiles.length} 张图片已选择</p>
              <button
                onClick={() => { setBatchFiles([]); setBatchPreviews([]); }}
                className="mt-2 text-[11px] text-th-subtle hover:text-red-400 transition-colors"
              >
                重新选择
              </button>
            </div>
          ) : (
            <label className="cursor-pointer text-center">
              <Layers className="w-8 h-8 text-th-line mx-auto mb-3" />
              <p className="text-sm text-th-subtle">点击选择多张图片</p>
              <p className="text-[11px] text-th-dim mt-1">支持 JPG、PNG、WEBP 格式，可一次选择多张</p>
              <input type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />
            </label>
          )
        ) : (
          // 单个模式
          file && preview ? (
            <div className="text-center w-full">
              <div className="relative mx-auto max-h-[200px] overflow-hidden rounded-lg mb-3">
                <img src={preview} alt="preview" className="max-h-[200px] max-w-full object-contain mx-auto rounded-lg" />
              </div>
              <p className="text-sm font-medium text-th-heading truncate">{file.name}</p>
              <p className="text-[11px] text-th-dim mt-1">{(file.size / 1024).toFixed(0)} KB</p>
              <button
                onClick={() => { setFile(null); setPreview(''); }}
                className="mt-2 text-[11px] text-th-subtle hover:text-red-400 transition-colors"
              >
                重新选择
              </button>
            </div>
          ) : (
            <label className="cursor-pointer text-center">
              <ImageIcon className="w-8 h-8 text-th-line mx-auto mb-3" />
              <p className="text-sm text-th-subtle">点击上传图片</p>
              <p className="text-[11px] text-th-dim mt-1">支持 JPG、PNG、WEBP 格式</p>
              <p className="text-[10px] text-th-dim/50 mt-1">AI 视觉模型将分析图片中的画面和文字</p>
              <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            </label>
          )
        )}
      </div>

      <div className="flex items-center justify-between mt-3">
        <span className="text-[11px] text-th-dim">
          {loading ? (batchProgress || progress) : batchMode
            ? (batchFiles.length > 0 ? `已选择 ${batchFiles.length} 张图片` : '选择多张图片后开始审核')
            : (progress || (file ? '点击开始审核' : '上传图片后开始审核'))
          }
        </span>

        <button
          onClick={handleAudit}
          disabled={loading || (batchMode ? batchFiles.length === 0 : !file) || !brand}
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
              {batchMode && batchFiles.length > 1 ? `批量审核 (${batchFiles.length}张)` : '开始审核'}
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
    </div>
  );
}
