// 智谱 GLM API 调用封装

const PLATFORM_NAMES = {
  douyin: '抖音',
  kuaishou: '快手',
  xiaohongshu: '小红书',
  weishi: '视频号',
};

function formatPlatforms(platforms) {
  if (Array.isArray(platforms)) {
    if (platforms.includes('all')) return '抖音、快手、小红书、视频号';
    return platforms.map(p => PLATFORM_NAMES[p] || p).join('、');
  }
  if (platforms === 'all') return '抖音、快手、小红书、视频号';
  return PLATFORM_NAMES[platforms] || platforms;
}

const API_BASE = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

export async function callGLM({ messages, model = 'glm-4-flash', apiKey, stream = false }) {
  if (!apiKey) {
    throw new Error('请先在设置中配置 API Key');
  }

  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream,
      temperature: 0.3,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API 调用失败 (${response.status}): ${err}`);
  }

  if (stream) {
    return response;
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// 流式调用
export async function callGLMStream({ messages, model = 'glm-4-flash', apiKey, onChunk }) {
  const response = await callGLM({ messages, model, apiKey, stream: true });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onChunk(content);
        } catch {}
      }
    }
  }
}

// 文案审核 prompt（支持知识库上下文）
export function buildTextAuditPrompt(text, platforms = ['all'], knowledgeContext = '', correctionContext = '') {
  const platformDesc = formatPlatforms(platforms);
  const knowledgeSection = knowledgeContext
    ? `\n\n7. **项目知识库**：必须参考知识库中的甲方标准、利益点、违规点进行审核，知识库中标注的内容标准必须严格遵守`
    : '';
  const correctionSection = correctionContext
    ? `\n\n8. **用户纠错**：参考用户过往纠错记录，避免重复犯同类错误`
    : '';

  return [
    {
      role: 'system',
      content: `你是一个专业的内容审核助手。你的任务是分析用户提交的内容，从以下维度进行审核：

1. **平台红线**：检查内容是否违反${platformDesc}的平台规则（如诱导互动、私下引流、刷粉刷赞等）
2. **广告合规**：检查是否含有绝对化用语（最、第一、顶级等）、虚假宣传、夸大效果
3. **品牌风险**：识别内容中提到的品牌/产品，分析是否有品牌关联风险、不当关联、负面联想
4. **价值观风险**：检查是否含有拜金主义、歧视性内容、不良导向
5. **内容标注**：检查是否需要标注（AI生成/虚构演绎/营销推广/转载）
6. **舆情风险**：评估内容可能引发的负面舆论风险${knowledgeSection}${correctionSection}

请严格按照以下JSON格式输出审核结果（不要输出其他内容）：
{
  "score": 0-100的评分,
  "riskLevel": "must_fix" | "suggest_fix" | "pass",
  "riskLevelLabel": "必须修改" | "建议优化" | "通过",
  "brandDetected": "识别到的品牌名称，无则为空字符串",
  "brandRisk": "品牌相关风险描述，无风险则为空字符串",
  "issues": [
    {
      "category": "平台红线|广告合规|品牌风险|价值观风险|内容标注|舆情风险|项目知识库",
      "severity": "high" | "medium" | "low",
      "severityLabel": "必须修改" | "建议优化" | "轻微提醒",
      "description": "问题描述",
      "original": "原文中的相关内容",
      "suggestion": "修改建议",
      "platform": "具体哪个平台的规则（如适用）"
    }
  ],
  "summary": "一句话审核结论"
}`
    },
    {
      role: 'user',
      content: `${knowledgeContext}${correctionContext}\n\n请审核以下内容：\n\n${text}`
    }
  ];
}

// 视觉模型调用 — 传入 base64 图片数组
export async function callGLMVision({ images, prompt, apiKey, model = 'glm-4v-flash' }) {
  if (!apiKey) {
    throw new Error('请先在设置中配置 API Key');
  }

  // 构建多模态消息：图片在前 + 文字在后
  // 智谱 GLM-4V 需要完整的 data:image/xxx;base64,... data URL 格式
  const content = [
    ...images.map(img => ({
      type: 'image_url',
      image_url: { url: img }, // 保留 data:image/jpeg;base64,... 完整前缀
    })),
    { type: 'text', text: prompt },
  ];

  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content }],
      // GLM-4V 视觉模型不支持 temperature 和 max_tokens，去掉否则会 400
    }),
  });

  if (!response.ok) {
    let errMsg = `视觉 API 调用失败 (${response.status})`;
    try {
      const errData = await response.json();
      if (errData.error?.message) {
        errMsg = errData.error.message;
      } else if (errData.message) {
        errMsg = errData.message;
      } else {
        errMsg += `: ${JSON.stringify(errData)}`;
      }
    } catch {
      errMsg += `: ${await response.text()}`;
    }
    throw new Error(errMsg);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// 视频帧画面审核 prompt（给视觉模型用，支持知识库）
export function buildVideoFrameAuditPrompt(platforms = ['all'], knowledgeContext = '') {
  const platformDesc = formatPlatforms(platforms);
  const knowledgeSection = knowledgeContext
    ? `\n7. **项目知识库**：参考知识库中的品牌标准、利益点规范、违规点进行审核，知识库中的标准必须严格遵守`
    : '';

  return `你是一个专业的视频画面审核助手。请分析以下视频帧截图，检查画面中是否存在以下问题：

1. **画面合规**：是否有低俗、色情暗示、暴露、暴力、血腥、恐怖内容
2. **品牌露出**：画面中是否有品牌Logo/商标/产品包装的露出，如有请标注品牌名称
3. **文字违规**：画面中的文字/字幕是否含有违规内容（绝对化用语、虚假宣传等）
4. **价值观风险**：画面是否涉及不良导向（拜金、歧视、炫富等）
5. **内容标注**：画面内容是否需要标注（营销推广、AI生成等）
6. **平台合规**：画面是否符合${platformDesc}的内容规范${knowledgeSection}
${knowledgeContext}
请严格按照以下JSON格式输出（不要输出其他内容）：
{
  "frameScore": 0-100的评分,
  "issues": [
    {
      "category": "画面审核|品牌露出|文字违规|价值观风险|内容标注|平台合规|项目知识库",
      "severity": "high" | "medium" | "low",
      "severityLabel": "必须修改" | "建议优化" | "轻微提醒",
      "description": "画面问题描述",
      "original": "画面中看到的具体内容",
      "suggestion": "修改建议",
      "platform": "具体哪个平台的规则（如适用）"
    }
  ],
  "visualSummary": "一句话画面审核结论"
}`;
}

// 图片审核 prompt（给视觉模型用，支持知识库）
export function buildImageAuditPrompt(platforms = ['all'], knowledgeContext = '') {
  const platformDesc = formatPlatforms(platforms);
  const knowledgeSection = knowledgeContext
    ? `\n8. **项目知识库**：参考知识库中的品牌标准、利益点规范、违规点进行审核，知识库中的标准必须严格遵守`
    : '';

  return `你是一个专业的图片内容审核助手。请分析以下图片，检查是否存在以下问题：

1. **画面合规**：是否有低俗、色情暗示、暴露、暴力、血腥内容
2. **品牌风险**：图片中是否有品牌Logo/商标/产品露出，如有请标注品牌名称，分析是否有侵权或不当关联风险
3. **文字违规**：图片中的文字是否含有违规内容（绝对化用语、虚假宣传、敏感词等）
4. **价值观风险**：图片是否涉及不良导向（拜金、歧视、炫富等）
5. **内容标注**：图片是否需要标注（AI生成、营销推广等）
6. **舆情风险**：图片是否有可能引发负面舆论
7. **平台合规**：图片是否符合${platformDesc}的内容规范${knowledgeSection}
${knowledgeContext}
请严格按照以下JSON格式输出（不要输出其他内容）：
{
  "score": 0-100的评分,
  "riskLevel": "must_fix" | "suggest_fix" | "low" | "pass",
  "riskLevelLabel": "必须修改" | "建议优化" | "轻微提醒" | "通过",
  "brandDetected": "识别到的品牌名称，无则为空字符串",
  "brandRisk": "品牌相关风险描述，无风险则为空字符串",
  "issues": [
    {
      "category": "画面合规|品牌风险|文字违规|价值观风险|内容标注|舆情风险|平台合规|项目知识库",
      "severity": "high" | "medium" | "low",
      "severityLabel": "必须修改" | "建议优化" | "轻微提醒",
      "description": "问题描述",
      "original": "图片中看到的具体内容",
      "suggestion": "修改建议",
      "platform": "具体哪个平台的规则（如适用）"
    }
  ],
  "summary": "一句话审核结论"
}`;
}

// 视频帧审核 prompt（文本模式，已弃用，保留兼容）
export function buildFrameAuditPrompt(frameDescription, platforms = ['all']) {
  const platformDesc = formatPlatforms(platforms);

  return [
    {
      role: 'system',
      content: `你是一个专业的视频画面审核助手。分析视频画面内容，检查是否存在以下问题：

1. 画面中是否有低俗、色情暗示、暴露内容
2. 画面中是否有暴力、血腥、恐怖元素
3. 画面中是否含有未经授权的品牌Logo/商标露出
4. 画面中的文字是否有违规内容
5. 画面是否涉及未成年人不当场景
6. 画面是否有可能引发舆情的敏感元素

请按照以下JSON格式输出：
{
  "frameScore": 0-100,
  "frameIssues": [
    {
      "category": "画面审核",
      "severity": "high" | "medium" | "low",
      "severityLabel": "必须修改" | "建议优化" | "轻微提醒",
      "description": "画面问题描述",
      "suggestion": "修改建议"
    }
  ]
}`
    },
    {
      role: 'user',
      content: `请分析这个视频画面：${frameDescription}`
    }
  ];
}

// 一键优化文案 prompt（支持知识库防违规表达）
export function buildOptimizePrompt(originalText, issues, platforms = ['all'], knowledgeContext = '') {
  const platformDesc = formatPlatforms(platforms);

  const issueList = issues
    .filter(i => i.severity === 'high' || i.severity === 'medium')
    .map(i => `- [${i.category}] ${i.description}${i.original ? `（原文："${i.original}"）` : ''}`)
    .join('\n');

  const knowledgeSection = knowledgeContext
    ? `\n\n**特别说明**：知识库中可能包含该品牌/项目已验证的防违规表达方式（如"免费→🆓"、"黑钻→黑💎"、"福利→浮力"等），请优先使用知识库中的替换方案。`
    : '';

  return [
    {
      role: 'system',
      content: `你是一个专业的内容优化助手。你的任务是根据审核发现的问题，自动修改原文，使其符合${platformDesc}的平台规范。

优化规则：
1. **绝对化用语**（最、第一、顶级等）→ 用同义词或弱化表达替换，如"非常""很""不错"等
2. **诱导性词汇**（加我微信、免费领取、限时秒杀等）→ 用 emoji 或委婉表达替换，如"➕我""🎁领取"等，或完全删除
3. **夸大宣传**（月入百万、史上最好等）→ 用客观描述替换
4. **敏感词** → 用拼音、emoji、谐音、同义词等方式替换
5. **引流行为**（加微信、私聊等）→ 改为引导到主页或评论区
6. **广告法禁用词** → 用中性词替换
7. **防违规表达** → 优先使用行业内已验证的隐晦表达替换方案（如 emoji 替换、谐音替换等），保证内容流畅自然${knowledgeSection}

优化原则：
- 尽量保留原文的核心信息和风格
- 替换后的表达要自然流畅，不生硬
- 如果某个词确实必须删除，就直接删除
- 对轻微问题可以忽略，只处理 high 和 medium 级别的问题

请直接输出优化后的完整文案，不要添加任何解释、前缀或后缀。`
    },
    {
      role: 'user',
      content: `${knowledgeContext}\n\n原文：\n${originalText}\n\n发现的问题：\n${issueList || '（无具体问题，请根据常识优化）'}\n\n请直接输出优化后的文案：`}
  ];
}

// 按审核类型分组的模型选项
// 分类原则：
// - 文案(text)：纯文本模型，不需要视觉能力
// - 视频(video)：需要视频理解（Gemini原生）或视觉+文本（GLM抽帧）
// - 图片(image)：需要视觉/多模态能力
export const MODEL_OPTIONS_BY_TYPE = {
  // 文案审核：纯文本理解
  text: [
    { value: 'glm-4-flash', label: 'GLM-4-Flash', desc: '免费·快速', free: true, recommended: true },
    { value: 'glm-4.7-flash', label: 'GLM-4.7-Flash', desc: '免费·更强理解', free: true },
    { value: 'glm-5', label: 'GLM-5', desc: '¥7.2/M token·最强', free: false },
  ],
  // 视频审核：Gemini 原生视频理解 > GLM 抽帧方案
  video: [
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', desc: '免费·原生视频理解', free: true, recommended: true, gemini: true },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', desc: '免费·快速', free: true, gemini: true },
    { value: 'glm-4v-flash', label: 'GLM-4V-Flash', desc: '免费·抽帧+视觉', free: true, vision: true },
    { value: 'glm-4-flash', label: 'GLM-4-Flash', desc: '免费·仅文本分析', free: true, textOnly: true },
  ],
  // 图片审核：多模态视觉模型
  image: [
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', desc: '免费·多模态·推荐', free: true, recommended: true, gemini: true },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', desc: '免费·多模态', free: true, gemini: true },
    { value: 'glm-4v-flash', label: 'GLM-4V-Flash', desc: '免费·视觉模型', free: true, vision: true },
  ],
};

// 兼容旧代码
export const MODEL_OPTIONS = MODEL_OPTIONS_BY_TYPE.text;

/**
 * 获取当前审核类型推荐的默认模型
 * @param {'text'|'video'|'image'} type
 * @returns {string} model value
 */
export function getDefaultModel(type) {
  const options = MODEL_OPTIONS_BY_TYPE[type] || MODEL_OPTIONS_BY_TYPE.text;
  const recommended = options.find(o => o.recommended);
  return recommended ? recommended.value : options[0]?.value || 'glm-4-flash';
}
