// Google Gemini API 视频理解封装

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_UPLOAD_BASE = 'https://generativelanguage.googleapis.com/upload/v1beta';

// 支持的视频 MIME 类型
const VIDEO_MIME_TYPES = {
  mp4: 'video/mp4',
  mpeg: 'video/mpeg',
  mov: 'video/mov',
  avi: 'video/avi',
  flv: 'video/x-flv',
  mpg: 'video/mpg',
  webm: 'video/webm',
  wmv: 'video/wmv',
  '3gpp': 'video/3gpp',
};

/**
 * 获取视频 MIME 类型
 */
export function getVideoMimeType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return VIDEO_MIME_TYPES[ext] || 'video/mp4';
}

/**
 * 视频文件上传到 Gemini File API（大文件 >20MB 或长视频）
 * @returns {{ fileUri: string, displayName: string }}
 */
async function uploadVideoFile(file, apiKey, onProgress) {
  const mimeType = getVideoMimeType(file.name);
  const numBytes = file.size;

  // Step 1: 启动可恢复上传，获取 upload_url
  const startRes = await fetch(`${GEMINI_UPLOAD_BASE}/files`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(numBytes),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: file.name } }),
  });

  if (!startRes.ok) {
    const err = await startRes.text();
    throw new Error(`上传启动失败 (${startRes.status}): ${err}`);
  }

  const uploadUrl = startRes.headers.get('x-goog-upload-url');
  if (!uploadUrl) {
    throw new Error('未获取到上传 URL');
  }

  // Step 2: 上传视频二进制数据
  if (onProgress) onProgress('正在上传视频到 Gemini...');

  // 大文件上传可能较慢，使用 AbortController 设置 5 分钟超时
  const uploadController = new AbortController();
  const uploadTimeout = setTimeout(() => uploadController.abort(), 300000); // 5 分钟

  let uploadRes;
  try {
    uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Length': String(numBytes),
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize',
      },
      body: file,
      signal: uploadController.signal,
    });
  } finally {
    clearTimeout(uploadTimeout);
  }

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`视频上传失败 (${uploadRes.status}): ${err}`);
  }

  const fileInfo = await uploadRes.json();
  const fileUri = fileInfo.file?.uri;
  const displayName = fileInfo.file?.displayName || file.name;

  if (!fileUri) {
    // 如果上传成功但没拿到 uri，检查是否在 processing 状态
    if (fileInfo.file?.name) {
      // 用 file name 去 metadata 接口查
      const metaRes = await fetch(`${GEMINI_API_BASE}/${fileInfo.file.name}?key=${apiKey}`);
      if (metaRes.ok) {
        const metaData = await metaRes.json();
        if (metaData.file?.uri) {
          return { fileUri: metaData.file.uri, displayName };
        }
      }
    }
    throw new Error('未获取到 file_uri，上传可能未完成');
  }

  // 等待文件处理完成（ACTIVE 状态）
  if (onProgress) onProgress('Gemini 正在处理视频，请稍候...');
  let attempts = 0;
  while (attempts < 60) { // 最多等 2 分钟
    const checkRes = await fetch(`${fileUri}?key=${apiKey}`);
    if (checkRes.ok) {
      const checkData = await checkRes.json();
      if (checkData.state === 'ACTIVE') break;
      if (checkData.state === 'FAILED') {
        throw new Error('Gemini 视频处理失败');
      }
    }
    await new Promise(r => setTimeout(r, 2000));
    attempts++;
  }

  return { fileUri, displayName };
}

/**
 * 将文件转为 base64
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      // 去掉 data:xxx;base64, 前缀
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 调用 Gemini 视频理解 API
 * @param {Object} params
 * @param {File} params.file - 视频文件
 * @param {string} params.prompt - 审核提示词
 * @param {string} params.apiKey - Gemini API Key
 * @param {string} params.model - 模型名 (gemini-2.5-flash / gemini-2.0-flash / gemini-1.5-flash)
 * @param {Function} params.onProgress - 进度回调
 * @returns {string} AI 返回的文本
 */
