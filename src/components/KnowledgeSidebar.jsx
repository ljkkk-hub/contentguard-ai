import { useState, useEffect, useRef } from 'react';
import { BookOpen, Upload, Trash2, Tag, FileText, Search, ChevronDown, ChevronRight, Edit3, X, Check, Sparkles, Loader2, Plus, AlertTriangle, Cloud, CloudOff, RefreshCw, Globe, HardDrive } from 'lucide-react';
import { getAllKnowledge, addKnowledge, deleteKnowledge, updateKnowledge, addBrand, getAllBrands, deleteBrand, getBrandOptions } from '../lib/db';
import { parseFile } from '../lib/fileParser';
import { callGLM } from '../lib/glmApi';
import { getAllSharedKnowledge, addSharedKnowledge, deleteSharedKnowledge as deleteCloudKnowledge, isFirebaseReady } from '../lib/firestoreService';

const PLATFORM_OPTIONS = ['抖音', '快手', '小红书', '视频号', 'all'];
const TYPE_OPTIONS = [
  { value: 'brief', label: '甲方Brief' },
  { value: 'rule', label: '审核规则' },
  { value: 'correction', label: '纠错文档' },
  { value: 'expression', label: '防违规表达' },
  { value: 'other', label: '其他' },
];

// 删除确认弹窗组件
function DeleteConfirmModal({ title, message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-th-surface border border-th-line rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <h3 className="text-sm font-medium text-th-body">{title}</h3>
        </div>
        <p className="text-xs text-th-subtle mb-5 leading-relaxed">{message}</p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2 text-xs rounded-lg border border-th-line text-th-subtle hover:bg-th-base transition-colors"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2 text-xs rounded-lg bg-red-500/80 text-white hover:bg-red-500 transition-colors"
          >
            确认删除
          </button>
        </div>
      </div>
    </div>
  );
}

