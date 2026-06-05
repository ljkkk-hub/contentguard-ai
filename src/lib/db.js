/**
 * IndexedDB 存储层 — 知识库 + 纠错记录
 * 使用 idb 库封装
 */
import { openDB } from 'idb';
import { getAllSharedKnowledge, matchSharedKnowledge } from './firestoreService';

const DB_NAME = 'ContentGuardDB';
const DB_VERSION = 2;

const STORES = {
  KNOWLEDGE: 'knowledge',       // 知识库文件
  CORRECTIONS: 'corrections',   // 纠错记录
  BRANDS: 'brands',             // 自定义品牌
};

/**
 * 初始化数据库
 */
async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // 知识库 store
      if (!db.objectStoreNames.contains(STORES.KNOWLEDGE)) {
        const knowledgeStore = db.createObjectStore(STORES.KNOWLEDGE, {
          keyPath: 'id',
          autoIncrement: true,
        });
        knowledgeStore.createIndex('brand', 'brand', { unique: false });
        knowledgeStore.createIndex('platform', 'platform', { unique: false });
        knowledgeStore.createIndex('type', 'type', { unique: false }); // 'brief' | 'correction' | 'rule'
        knowledgeStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // 纠错记录 store
      if (!db.objectStoreNames.contains(STORES.CORRECTIONS)) {
        const correctionStore = db.createObjectStore(STORES.CORRECTIONS, {
          keyPath: 'id',
          autoIncrement: true,
        });
        correctionStore.createIndex('auditId', 'auditId', { unique: false });
        correctionStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // 自定义品牌 store
      if (!db.objectStoreNames.contains(STORES.BRANDS)) {
        const brandStore = db.createObjectStore(STORES.BRANDS, {
          keyPath: 'id',
          autoIncrement: true,
        });
        brandStore.createIndex('name', 'name', { unique: true });
        brandStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    },
  });
}

// ==================== 知识库操作 ====================

/**
 * 添加知识库文件
 * @param {Object} entry - { name, content, brand, platform, type, keywords, summary, fileSize, fileType }
 * @returns {number} id
 */