export async function callGeminiVideo({ file, prompt, apiKey, model = 'gemini-2.5-flash', onProgress }) {
  if (!apiKey) {
    throw new Error('请先在设置中配置 Gemini API Key');
  }

  const mimeType = getVideoMimeType(file.name);
  const fileSizeMB = file.size / (1024 * 1024);

  let contents;

  if (fileSizeMB > 5) {
    // 大文件：先上传再引用
    if (onProgress) onProgress('正在上传视频文件...');
    const { fileUri } = await uploadVideoFile(file, apiKey, onProgress);
    contents = [{
      role: 'user',
      parts: [
        { file_data: { mime_type: mimeType, file_uri: fileUri } },
        { text: prompt },
      ],
    }];
  } else {
    // 小文件：直接 inline base64
    if (onProgress) onProgress('正在编码视频...');
    const base64Data = await fileToBase64(file);
    contents = [{
      role: 'user',
      parts: [
        { inline_data: { mime_type: mimeType, data: base64Data } },
        { text: prompt },
      ],
    }];
  }

  if (onProgress) onProgress('AI 正在审核视频...');

  // AI 审核请求超时：3 分钟
  const aiController = new AbortController();
  const aiTimeout = setTimeout(() => aiController.abort(), 180000);

  let response;
  try {
    response = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents }),
      signal: aiController.signal,
    });
  } catch (fetchErr) {
    clearTimeout(aiTimeout);
    if (fetchErr.name === 'AbortError') {
      throw new Error('Gemini AI 审核超时（3分钟），视频可能过大，建议压缩后重试或换 GLM 抽帧方案');
    }
    throw fetchErr;
  } finally {
    clearTimeout(aiTimeout);
  }

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API 调用失败 (${response.status}): ${err}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text;
}

/**
 * Gemini 视频审核 prompt
 */
export function buildGeminiVideoAuditPrompt(platforms = ['all'], knowledgeContext = '') {
  const platformList = Array.isArray(platforms)
    ? platforms.includes('all')
      ? '抖音、快手、小红书、视频号'
      : platforms.map(p => ({ douyin: '抖音', kuaishou: '快手', xiaohongshu: '小红书', weishi: '视频号' }[p] || p)).join('、')
    : '抖音、快手、小红书、视频号';

  const knowledgeSection = knowledgeContext
    ? `\n7. **项目知识库**：参考知识库中的品牌标准、利益点规范、违规点进行审核，知识库中的标准必须严格遵守`
    : '';

  return `你是一个专业的视频内容审核助手。请仔细观看这个视频，从以下维度进行全面审核：

1. **画面合规**：是否有低俗、色情暗示、暴露、暴力、血腥、恐怖内容
2. **品牌风险**：视频中是否有品牌Logo/商标/产品露出，如有请标注品牌名称，分析是否有侵权或不当关联风险
3. **文字违规**：视频中的字幕、标题、贴纸文字是否含有违规内容（绝对化用语、虚假宣传、敏感词、诱导互动等）
4. **口播台词**：视频中说话的内容是否有违规（夸大宣传、绝对化用语、私下引流、虚假承诺等）
5. **价值观风险**：视频是否涉及不良导向（拜金、歧视、炫富等）
6. **内容标注**：视频是否需要标注（AI生成、营销推广、虚构演绎等）
7. **平台合规**：视频是否符合${platformList}的内容规范（如：抖音禁止诱导关注/点赞/评论、小红书禁止导流私域等）${knowledgeSection}

请严格按照以下JSON格式输出（不要输出其他内容）：
{
  "score": 0-100的评分,
  "riskLevel": "must_fix" | "suggest_fix" | "low" | "pass",
  "riskLevelLabel": "必须修改" | "建议优化" | "轻微提醒" | "通过",
  "brandDetected": "识别到的品牌名称，无则为空字符串",
  "brandRisk": "品牌相关风险描述，无风险则为空字符串",
  "videoSummary": "一句话描述视频主要内容",
  "issues": [
    {
      "category": "画面合规|品牌风险|文字违规|口播台词|价值观风险|内容标注|平台合规|项目知识库",
      "severity": "high" | "medium" | "low",
      "severityLabel": "必须修改" | "建议优化" | "轻微提醒",
      "description": "问题描述",
      "original": "视频中的具体内容（如台词原文、字幕文字等）",
      "suggestion": "修改建议",
      "platform": "具体哪个平台的规则（如适用）",
      "timestamp": "问题出现的大致时间点（如：00:15、01:30等）"
    }
  ],
  "summary": "一句话审核结论"
}
${knowledgeContext}`;
}

/**
 * 调用 Gemini 图片分析 API
 * @param {Object} params
 * @param {string} params.imageBase64 - 去掉 data:image/xxx;base64, 前缀的纯 base64
 * @param {string} params.mimeType - 图片 MIME 类型
 * @param {string} params.prompt - 审核提示词
 * @param {string} params.apiKey - Gemini API Key
 * @param {string} params.model - 模型名
 * @returns {string} AI 返回的文本
 */
export async function callGeminiImage({ imageBase64, mimeType, prompt, apiKey, model = 'gemini-2.5-flash' }) {
  if (!apiKey) {
    throw new Error('请先在设置中配置 Gemini API Key');
  }

  const response = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
          { text: prompt },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API 调用失败 (${response.status}): ${err}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text;
}

// Gemini 模型选项
export const GEMINI_MODEL_OPTIONS = [
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', desc: '免费·最新·最强', free: true, recommended: true },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', desc: '免费·快速', free: true },
  { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', desc: '免费·经典', free: true },
];
