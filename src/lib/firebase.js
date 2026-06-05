/**
 * Firebase 配置和初始化
 * 
 * 使用步骤：
 * 1. 打开 https://console.firebase.google.com
 * 2. 创建项目（如 contentguard-ai）
 * 3. 添加 Web 应用，获取配置
 * 4. 在 Firestore Database 中创建数据库（测试模式）
 * 5. 把配置填到下方 FIREBASE_CONFIG
 */
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// ★★★ 把你的 Firebase 项目配置填在这里 ★★★
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBWtJbes7xQxrLPQsYhivZ91bNmrly49lg",
  authDomain: "contentguard-ai-jk.firebaseapp.com",
  projectId: "contentguard-ai-jk",
  storageBucket: "contentguard-ai-jk.firebasestorage.app",
  messagingSenderId: "288865220101",
  appId: "1:288865220101:web:6de369ca1d0bfb15100e6c",
};

// 检查是否已配置
const isConfigured = Object.values(FIREBASE_CONFIG).some(v => v.trim() !== '');

let app = null;
let db = null;

if (isConfigured) {
  try {
    app = initializeApp(FIREBASE_CONFIG);
    db = getFirestore(app);
  } catch (e) {
    console.error('Firebase 初始化失败', e);
  }
}

export { app, db, isConfigured };