export async function addKnowledge(entry) {
  const db = await getDB();
  const record = {
    ...entry,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const id = await db.add(STORES.KNOWLEDGE, record);
  return id;
}

/**
 * 获取所有知识库文件
 * @returns {Array}
 */
export async function getAllKnowledge() {
  const db = await getDB();
  return db.getAll(STORES.KNOWLEDGE);
}

/**
 * 获取单个知识库文件
 * @param {number} id
 * @returns {Object}
 */
export async function getKnowledge(id) {
  const db = await getDB();
  return db.get(STORES.KNOWLEDGE, id);
}

/**
 * 更新知识库文件
 * @param {Object} entry - 必须包含 id
 */
export async function updateKnowledge(entry) {
  const db = await getDB();
  entry.updatedAt = Date.now();
  await db.put(STORES.KNOWLEDGE, entry);
}

/**
 * 删除知识库文件
 * @param {number} id
 */
export async function deleteKnowledge(id) {
  const db = await getDB();
  await db.delete(STORES.KNOWLEDGE, id);
}

/**
 * 按品牌+平台检索知识库
 * @param {string} brand - 品牌名
 * @param {string} platform - 平台名
 * @returns {Array}
 */
export async function getKnowledgeByBrandPlatform(brand, platform) {
  const db = await getDB();
  const all = await db.getAll(STORES.KNOWLEDGE);
  return all.filter(k => {
    const brandMatch = !brand || k.brand === brand || k.brand === 'all';
    const platformMatch = !platform || k.platform === platform || k.platform === 'all';
    return brandMatch && platformMatch;
  });
}

/**
 * 智能匹配知识库 — 根据文本内容的关键词匹配相关知识库
 * 对每个知识库的 keywords 和 brand 字段与文本做匹配
 * @param {string} text - 待审核文本
 * @param {Array<string>} platforms - 当前选择的平台
 * @param {string} brand - 当前选择的品牌（强制匹配，优先返回该品牌知识库）
 * @returns {Array} 匹配的知识库条目
 */
export async function matchKnowledge(text, platforms = [], brand = '') {
  const db = await getDB();
  const all = await db.getAll(STORES.KNOWLEDGE);
  const lowerText = text.toLowerCase();

  // 本地匹配
  const localMatches = all.filter(k => {
    // 品牌匹配：如果指定了品牌，优先匹配该品牌或全品牌的知识库
    if (brand && brand !== 'all') {
      const brandMatch = k.brand === brand || k.brand === 'all';
      if (!brandMatch) return false;
    }

    // 平台匹配
    const platformMatch = k.platform === 'all' || platforms.includes('all') || platforms.includes(k.platform);
    if (!platformMatch) return false;

    // 关键词匹配：知识库的 keywords 中任一出现在文本中
    if (k.keywords && k.keywords.length > 0) {
      return k.keywords.some(kw => lowerText.includes(kw.toLowerCase()));
    }

    // 品牌名在文本中出现
    if (k.brand && k.brand !== 'all') {
      return lowerText.includes(k.brand.toLowerCase());
    }

    // 没有关键词和品牌限制的，不自动匹配
    return false;
  });

  // 云端匹配
  let cloudMatches = [];
  try {
    cloudMatches = await matchSharedKnowledge(text, platforms, brand);
  } catch (e) {
    console.warn('云端知识库匹配失败，仅使用本地', e);
  }

  // 合并去重（按 name + brand 去重）
  const seen = new Set();
  const merged = [];
  for (const item of [...localMatches, ...cloudMatches]) {
    const key = `${item.name}|${item.brand}|${item._source || 'local'}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }

  return merged;
}

/**
 * 构建知识库上下文 — 将匹配的知识库内容拼接成 prompt 片段
 * @param {Array} matchedKnowledge - matchKnowledge 返回的结果
 * @returns {string} prompt 片段
 */
export function buildKnowledgeContext(matchedKnowledge) {
  if (!matchedKnowledge || matchedKnowledge.length === 0) return '';

  const sections = matchedKnowledge.map((k, i) => {
    const header = `【知识库${i + 1}】${k.name}${k.brand ? ` (品牌: ${k.brand})` : ''}${k.platform ? ` (平台: ${k.platform})` : ''}`;
    const content = k.content || '';
    const keywords = k.keywords?.length > 0 ? `\n关键词: ${k.keywords.join('、')}` : '';
    return `${header}${keywords}\n${content}`;
  });

  return `\n\n=== 项目知识库（审核时必须参考以下内容） ===\n${sections.join('\n\n---\n\n')}\n=== 知识库结束 ===\n`;
}

// ==================== 纠错记录操作 ====================

/**
 * 添加纠错记录
 * @param {Object} entry - { auditId, issueIndex, originalIssue, correction, reason }
 * @returns {number} id
 */
export async function addCorrection(entry) {
  const db = await getDB();
  const record = {
    ...entry,
    createdAt: Date.now(),
  };
  const id = await db.add(STORES.CORRECTIONS, record);

  // 同时存入知识库作为纠错类型
  await addKnowledge({
    name: `纠错: ${entry.correction?.slice(0, 30) || '审核纠错'}...`,
    content: `原文判定: ${entry.originalIssue}\n正确判定: ${entry.correction}\n原因: ${entry.reason || '用户标记'}`,
    brand: entry.brand || 'all',
    platform: entry.platform || 'all',
    type: 'correction',
    keywords: entry.keywords || [],
    summary: entry.correction,
    fileSize: 0,
    fileType: 'correction',
  });

  return id;
}

/**
 * 获取所有纠错记录
 * @returns {Array}
 */
export async function getAllCorrections() {
  const db = await getDB();
  return db.getAll(STORES.CORRECTIONS);
}

/**
 * 构建纠错上下文 — 将纠错记录拼接成 prompt 片段
 * @returns {string} prompt 片段
 */
export async function buildCorrectionContext() {
  const corrections = await getAllCorrections();
  if (!corrections || corrections.length === 0) return '';

  const items = corrections.map((c, i) => {
    return `${i + 1}. 原判定: ${c.originalIssue} → 应为: ${c.correction}${c.reason ? ` (原因: ${c.reason})` : ''}`;
  });

  return `\n\n=== 用户纠错记录（请学习并避免重复错误） ===\n${items.join('\n')}\n=== 纠错记录结束 ===\n`;
}

// ==================== 自定义品牌操作 ====================

/**
 * 添加自定义品牌
 * @param {string} name - 品牌名称
 * @returns {number} id
 */
export async function addBrand(name) {
  const db = await getDB();
  // 检查是否已存在
  const existing = await db.getFromIndex(STORES.BRANDS, 'name', name);
  if (existing) return existing.id;
  const record = { name, createdAt: Date.now() };
  const id = await db.add(STORES.BRANDS, record);
  return id;
}

/**
 * 获取所有自定义品牌
 * @returns {Array} [{ id, name, createdAt }]
 */
export async function getAllBrands() {
  const db = await getDB();
  return db.getAll(STORES.BRANDS);
}

/**
 * 删除自定义品牌
 * @param {number} id
 */
export async function deleteBrand(id) {
  const db = await getDB();
  await db.delete(STORES.BRANDS, id);
}

/**
 * 获取所有品牌选项（自定义 + 知识库中出现的品牌，去重）
 * @returns {Array<string>} 品牌名列表
 */
export async function getBrandOptions() {
  const db = await getDB();
  const customBrands = await db.getAll(STORES.BRANDS);
  const allKnowledge = await db.getAll(STORES.KNOWLEDGE);

  const brandSet = new Set();
  customBrands.forEach(b => brandSet.add(b.name));
  allKnowledge.forEach(k => {
    if (k.brand && k.brand !== 'all') brandSet.add(k.brand);
  });

  return [...brandSet].sort();
}
