import { useState, useCallback } from 'react';
import { Video, Upload, AlertCircle, Eye, FileText, Mic, Sparkles, WifiOff } from 'lucide-react';
import { callGLM, callGLMVision, buildTextAuditPrompt, buildVideoFrameAuditPrompt } from '../lib/glmApi';
import { callGeminiVideo, buildGeminiVideoAuditPrompt } from '../lib/geminiApi';
import { matchKnowledge, buildKnowledgeContext, buildCorrectionContext } from '../lib/db';

// 判断是否为 Gemini 模型
function isGeminiModel(m) {
  return m?.startsWith('gemini');
}

// 带超时的 Promise 包装
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} 超时（${ms / 1000}秒），请检查网络或更换模型`)), ms)
    ),
  ]);
}

export default function VideoInput({ apiKey, model, platforms, brand, onResult, onAuditStart, onAuditEnd }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [progressDetail, setProgressDetail] = useState({ upload: 'pending', analyze: 'pending' });

  const geminiKey = localStorage.getItem('contentguard_gemini_key') || '';
  const useGemini = isGeminiModel(model);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  // ===== Gemini 路径：直接上传视频 =====
  const handleGeminiAudit = useCallback(async () => {
    if (!file) return;
    if (!brand) {
      setError('请先在上方的「品牌」栏选择品牌后再提交审核');
      return;
    }
    if (!geminiKey) {
      setError('请先在设置中配置 Gemini API Key');
      return;
    }

    setLoading(true);
    setError('');
    setProgressDetail({ upload: 'pending', analyze: 'pending' });
    onAuditStart?.();

    try {
      const videoInfo = `视频文件：${file.name}，大小：${(file.size / 1024 / 1024).toFixed(1)}MB`;

      // 匹配知识库（按品牌过滤）
      setProgress('正在匹配知识库...');
      const matchedKB = await matchKnowledge(videoInfo, platforms, brand);
      const knowledgeContext = buildKnowledgeContext(matchedKB);
      const prompt = buildGeminiVideoAuditPrompt(platforms, knowledgeContext);

      // 大文件需要更长超时：49MB 上传 + Gemini 处理可能需要 3-5 分钟
      const fileSizeMB = file.size / (1024 * 1024);
      const geminiTimeout = fileSizeMB > 20 ? 300000 : fileSizeMB > 5 ? 180000 : 60000; // 5min / 3min / 1min
      let response;
      try {
        response = await withTimeout(
          callGeminiVideo({
            file,
            prompt,
            apiKey: geminiKey,
            model,
            onProgress: (msg) => {
              setProgress(msg);
              if (msg.includes('审核')) {
                setProgressDetail(prev => ({ ...prev, upload: 'done', analyze: 'running' }));
              }
            },
          }),
          geminiTimeout,
          'Gemini 视频分析'
        );
      } catch (geminiErr) {
        // Gemini 失败 → 自动 fallback 到 GLM 抽帧方案
        setProgress(`Gemini 失败：${geminiErr.message}，正在自动切换 GLM 抽帧方案...`);
        return handleGLMAudit();
      }
      setProgressDetail({ upload: 'done', analyze: 'done' });

      // 解析结果
      let parsed;
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      } catch {
        parsed = null;
      }

      if (parsed) {
        const issues = (parsed.issues || []).map(i => ({ ...i, source: 'ai' }));
        let riskLevel = 'pass';
        let riskLevelLabel = '通过';
        if (issues.some(i => i.severity === 'high')) { riskLevel = 'must_fix'; riskLevelLabel = '必须修改'; }
        else if (issues.some(i => i.severity === 'medium')) { riskLevel = 'suggest_fix'; riskLevelLabel = '建议优化'; }
        else if (issues.some(i => i.severity === 'low')) { riskLevel = 'low'; riskLevelLabel = '轻微提醒'; }

        onResult({
          originalText: videoInfo,
          platforms,
          brand,
          score: parsed.score ?? 100,
          riskLevel: parsed.riskLevel || riskLevel,
          riskLevelLabel: parsed.riskLevelLabel || riskLevelLabel,
          brandDetected: parsed.brandDetected || '',
          brandRisk: parsed.brandRisk || '',
          issues,
          summary: parsed.summary || parsed.videoSummary || '审核完成',
          videoInfo,
          engine: 'gemini',
          usedModel: model,
          rawAIResponse: response,
        });
      } else {
        // JSON 解析失败，走兜底
        onResult({
          originalText: videoInfo,
          platforms,
          brand,
          score: 50,
          riskLevel: 'suggest_fix',
          riskLevelLabel: '建议优化',
          brandDetected: '',
          brandRisk: '',
          issues: [{
            category: '系统提示',
            severity: 'low',
            severityLabel: '轻微提醒',
            description: 'AI 返回格式异常，请重新审核',
            suggestion: '尝试切换其他模型重新审核',
          }],
          summary: 'AI 返回结果解析失败',
          videoInfo,
          engine: 'gemini',
          rawAIResponse: response,
        });
      }
    } catch (err) {
      let msg = err.message || '未知错误';
      if (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed to fetch')) {
        msg = `网络请求失败：${msg}。建议：1) 检查是否开了代理/VPN；2) 换 GLM-4V 模型（国内直连）；3) 刷新重试`;
      }
      setError(msg);
    } finally {
      setLoading(false);
      setProgress('');
      onAuditEnd?.();
    }
  }, [file, geminiKey, model, platforms, onResult, brand, onAuditStart, onAuditEnd]);

  // ===== GLM 路径：抽帧 + 视觉模型 =====
  const handleGLMAudit = useCallback(async () => {
    if (!file) return;
    if (!brand) {
      setError('请先在上方的「品牌」栏选择品牌后再提交审核');
      return;
    }

    setLoading(true);
    setError('');
    setProgressDetail({ upload: 'pending', analyze: 'pending' });
    onAuditStart?.();

    try {
      const videoInfo = `视频文件：${file.name}，大小：${(file.size / 1024 / 1024).toFixed(1)}MB`;

      // 提取帧 + 场景变化检测
      setProgress('正在提取视频帧...');
      setProgressDetail(prev => ({ ...prev, upload: 'running' }));
      const allFrames = await withTimeout(extractFramesBase64(file, 15, 3), 120000, '视频抽帧');
      const sceneFrames = await detectSceneChanges(allFrames);
      setProgressDetail(prev => ({ ...prev, upload: 'done', analyze: 'running' }));

      let visualResult = null;
      let visualIssues = [];
      let visualScore = 100;

      // 视觉模型分析帧画面
      if (sceneFrames.length > 0 && model !== 'glm-4-flash' && model !== 'glm-4.7-flash' && model !== 'glm-4.7') {
        setProgress('AI 正在分析画面...');
        try {
          const matchedKB = await matchKnowledge(videoInfo, platforms, brand);
          const knowledgeContext = buildKnowledgeContext(matchedKB);
          const prompt = buildVideoFrameAuditPrompt(platforms, knowledgeContext);
          const visionResponse = await withTimeout(
            callGLMVision({ images: sceneFrames.slice(0, 3), prompt, apiKey, model: 'glm-4v-flash' }),
            20000,
            'GLM-4V 画面分析'
          );
          const jsonMatch = visionResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            visualResult = JSON.parse(jsonMatch[0]);
            visualScore = visualResult.frameScore ?? 100;
            visualIssues = (visualResult.issues || []).map(i => ({
              ...i, source: 'ai', category: i.category || '画面审核',
            }));
          }
        } catch (e) {
          console.warn('视觉通道失败:', e);
        }
      }

      // 文本审核（基于视频信息 + 视觉模型摘要）
      setProgress('AI 正在审核文本内容...');
      const combinedText = [
        videoInfo,
        visualResult?.visualSummary ? `\n画面审核摘要：${visualResult.visualSummary}` : '',
      ].join('\n');

      const matchedKB = await matchKnowledge(combinedText || videoInfo, platforms, brand);
      const knowledgeContext = buildKnowledgeContext(matchedKB);
      const correctionContext = await buildCorrectionContext();
      const messages = buildTextAuditPrompt(combinedText, platforms, knowledgeContext, correctionContext);
      const textResult = await withTimeout(
        callGLM({ messages, model: 'glm-4-flash', apiKey }),
        20000,
        'GLM 文本审核'
      );

      let textParsed;
      try {
        const jsonMatch = textResult.match(/\{[\s\S]*\}/);
        textParsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      } catch { textParsed = null; }

      // 合并问题
      const allIssues = [
        ...visualIssues,
        ...(textParsed?.issues || []).map(i => ({ ...i, source: 'ai' })),
      ];
      const uniqueIssues = [];
      const seen = new Set();
      for (const issue of allIssues) {
        if (!seen.has(issue.description)) { seen.add(issue.description); uniqueIssues.push(issue); }
      }

      const textScore = textParsed?.score ?? 100;
      const finalScore = sceneFrames.length > 0
        ? Math.round(visualScore * 0.4 + textScore * 0.6)
        : textScore;

      let riskLevel = 'pass', riskLevelLabel = '通过';
      if (uniqueIssues.some(i => i.severity === 'high')) { riskLevel = 'must_fix'; riskLevelLabel = '必须修改'; }
      else if (uniqueIssues.some(i => i.severity === 'medium')) { riskLevel = 'suggest_fix'; riskLevelLabel = '建议优化'; }
      else if (uniqueIssues.some(i => i.severity === 'low')) { riskLevel = 'low'; riskLevelLabel = '轻微提醒'; }

      const summary = [visualResult?.visualSummary, textParsed?.summary].filter(Boolean).join('；') || '审核完成';

      onResult({
        originalText: combinedText,
        platforms,
        brand,
        score: finalScore,
        riskLevel,
        riskLevelLabel,
        brandDetected: textParsed?.brandDetected || visualResult?.brandDetected || '',
        brandRisk: textParsed?.brandRisk || visualResult?.brandRisk || '',
        issues: uniqueIssues,
        summary,
        videoInfo,
        sceneFrameCount: sceneFrames.length,
        engine: 'glm',
        usedModel: model,
        rawAIResponse: textResult,
      });
      setProgressDetail({ upload: 'done', analyze: 'done' });
    } catch (err) {
      let msg = err.message || '未知错误';
      if (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed to fetch')) {
        msg = `网络请求失败：${msg}。建议：1) 检查是否开了代理/VPN；2) 换 GLM-4V 模型（国内直连）；3) 刷新重试`;
      }
      setError(msg);
    } finally {
      setLoading(false);
      setProgress('');
      onAuditEnd?.();
    }
  }, [file, apiKey, model, platforms, onResult, brand, onAuditStart, onAuditEnd]);

  const handleAudit = useGemini ? handleGeminiAudit : handleGLMAudit;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3">
        <Video className="w-4 h-4 text-th-accent/70" />
        <h2 className="text-sm font-semibold text-th-heading">视频审核</h2>
        <span className="text-[10px] text-th-dim ml-auto px-1.5 py-0.5 rounded border border-th-line bg-th-base flex items-center gap-1">
          {useGemini ? (
            <><Sparkles className="w-3 h-3 text-blue-400" /> Gemini 视频理解</>
          ) : (
            <><Eye className="w-3 h-3 text-th-accent" /> 抽帧+视觉</>
          )}
        </span>
      </div>

      {/* Gemini Key 提示 */}
      {useGemini && !geminiKey && (
        <div className="mb-3 p-2.5 bg-amber-500/[0.04] border border-amber-500/10 rounded-xl flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-400/70 mt-0.5 shrink-0" />
          <div>
            <p className="text-[11px] text-amber-400/80">使用 Gemini 视频理解需要配置 Gemini API Key</p>
            <p className="text-[10px] text-amber-400/50 mt-0.5">点击右上角 ⚙️ 设置 → Gemini API Key</p>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-[160px] border border-dashed border-th-line rounded-xl flex flex-col items-center justify-center p-6 hover:border-th-accent/20 transition-colors bg-th-base/50">
        {file ? (
          <div className="text-center">
            <Video className="w-10 h-10 text-th-accent/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-th-heading">{file.name}</p>
            <p className="text-[11px] text-th-dim mt-1">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
            <button
              onClick={() => setFile(null)}
              className="mt-3 text-[11px] text-th-subtle hover:text-red-400 transition-colors"
            >
              重新选择
            </button>
          </div>
        ) : (
          <label className="cursor-pointer text-center">
            <Upload className="w-8 h-8 text-th-line mx-auto mb-3" />
            <p className="text-sm text-th-subtle">点击上传视频</p>
            <p className="text-[11px] text-th-dim mt-1">支持 MP4、MOV、AVI、WebM 等格式</p>
            <input type="file" accept="video/*" onChange={handleFileChange} className="hidden" />
          </label>
        )}
      </div>

      {/* 进度指示器 */}
      {loading && (
        <div className="mt-3 p-3 bg-th-base rounded-xl border border-th-line space-y-1.5">
          {useGemini ? (
            <>
              <div className="flex items-center gap-2">
                <ChannelStatus status={progressDetail.upload} />
                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-[11px] text-th-subtle">上传 & 处理视频</span>
              </div>
              <div className="flex items-center gap-2">
                <ChannelStatus status={progressDetail.analyze} />
                <Eye className="w-3.5 h-3.5 text-th-dim" />
                <span className="text-[11px] text-th-subtle">AI 全面审核</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <ChannelStatus status={progressDetail.upload} />
                <FileText className="w-3.5 h-3.5 text-th-dim" />
                <span className="text-[11px] text-th-subtle">提取视频帧</span>
              </div>
              <div className="flex items-center gap-2">
                <ChannelStatus status={progressDetail.analyze} />
                <Eye className="w-3.5 h-3.5 text-th-dim" />
                <span className="text-[11px] text-th-subtle">AI 分析画面+文字</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* 引擎说明 */}
      {!loading && file && (
        <div className="mt-3 p-2.5 bg-th-base/50 rounded-xl border border-th-line/50">
          {useGemini ? (
            <p className="text-[10px] text-th-dim leading-relaxed">
              🚀 <span className="text-blue-400/70">Gemini 视频理解</span>：直接上传完整视频，AI 自动处理画面+音频+字幕，无需前端抽帧，审核更全面更快速
            </p>
          ) : (
            <p className="text-[10px] text-th-dim leading-relaxed">
              ⚡ <span className="text-th-accent/70">GLM 抽帧方案</span>：前端抽帧后发给视觉模型分析画面，文字审核依赖 AI 语义理解（口播内容无法覆盖，建议切换 Gemini 获得更全面审核）
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mt-3">
        <span className="text-[11px] text-th-dim">
          {progress || (file ? '点击开始审核' : '上传视频后开始审核')}
        </span>

        <button
          onClick={handleAudit}
          disabled={loading || !file || !brand || (useGemini && !geminiKey)}
          className="px-5 py-2 bg-th-accent/10 hover:bg-th-accent/20 border border-th-accent/25 hover:border-th-accent/40 disabled:bg-th-panel disabled:border-th-line disabled:text-th-dim text-th-accent text-sm font-medium rounded-lg transition-all flex items-center gap-2 shadow-sm shadow-th-accent/5 disabled:shadow-none"
          title={!brand ? '请先选择品牌' : ''}
        >
          {loading ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-th-accent/30 border-t-th-accent rounded-full animate-spin" />
              审核中...
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-th-accent shadow-sm shadow-th-accent/50" />
              开始审核
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

// 通道状态指示器
function ChannelStatus({ status }) {
  if (status === 'done') return <span className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px] text-emerald-400">✓</span>;
  if (status === 'running') return <div className="w-4 h-4 rounded-full border-2 border-th-accent/30 border-t-th-accent animate-spin" />;
  if (status === 'error') return <span className="w-4 h-4 rounded-full bg-amber-500/20 flex items-center justify-center text-[10px] text-amber-400">!</span>;
  return <span className="w-4 h-4 rounded-full bg-th-line/30" />;
}

// ===== 抽帧工具函数（GLM 方案用）=====

function extractFramesBase64(file, maxFrames = 15, intervalSeconds = 3) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    const url = URL.createObjectURL(file);
    video.src = url;
    const frames = [];
    const timeout = setTimeout(() => { URL.revokeObjectURL(url); reject(new Error('视频加载超时')); }, 60000);

    video.onloadedmetadata = () => {
      clearTimeout(timeout);
      const duration = video.duration;
      const interval = Math.max(intervalSeconds, 1);
      const timePoints = [];
      for (let t = interval; t < duration; t += interval) {
        timePoints.push(Math.min(t, duration - 0.5));
        if (timePoints.length >= maxFrames) break;
      }
      if (timePoints.length === 0) { URL.revokeObjectURL(url); resolve([]); return; }

      let currentIndex = 0;
      const captureFrame = () => {
        if (currentIndex >= timePoints.length) { URL.revokeObjectURL(url); resolve(frames); return; }
        video.currentTime = timePoints[currentIndex];
      };

      video.onseeked = () => {
        try {
          const maxDim = 512;
          const scale = Math.min(maxDim / video.videoWidth, maxDim / video.videoHeight, 1);
          const w = Math.round(video.videoWidth * scale);
          const h = Math.round(video.videoHeight * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, w, h);
          frames.push({
            second: Math.round(video.currentTime),
            dataUrl: canvas.toDataURL('image/jpeg', 0.7),
            pixelData: ctx.getImageData(0, 0, w, h).data,
          });
          currentIndex++;
          captureFrame();
        } catch (e) { URL.revokeObjectURL(url); reject(e); }
      };
      captureFrame();
    };
    video.onerror = () => { clearTimeout(timeout); URL.revokeObjectURL(url); reject(new Error('视频加载失败')); };
  });
}

async function detectSceneChanges(frames) {
  if (!frames || frames.length <= 2) return frames?.map(f => f.dataUrl) || [];
  const THRESHOLD = 0.15;
  const significantFrames = [frames[0]];
  for (let i = 1; i < frames.length; i++) {
    if (!frames[i].pixelData || !frames[i - 1].pixelData) { significantFrames.push(frames[i]); continue; }
    const diff = computeFrameDifference(frames[i - 1].pixelData, frames[i].pixelData);
    if (diff > THRESHOLD) significantFrames.push(frames[i]);
  }
  if (significantFrames.length < 3 && frames.length >= 3) {
    const step = Math.floor(frames.length / 3);
    return [frames[0], frames[step], frames[step * 2]].map(f => f.dataUrl);
  }
  return significantFrames.map(f => f.dataUrl);
}

function computeFrameDifference(data1, data2) {
  const len = Math.min(data1.length, data2.length);
  let diffPixels = 0;
  const sampleStep = 16;
  for (let i = 0; i < len; i += sampleStep) {
    const dist = Math.abs(data1[i] - data2[i]) + Math.abs(data1[i + 1] - data2[i + 1]) + Math.abs(data1[i + 2] - data2[i + 2]);
    if (dist > 100) diffPixels++;
  }
  return diffPixels / (len / sampleStep);
}
