import { useState, useCallback } from 'react';

const STORAGE_KEY = 'contentguard_api_key';
const MODEL_KEY = 'contentguard_model';
const PLATFORMS_KEY = 'contentguard_platforms';

const ALL_PLATFORMS = ['douyin', 'kuaishou', 'xiaohongshu', 'weishi'];

export function useSettings() {
  const [apiKey, setApiKeyState] = useState(() => localStorage.getItem(STORAGE_KEY) || '');
  const [model, setModelState] = useState(() => localStorage.getItem(MODEL_KEY) || 'glm-4-flash');
  const [platforms, setPlatformsState] = useState(() => {
    try {
      const saved = localStorage.getItem(PLATFORMS_KEY);
      return saved ? JSON.parse(saved) : ['all'];
    } catch {
      return ['all'];
    }
  });

  const setApiKey = useCallback((key) => {
    setApiKeyState(key);
    localStorage.setItem(STORAGE_KEY, key);
  }, []);

  const setModel = useCallback((m) => {
    setModelState(m);
    localStorage.setItem(MODEL_KEY, m);
  }, []);

  const setPlatforms = useCallback((next) => {
    let result = next;
    // 如果选中了所有四个平台，自动变成 ['all']
    const selectedNonAll = next.filter(p => p !== 'all');
    if (selectedNonAll.length === ALL_PLATFORMS.length) {
      result = ['all'];
    }
    setPlatformsState(result);
    localStorage.setItem(PLATFORMS_KEY, JSON.stringify(result));
  }, []);

  const togglePlatform = useCallback((p) => {
    setPlatformsState(prev => {
      let next;
      if (p === 'all') {
        // 点全平台 → 直接变成单选 all
        next = ['all'];
      } else if (prev.includes('all')) {
        // 之前是全平台，现在点某个具体平台 → 去掉 all，加上这个
        next = [p];
      } else if (prev.includes(p)) {
        // 取消选中
        next = prev.filter(x => x !== p);
        // 如果全取消了，默认回 all
        if (next.length === 0) next = ['all'];
      } else {
        // 新增选中
        next = [...prev, p];
      }
      // 如果选中了所有四个平台，自动变成 ['all']
      const selectedNonAll = next.filter(x => x !== 'all');
      if (selectedNonAll.length === ALL_PLATFORMS.length) {
        next = ['all'];
      }
      localStorage.setItem(PLATFORMS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { apiKey, model, platforms, setApiKey, setModel, setPlatforms, togglePlatform };
}
