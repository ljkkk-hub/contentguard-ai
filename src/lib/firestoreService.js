/**
 * Firestore 共享知识库服务
 * 
 * 云端共享知识库：所有人上传的知识库都存在 Firestore 中，
 * 审核时本地 + 云端知识库一起参与匹配。
 */
import { db, isConfigured } from './firebase';
import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';

const COLLECTION_NAME = 'shared_knowledge';

/**
 * 获取所有共享知识库
 * @returns {Array} 知识库列表
 */
export async function getAllSharedKnowledge() {
  if (!isConfigured || !db) return [];

  try {
    const q = query(collection(db, COLLECTION_NAME), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({
      id: d.id,
      ...d.data(),
      _source: 'cloud', // 标记来源为云端
    }));
  } catch (e) {
    console.error('获取共享知识库失败', e);
    return [];
  }
}

/**
 * 添加共享知识库
 * @param {Object} entry - 知识库条目
 * @returns {string|null} 文档 ID
 */
export async function addSharedKnowledge(entry) {
  if (!isConfigured || !db) return null;

  try {
    const record = {
      name: entry.name || '未命名',
      content: entry.content || '',
      brand: entry.brand || 'all',
      platform: entry.platform || 'all',
      type: entry.type || 'other',
      keywords: entry.keywords || [],
      summary: entry.summary || '',
      fileSize: entry.fileSize || 0,
      fileType: entry.fileType || 'unknown',
      createdAt: serverTimestamp(),
    };

    const docRef = await addDoc(collection(db, COLLECTION_NAME), record);
    return docRef.id;
  } catch (e) {
    console.error('添加共享知识库失败', e);
    return null;
  }
}

/**
 * 删除共享知识库
 * @param {string} docId - Firestore 文档 ID
 */
export async function deleteSharedKnowledge(docId) {
  if (!isConfigured || !db) return;

  try {
    await deleteDoc(doc(db, COLLECTION_NAME, docId));
  } catch (e) {
    console.error('删除共享知识库失败', e);
  }
}

/**
 * 智能匹配共享知识库（类似 db.js 中的 matchKnowledge）
 * @param {string} text - 待审核文本
 * @param {Array<string>} platforms - 当前选择的平台
 * @param {string} brand - 当前选择的品牌
 * @returns {Array} 匹配的共享知识库条目
 */
export async function matchSharedKnowledge(text, platforms = [], brand = '') {
  const all = await getAllSharedKnowledge();
  const lowerText = text.toLowerCase();

  return all.filter(k => {
    // 品牌匹配
    if (brand && brand !== 'all') {
      const brandMatch = k.brand === brand || k.brand === 'all';
      if (!brandMatch) return false;
    }

    // 平台匹配
    const platformMatch = k.platform === 'all' || platforms.includes('all') || platforms.includes(k.platform);
    if (!platformMatch) return false;

    // 关键词匹配
    if (k.keywords && k.keywords.length > 0) {
      return k.keywords.some(kw => lowerText.includes(kw.toLowerCase()));
    }

    // 品牌名在文本中出现
    if (k.brand && k.brand !== 'all') {
      return lowerText.includes(k.brand.toLowerCase());
    }

    return false;
  });
}

/**
 * 检查 Firebase 是否已连接
 */
export function isFirebaseReady() {
  return isConfigured && db !== null;
}