export default function KnowledgeSidebar({ apiKey, onKnowledgeChange }) {
  const [knowledge, setKnowledge] = useState([]);
  const [sharedKnowledge, setSharedKnowledge] = useState([]); // 云端共享知识库
  const [firebaseConnected, setFirebaseConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [brands, setBrands] = useState([]);           // 自定义品牌列表
  const [brandOptions, setBrandOptions] = useState([]); // 所有可选品牌（含知识库中出现的）
  const [expanded, setExpanded] = useState(true);
  const [expandedBrands, setExpandedBrands] = useState({}); // { [brand]: boolean }
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editBrand, setEditBrand] = useState('');
  const [editPlatform, setEditPlatform] = useState('');
  const [showBrandManager, setShowBrandManager] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  const fileInputRef = useRef(null);

  // 删除确认状态
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { type: 'knowledge'|'brand', id, name, step: 1|2 }

  // 上传表单状态 — 品牌改为自定义输入
  const [uploadForm, setUploadForm] = useState({
    brand: '',
    platform: '',
    type: 'brief',
    file: null,
  });

  // 加载知识库和品牌
  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [allKB, allBrands, options] = await Promise.all([
      getAllKnowledge(),
      getAllBrands(),
      getBrandOptions(),
    ]);
    setKnowledge(allKB);
    setBrands(allBrands);
    setBrandOptions(options);

    // 加载云端共享知识库
    const fbReady = isFirebaseReady();
    setFirebaseConnected(fbReady);
    if (fbReady) {
      try {
        const shared = await getAllSharedKnowledge();
        setSharedKnowledge(shared);
      } catch (e) {
        console.warn('加载共享知识库失败', e);
      }
    }

    onKnowledgeChange?.(allKB);
  }

  // 手动刷新云端知识库
  async function refreshShared() {
    if (!isFirebaseReady()) return;
    setSyncing(true);
    try {
      const shared = await getAllSharedKnowledge();
      setSharedKnowledge(shared);
    } catch (e) {
      console.warn('刷新共享知识库失败', e);
    }
    setSyncing(false);
  }

  // 上传并解析文件
  async function handleUpload() {
    if (!uploadForm.file) return;
    if (!apiKey) {
      alert('请先配置 API Key，AI 需要提取知识库关键词');
      return;
    }

    setUploading(true);
    try {
      // 1. 解析文件内容
      const { text } = await parseFile(uploadForm.file);
      if (!text || text.length < 10) {
        alert('文件内容为空或过短，请检查文件');
        setUploading(false);
        return;
      }

      // 2. AI 提取关键词和摘要
      const extractPrompt = `请分析以下文档内容，提取关键信息：

1. 提取5-10个关键词（用于后续检索匹配，请提取品牌名、产品名、核心权益、项目名等关键实体）
2. 用1-2句话概括文档内容

请严格按照以下JSON格式输出：
{
  "keywords": ["关键词1", "关键词2", ...],
  "summary": "一句话概括"
}

文档内容：
${text.slice(0, 3000)}`;

      let keywords = [uploadForm.brand, uploadForm.file.name.replace(/\.[^.]+$/, '')];
      let summary = '';

      try {
        const aiResult = await callGLM({
          prompt: extractPrompt,
          apiKey,
          model: 'glm-4-flash',
        });
        const jsonMatch = aiResult.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.keywords) keywords = [...new Set([...keywords, ...parsed.keywords])].filter(Boolean);
          if (parsed.summary) summary = parsed.summary;
        }
      } catch (e) {
        console.warn('AI关键词提取失败，使用默认关键词', e);
      }

      // 3. 自动保存新品牌（如果用户输入了自定义品牌）
      const brandValue = uploadForm.brand || 'all';
      if (brandValue !== 'all' && brandValue.trim()) {
        try {
          await addBrand(brandValue.trim());
        } catch (e) {
          // 品牌可能已存在，忽略
        }
      }

      // 4. 存入 IndexedDB
      await addKnowledge({
        name: uploadForm.file.name,
        content: text,
        brand: brandValue,
        platform: uploadForm.platform || 'all',
        type: uploadForm.type,
        keywords,
        summary,
        fileSize: uploadForm.file.size,
        fileType: uploadForm.file.name.split('.').pop().toLowerCase(),
      });

      // 5. 同步到云端共享知识库（如果已连接）
      if (isFirebaseReady()) {
        try {
          await addSharedKnowledge({
            name: uploadForm.file.name,
            content: text,
            brand: brandValue,
            platform: uploadForm.platform || 'all',
            type: uploadForm.type,
            keywords,
            summary,
            fileSize: uploadForm.file.size,
            fileType: uploadForm.file.name.split('.').pop().toLowerCase(),
          });
        } catch (e) {
          console.warn('同步到云端失败', e);
        }
      }

      // 6. 刷新列表
      await loadData();
      setShowUpload(false);
      setUploadForm({ brand: '', platform: '', type: 'brief', file: null });
    } catch (e) {
      console.error('上传失败', e);
      alert(`上传失败: ${e.message}`);
    }
    setUploading(false);
  }

  // 删除知识库文件 — 两层确认
  function handleDeleteKnowledge(id, name) {
    setDeleteConfirm({ type: 'knowledge', id, name, step: 1 });
  }

  async function confirmDeleteKnowledge() {
    if (!deleteConfirm || deleteConfirm.type !== 'knowledge') return;

    if (deleteConfirm.step === 1) {
      // 第一层确认 → 进入第二层
      setDeleteConfirm({ ...deleteConfirm, step: 2 });
      return;
    }

    // 第二层确认 → 真正删除
    await deleteKnowledge(deleteConfirm.id);
    setDeleteConfirm(null);
    await loadData();
  }

  // 删除品牌 — 两层确认
  function handleDeleteBrand(id, name) {
    setDeleteConfirm({ type: 'brand', id, name, step: 1 });
  }

  async function confirmDeleteBrand() {
    if (!deleteConfirm || deleteConfirm.type !== 'brand') return;

    if (deleteConfirm.step === 1) {
      setDeleteConfirm({ ...deleteConfirm, step: 2 });
      return;
    }

    await deleteBrand(deleteConfirm.id);
    setDeleteConfirm(null);
    await loadData();
  }

  // 添加自定义品牌
  async function handleAddBrand() {
    const name = newBrandName.trim();
    if (!name) return;
    try {
      await addBrand(name);
      setNewBrandName('');
      await loadData();
    } catch (e) {
      // 品牌可能已存在
      console.warn('品牌添加失败', e);
    }
  }

  // 更新标签
  async function handleSaveEdit(item) {
    // 如果改了品牌且不是已有品牌，自动添加
    if (editBrand && editBrand !== 'all' && !brandOptions.includes(editBrand)) {
      try { await addBrand(editBrand); } catch (e) {}
    }
    await updateKnowledge({ ...item, brand: editBrand, platform: editPlatform });
    setEditingId(null);
    await loadData();
  }

  // 搜索过滤
  const filtered = knowledge.filter(k => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return k.name?.toLowerCase().includes(q)
      || k.brand?.toLowerCase().includes(q)
      || k.keywords?.some(kw => kw.toLowerCase().includes(q));
  });

  // 按品牌分组（本地）
  const grouped = {};
  filtered.forEach(k => {
    const brand = k.brand || '未分类';
    if (!grouped[brand]) grouped[brand] = [];
    grouped[brand].push(k);
  });

  // 云端知识库也有只存在于云端的品牌，补充到 grouped
  const filteredShared = sharedKnowledge.filter(k => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return k.name?.toLowerCase().includes(q)
      || k.brand?.toLowerCase().includes(q)
      || k.keywords?.some(kw => kw.toLowerCase().includes(q));
  });

  // 收集云端品牌分组中本地没有的
  const cloudGrouped = {};
  filteredShared.forEach(k => {
    const brand = k.brand || '未分类';
    if (!cloudGrouped[brand]) cloudGrouped[brand] = [];
    cloudGrouped[brand].push(k);
    // 确保本地 grouped 也有这个品牌 key（即使本地没有条目）
    if (!grouped[brand]) grouped[brand] = [];
  });

  const typeLabel = (type) => TYPE_OPTIONS.find(t => t.value === type)?.label || type;

  return (
    <div className="flex flex-col h-full bg-th-card border-r border-th-line">
      {/* 删除确认弹窗 */}
      {deleteConfirm && (
        deleteConfirm.step === 1 ? (
          <DeleteConfirmModal
            title={`确认删除${deleteConfirm.type === 'brand' ? '品牌' : '文件'}？`}
            message={
              deleteConfirm.type === 'brand'
                ? `即将删除品牌「${deleteConfirm.name}」，该品牌下的知识库文件不会被删除（会变为"未分类"）。`
                : `即将删除知识库文件「${deleteConfirm.name}」，删除后无法恢复。`
            }
            onConfirm={deleteConfirm.type === 'brand' ? confirmDeleteBrand : confirmDeleteKnowledge}
            onCancel={() => setDeleteConfirm(null)}
          />
        ) : (
          <DeleteConfirmModal
            title="⚠️ 二次确认"
            message={
              deleteConfirm.type === 'brand'
                ? `这是最后确认！品牌「${deleteConfirm.name}」将被永久删除，确定吗？`
                : `这是最后确认！文件「${deleteConfirm.name}」将被永久删除，无法恢复，确定吗？`
            }
            onConfirm={deleteConfirm.type === 'brand' ? confirmDeleteBrand : confirmDeleteKnowledge}
            onCancel={() => setDeleteConfirm(null)}
          />
        )
      )}

      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-th-line">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-th-body font-medium text-sm hover:text-th-accent transition-colors"
        >
          <BookOpen className="w-4 h-4" />
          项目知识库
          <span className="text-[10px] text-th-dim bg-th-base px-1.5 py-0.5 rounded-full">
            {knowledge.length + sharedKnowledge.length}
          </span>
        </button>
        <div className="flex items-center gap-1">
          {/* Firebase 状态指示 */}
          {firebaseConnected ? (
            <button
              onClick={refreshShared}
              disabled={syncing}
              className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-400/5 transition-colors"
              title="Firebase 已连接，点击刷新共享知识库"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            </button>
          ) : (
            <div className="p-1.5 rounded-lg text-th-dim" title="Firebase 未连接，共享知识库不可用">
              <CloudOff className="w-3.5 h-3.5" />
            </div>
          )}
          <button
            onClick={() => setShowBrandManager(!showBrandManager)}
            className={`p-1.5 rounded-lg transition-colors ${showBrandManager ? 'bg-th-accent/10 text-th-accent' : 'text-th-subtle hover:text-th-accent hover:bg-th-base'}`}
            title="品牌管理"
          >
            <Tag className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="p-1.5 rounded-lg hover:bg-th-base text-th-subtle hover:text-th-accent transition-colors"
            title="上传知识库"
          >
            <Upload className="w-4 h-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="flex-1 overflow-y-auto">
          {/* 搜索 */}
          <div className="p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-th-dim" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="搜索知识库..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-th-base border border-th-line rounded-lg text-th-body placeholder:text-th-dim focus:outline-none focus:border-th-accent/50"
              />
            </div>
          </div>

          {/* 品牌管理区 */}
          {showBrandManager && (
            <div className="mx-2 mb-2 p-3 bg-th-base rounded-xl border border-th-accent/15 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-th-accent flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5" />
                  品牌管理
                </span>
                <button onClick={() => setShowBrandManager(false)} className="text-th-dim hover:text-th-body">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* 添加新品牌 */}
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newBrandName}
                  onChange={e => setNewBrandName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddBrand()}
                  placeholder="输入品牌名称..."
                  className="flex-1 px-2.5 py-1.5 text-xs bg-th-card border border-th-line rounded-lg text-th-body placeholder:text-th-dim focus:outline-none focus:border-th-accent/50"
                />
                <button
                  onClick={handleAddBrand}
                  disabled={!newBrandName.trim()}
                  className="px-2.5 py-1.5 text-xs bg-th-accent/20 text-th-accent rounded-lg hover:bg-th-accent/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  添加
                </button>
              </div>

              {/* 品牌列表 */}
              {brands.length === 0 ? (
                <p className="text-[10px] text-th-dim text-center py-2">暂无自定义品牌，请在上方添加</p>
              ) : (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {brands.map(b => (
                    <div key={b.id} className="flex items-center justify-between px-2.5 py-1.5 bg-th-card rounded-lg group border border-transparent hover:border-th-line/50">
                      <span className="text-xs text-th-body">{b.name}</span>
                      <button
                        onClick={() => handleDeleteBrand(b.id, b.name)}
                        className="p-1 rounded text-th-dim hover:text-red-400 hover:bg-red-500/5 opacity-0 group-hover:opacity-100 transition-all"
                        title="删除品牌"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 上传区域 */}
          {showUpload && (
            <div className="mx-2 mb-2 p-3 bg-th-base rounded-xl border border-th-accent/20 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-th-accent flex items-center gap-1">
                  <Upload className="w-3.5 h-3.5" />
                  上传知识库
                </span>
                <button onClick={() => setShowUpload(false)} className="text-th-dim hover:text-th-body">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* 文件选择 */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.doc,.txt,.md,.csv"
                onChange={e => setUploadForm(f => ({ ...f, file: e.target.files[0] }))}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2 border border-dashed border-th-line rounded-lg text-xs text-th-subtle hover:border-th-accent/50 hover:text-th-accent transition-colors"
              >
                {uploadForm.file ? uploadForm.file.name : '点击选择文件 (PDF/Word/TXT)'}
              </button>

              {/* 品牌输入 — 改为可输入+可选择的组合 */}
              <div>
                <label className="text-[10px] text-th-dim mb-1 block">品牌</label>
                <div className="relative">
                  <input
                    type="text"
                    value={uploadForm.brand}
                    onChange={e => setUploadForm(f => ({ ...f, brand: e.target.value }))}
                    list="brand-list"
                    placeholder="输入或选择品牌"
                    className="w-full px-2 py-1.5 text-xs bg-th-card border border-th-line rounded-lg text-th-body placeholder:text-th-dim focus:outline-none focus:border-th-accent/50"
                  />
                  <datalist id="brand-list">
                    {brandOptions.map(b => (
                      <option key={b} value={b} />
                    ))}
                  </datalist>
                </div>
                {/* 快捷品牌标签 */}
                {brandOptions.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {brandOptions.slice(0, 8).map(b => (
                      <button
                        key={b}
                        onClick={() => setUploadForm(f => ({ ...f, brand: b }))}
                        className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${
                          uploadForm.brand === b
                            ? 'bg-th-accent/20 text-th-accent border border-th-accent/30'
                            : 'bg-th-base text-th-dim border border-transparent hover:border-th-line'
                        }`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 平台选择 */}
              <div>
                <label className="text-[10px] text-th-dim mb-1 block">平台</label>
                <select
                  value={uploadForm.platform}
                  onChange={e => setUploadForm(f => ({ ...f, platform: e.target.value }))}
                  className="w-full px-2 py-1.5 text-xs bg-th-card border border-th-line rounded-lg text-th-body focus:outline-none focus:border-th-accent/50"
                >
                  <option value="">选择平台</option>
                  {PLATFORM_OPTIONS.map(p => (
                    <option key={p} value={p}>{p === 'all' ? '全平台' : p}</option>
                  ))}
                </select>
              </div>

              {/* 类型选择 */}
              <div>
                <label className="text-[10px] text-th-dim mb-1 block">文档类型</label>
                <select
                  value={uploadForm.type}
                  onChange={e => setUploadForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full px-2 py-1.5 text-xs bg-th-card border border-th-line rounded-lg text-th-body focus:outline-none focus:border-th-accent/50"
                >
                  {TYPE_OPTIONS.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* 上传按钮 */}
              <button
                onClick={handleUpload}
                disabled={!uploadForm.file || uploading}
                className="w-full py-2 text-xs font-medium rounded-lg bg-th-accent text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 transition-opacity"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    AI 正在解析文档...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    上传并解析
                  </>
                )}
              </button>
            </div>
          )}

          {/* 知识库列表 */}
          {Object.keys(grouped).length === 0 && sharedKnowledge.length === 0 ? (
            <div className="p-4 text-center">
              <BookOpen className="w-8 h-8 text-th-dim mx-auto mb-2 opacity-30" />
              <p className="text-xs text-th-dim">
                {searchQuery ? '未找到匹配的知识库' : '暂无知识库，点击上方上传'}
              </p>
            </div>
          ) : (
            Object.entries(grouped).map(([brand, items]) => {
              const isBrandExpanded = expandedBrands[brand] !== false; // 默认展开

              // 合并云端同品牌知识库
              const cloudItems = sharedKnowledge.filter(k => (k.brand || '未分类') === brand);
              const allItems = [...items, ...cloudItems];

              return (
              <div key={brand} className="px-2 mb-2">
                <button
                  onClick={() => setExpandedBrands(prev => ({ ...prev, [brand]: !isBrandExpanded }))}
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-th-base/80 transition-colors text-left"
                >
                  {isBrandExpanded ? (
                    <ChevronDown className="w-3 h-3 text-th-dim" />
                  ) : (
                    <ChevronRight className="w-3 h-3 text-th-dim" />
                  )}
                  <Tag className="w-3 h-3 text-th-accent/60" />
                  <span className="text-[10px] font-medium text-th-subtle uppercase tracking-wider">
                    {brand === 'all' ? '全品牌' : brand}
                  </span>
                  <span className="text-[10px] text-th-dim">({allItems.length})</span>
                  {cloudItems.length > 0 && (
                    <span className="text-[9px] text-emerald-400/60 flex items-center gap-0.5 ml-1">
                      <Cloud className="w-2.5 h-2.5" />
                      {cloudItems.length}
                    </span>
                  )}
                </button>

                {isBrandExpanded && allItems.map(item => {
                  const isCloud = item._source === 'cloud';
                  return (
                  <div
                    key={`${isCloud ? 'cloud' : 'local'}-${item.id}`}
                    className={`group mx-1 mb-1 p-2 rounded-lg border transition-colors ${
                      isCloud
                        ? 'bg-emerald-500/[0.02] border-emerald-500/5 hover:border-emerald-500/15'
                        : 'bg-th-base/50 hover:bg-th-base border-transparent hover:border-th-line/50'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {isCloud ? (
                        <Globe className="w-3.5 h-3.5 text-emerald-400/60 mt-0.5 shrink-0" />
                      ) : (
                        <FileText className="w-3.5 h-3.5 text-th-dim mt-0.5 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs text-th-body truncate">{item.name}</p>
                          {isCloud && (
                            <span className="text-[8px] px-1 py-0 rounded bg-emerald-500/10 text-emerald-400/70 border border-emerald-500/15 shrink-0">
                              共享
                            </span>
                          )}
                        </div>
                        {item.summary && (
                          <p className="text-[10px] text-th-dim mt-0.5 line-clamp-2">{item.summary}</p>
                        )}
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {item.type && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-th-accent/10 text-th-accent/70">
                              {typeLabel(item.type)}
                            </span>
                          )}
                          {item.platform && item.platform !== 'all' && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-th-base text-th-dim">
                              {item.platform}
                            </span>
                          )}
                          {item.keywords?.slice(0, 3).map(kw => (
                            <span key={kw} className="text-[9px] px-1 py-0.5 rounded bg-th-base/80 text-th-dim">
                              {kw}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* 操作按钮 — 云端条目只能删除云端，本地条目只能删除本地 */}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        {!isCloud && (
                          <>
                            <button
                              onClick={() => {
                                setEditingId(item.id);
                                setEditBrand(item.brand || '');
                                setEditPlatform(item.platform || '');
                              }}
                              className="p-1 rounded hover:bg-th-card text-th-dim hover:text-th-accent transition-colors"
                              title="编辑标签"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleDeleteKnowledge(item.id, item.name)}
                              className="p-1 rounded hover:bg-th-card text-th-dim hover:text-red-400 transition-colors"
                              title="删除"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </>
                        )}
                        {isCloud && (
                          <button
                            onClick={async () => {
                              if (confirm(`确定删除共享知识库「${item.name}」？所有人将不再看到此条目`)) {
                                await deleteCloudKnowledge(item.id);
                                await loadData();
                              }
                            }}
                            className="p-1 rounded hover:bg-th-card text-th-dim hover:text-red-400 transition-colors"
                            title="删除共享条目"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 编辑模式 — 仅本地条目 */}
                    {!isCloud && editingId === item.id && (
                      <div className="mt-2 pt-2 border-t border-th-line/30 space-y-1.5">
                        {/* 品牌编辑 — 也改为输入+选择 */}
                        <div>
                          <label className="text-[10px] text-th-dim mb-0.5 block">品牌</label>
                          <input
                            type="text"
                            value={editBrand}
                            onChange={e => setEditBrand(e.target.value)}
                            list="edit-brand-list"
                            placeholder="输入或选择品牌"
                            className="w-full px-2 py-1 text-[10px] bg-th-card border border-th-line rounded text-th-body focus:outline-none focus:border-th-accent/50"
                          />
                          <datalist id="edit-brand-list">
                            {brandOptions.map(b => (
                              <option key={b} value={b} />
                            ))}
                          </datalist>
                        </div>
                        <select
                          value={editPlatform}
                          onChange={e => setEditPlatform(e.target.value)}
                          className="w-full px-2 py-1 text-[10px] bg-th-card border border-th-line rounded text-th-body"
                        >
                          <option value="">选择平台</option>
                          {PLATFORM_OPTIONS.map(p => (
                            <option key={p} value={p}>{p === 'all' ? '全平台' : p}</option>
                          ))}
                        </select>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleSaveEdit(item)}
                            className="flex-1 py-1 text-[10px] bg-th-accent/20 text-th-accent rounded hover:bg-th-accent/30 transition-colors"
                          >
                            <Check className="w-3 h-3 inline" /> 保存
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="flex-1 py-1 text-[10px] bg-th-base text-th-dim rounded hover:bg-th-card transition-colors"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
                })}
              </div>
            )})
          )}
        </div>
      )}
    </div>
  );
}
