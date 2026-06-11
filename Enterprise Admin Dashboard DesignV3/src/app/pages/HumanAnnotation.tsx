import { useState, useEffect } from 'react';
import {
  Plus, ArrowLeft, ArrowRight, ChevronRight, X, Search,
  Filter, Database, CheckCircle2, Clock, Users, FileText,
  Tag, MessageSquare, AlertTriangle, Check, RotateCcw,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { mockAnnotationTasks, mockDatasets, AnnotationTask, AnnotationDimension, DatasetCategory } from '../data/mockData';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnnotationDataItem {
  id: string;
  type: '单轮问答' | '对话' | 'Prompt';
  status: 'pending' | 'completed';
  annotator: string;
  messageId: string;
  time: string;
  sessionId: string;
  userId: string;
  env: string;
  input: { role: string; content: string }[];
  output: { role: string; content: string }[];
  metadata: Record<string, unknown>;
}

type DimScores = Record<string, number | boolean | string>;
type View = 'task-list' | 'data-list' | 'annotation';
type SelectableDatasetCategory = Extract<DatasetCategory, 'evaluation' | 'badcase' | 'golden'>;

// ─── Mock data items ─────────────────────────────────────────────────────────

const MOCK_DATA_ITEMS: AnnotationDataItem[] = [
  {
    id: 'item_001', type: '单轮问答', status: 'completed', annotator: '陈小丽',
    messageId: 'msg_00123', time: '2026-06-01 10:30:00', sessionId: 'sess_abc456', userId: 'user_789', env: 'default',
    input: [{ role: 'user', content: '1型糖尿病和2型糖尿病有什么区别？两者在病因、发病年龄和治疗方式上有何不同？' }],
    output: [{ role: 'assistant', content: '1型糖尿病是一种自身免疫性疾病，免疫系统破坏产生胰岛素的β细胞，通常在儿童和青少年中发病，需每日注射胰岛素治疗。\n\n2型糖尿病是由胰岛素抵抗和相对胰岛素缺乏引起，多见于45岁以上成年人，通常可通过生活方式改变和口服药物控制。' }],
    metadata: { model: 'gpt-4o', tokens: 1024, latency_ms: 1250 },
  },
  {
    id: 'item_002', type: '单轮问答', status: 'pending', annotator: '陈小丽',
    messageId: 'msg_00124', time: '2026-06-01 10:45:00', sessionId: 'sess_abc457', userId: 'user_789', env: 'default',
    input: [{ role: 'user', content: '二甲双胍的标准用量是多少？有哪些常见副作用？' }],
    output: [{ role: 'assistant', content: '二甲双胍通常从500mg每日两次开始，逐渐增加至2000mg/天的维持剂量。常见副作用包括恶心、腹泻、胃部不适，通常随进食可以缓解。严重但罕见的副作用是乳酸酸中毒。' }],
    metadata: { model: 'gpt-4o', tokens: 876, latency_ms: 980 },
  },
  {
    id: 'item_003', type: '对话', status: 'pending', annotator: '张明博',
    messageId: 'msg_00125', time: '2026-06-01 11:00:00', sessionId: 'sess_abc458', userId: 'user_790', env: 'staging',
    input: [
      { role: 'user', content: '我最近血糖偏高，是2型糖尿病吗？' },
      { role: 'assistant', content: '血糖偏高不一定代表患有2型糖尿病，需要进行正式的医学诊断。' },
      { role: 'user', content: '那我需要做什么检查？' },
    ],
    output: [{ role: 'assistant', content: '建议您进行以下检查：1. 空腹血糖检测（FPG）；2. 糖化血红蛋白（HbA1c）；3. 葡萄糖耐量试验（OGTT）。请咨询您的医生进行专业评估。' }],
    metadata: { model: 'claude-3-5-sonnet', tokens: 1456, latency_ms: 1680 },
  },
  {
    id: 'item_004', type: '单轮问答', status: 'pending', annotator: '陈小丽',
    messageId: 'msg_00126', time: '2026-06-01 11:20:00', sessionId: 'sess_abc459', userId: 'user_791', env: 'default',
    input: [{ role: 'user', content: '高血压患者可以服用布洛芬吗？' }],
    output: [{ role: 'assistant', content: '高血压患者应谨慎使用布洛芬等非甾体抗炎药（NSAIDs），因为这类药物可能升高血压并影响降压药的疗效。建议咨询医生，考虑使用对乙酰氨基酚等替代药物。' }],
    metadata: { model: 'gpt-4o', tokens: 654, latency_ms: 820 },
  },
  {
    id: 'item_005', type: '单轮问答', status: 'completed', annotator: '张明博',
    messageId: 'msg_00127', time: '2026-06-01 11:45:00', sessionId: 'sess_abc460', userId: 'user_792', env: 'default',
    input: [{ role: 'user', content: '急性阑尾炎的典型症状有哪些？如何鉴别诊断？' }],
    output: [{ role: 'assistant', content: '急性阑尾炎的典型症状包括：转移性右下腹痛（从脐周转移至麦氏点）、发热（低至中度）、恶心呕吐、麦氏点压痛及反跳痛（Blumberg征阳性）。鉴别诊断需排除：卵巢囊肿扭转（女性）、右侧输尿管结石、Meckel憩室炎等。' }],
    metadata: { model: 'gpt-4o', tokens: 1102, latency_ms: 1150 },
  },
];

const ISSUE_LABELS = ['事实错误', '幻觉内容', '回答不完整', '答非所问', '不安全内容', '格式问题'];
const ALL_USERS = ['陈小丽', '张明博', '刘成远', '王思雨'];
const ALL_DIMS: AnnotationDimension[] = [
  { id: 'speed', label: '执行速度', type: 'numeric', desc: '系统响应速度评分', range: [0, 10] },
  { id: 'accuracy', label: '准确率', type: 'numeric', desc: '回答事实正确性', range: [0, 10] },
  { id: 'relevance', label: '相关性', type: 'numeric', desc: '是否切题回答问题', range: [0, 10] },
  { id: 'completeness', label: '完整性', type: 'numeric', desc: '答案的完整程度', range: [0, 10] },
  { id: 'safety', label: '安全性', type: 'numeric', desc: '无有害内容', range: [0, 10] },
  { id: 'compliant', label: '是否合规', type: 'boolean', desc: '是否符合合规要求' },
  { id: 'quality', label: '质量等级', type: 'categorical', desc: '综合质量评级', options: ['优', '良', '差'] },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function defaultScores(dims: AnnotationDimension[]): DimScores {
  const s: DimScores = {};
  for (const d of dims) {
    if (d.type === 'numeric') s[d.id] = 7;
    else if (d.type === 'boolean') s[d.id] = true;
    else if (d.type === 'categorical') s[d.id] = d.options?.[0] ?? '';
  }
  return s;
}

// ─── Create Task Modal ────────────────────────────────────────────────────────

function CreateTaskModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (task: AnnotationTask) => void;
}) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [selectedDims, setSelectedDims] = useState<string[]>(['accuracy', 'relevance', 'safety']);
  const [assignees, setAssignees] = useState<string[]>(['陈小丽']);

  function toggleDim(id: string) {
    setSelectedDims(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function toggleAssignee(u: string) {
    setAssignees(prev => prev.includes(u) ? prev.filter(x => x !== u) : [...prev, u]);
  }

  function handleCreate() {
    if (!name.trim() || selectedDims.length === 0 || assignees.length === 0) return;
    const dims = ALL_DIMS.filter(d => selectedDims.includes(d.id));
    const task: AnnotationTask = {
      id: `at_${Date.now()}`,
      name: name.trim(),
      description: desc.trim() || undefined,
      status: 'pending',
      total: 0,
      completed: 0,
      assignedTo: assignees.join('、'),
      createdAt: new Date().toISOString().slice(0, 10),
      dimensions: dims,
    };
    onCreate(task);
    onClose();
  }

  const canCreate = name.trim() && selectedDims.length > 0 && assignees.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-slate-900">新建标注任务</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm text-slate-600 mb-1.5">任务名称 *</label>
            <input
              value={name} onChange={e => setName(e.target.value)}
              placeholder="例如：医疗QA质量标注 v1"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1.5">任务描述（选填）</label>
            <textarea
              value={desc} onChange={e => setDesc(e.target.value)} rows={2}
              placeholder="描述标注任务的目标和背景信息..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-2">评分维度 *（可多选）</label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_DIMS.map(d => (
                <label key={d.id} className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                  selectedDims.includes(d.id) ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                }`}>
                  <input type="checkbox" checked={selectedDims.includes(d.id)} onChange={() => toggleDim(d.id)} className="accent-blue-600" />
                  <div>
                    <div className="text-xs font-medium text-slate-700">{d.label}</div>
                    <div className="text-xs text-slate-400">{
                      d.type === 'numeric' ? `数字 ${d.range?.[0]}-${d.range?.[1]}` :
                      d.type === 'boolean' ? '布尔 是/否' : `分类 ${d.options?.join('/')}`
                    }</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-2">处理人 *（可多人）</label>
            <div className="flex flex-wrap gap-2">
              {ALL_USERS.map(u => (
                <button key={u} onClick={() => toggleAssignee(u)}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                    assignees.includes(u) ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}>
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">取消</button>
          <button onClick={handleCreate} disabled={!canCreate}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
            确认创建
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add to Dataset Modal ─────────────────────────────────────────────────────

const DATASET_CATEGORY_OPTIONS: Array<{ value: SelectableDatasetCategory; label: string }> = [
  { value: 'evaluation', label: '评测集' },
  { value: 'badcase', label: 'BadCase 集' },
  { value: 'golden', label: '黄金集' },
];

function AddToDatasetModal({ item, onClose }: { item: AnnotationDataItem; onClose: () => void }) {
  const [dsId, setDsId] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<SelectableDatasetCategory>('evaluation');
  const [inputEdit, setInputEdit] = useState(JSON.stringify(item.input, null, 2));
  const [outputEdit, setOutputEdit] = useState(JSON.stringify(item.output, null, 2));
  const [metaEdit, setMetaEdit] = useState(JSON.stringify(item.metadata, null, 2));

  const filteredDatasets = mockDatasets.filter(dataset =>
    DATASET_CATEGORY_OPTIONS.some(option => option.value === dataset.category) &&
    dataset.category === selectedCategory
  );

  useEffect(() => {
    if (dsId && !filteredDatasets.some(dataset => dataset.id === dsId)) {
      setDsId('');
    }
  }, [dsId, filteredDatasets]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-slate-900">添加至数据集</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm text-slate-600 mb-2">数据集分类</label>
            <div className="grid grid-cols-3 gap-2">
              {DATASET_CATEGORY_OPTIONS.map(option => {
                const checked = selectedCategory === option.value;
                return (
                  <label
                    key={option.value}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                      checked
                        ? 'border-blue-400 bg-blue-50 text-blue-700'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="datasetCategory"
                      checked={checked}
                      onChange={() => setSelectedCategory(option.value)}
                      className="accent-blue-600"
                    />
                    <span className="text-sm font-medium">{option.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1.5">目标数据集 *</label>
            <select value={dsId} onChange={e => setDsId(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500">
              <option value="">请选择数据集...</option>
              {filteredDatasets.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}（{DATASET_CATEGORY_OPTIONS.find(option => option.value === d.category)?.label}，{d.version}，{d.itemCount} 条）
                </option>
              ))}
            </select>
            <div className="mt-1 text-xs text-slate-400">
              当前匹配 {filteredDatasets.length} 个数据集
            </div>
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1.5">自定义编辑 — input</label>
            <textarea value={inputEdit} onChange={e => setInputEdit(e.target.value)} rows={4}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-blue-500 resize-none bg-slate-950 text-emerald-300" />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1.5">自定义编辑 — expected_output</label>
            <textarea value={outputEdit} onChange={e => setOutputEdit(e.target.value)} rows={4}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-blue-500 resize-none bg-slate-950 text-emerald-300" />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1.5">自定义编辑 — metadata</label>
            <textarea value={metaEdit} onChange={e => setMetaEdit(e.target.value)} rows={3}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-blue-500 resize-none bg-slate-950 text-emerald-300" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">取消</button>
          <button onClick={onClose} disabled={!dsId}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
            <Database className="inline w-4 h-4 mr-1.5" /> 确认写入
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Dimension Control ────────────────────────────────────────────────────────

function DimControl({ dim, value, onChange }: {
  dim: AnnotationDimension;
  value: number | boolean | string;
  onChange: (v: number | boolean | string) => void;
}) {
  if (dim.type === 'numeric') {
    const num = value as number;
    const [min, max] = dim.range ?? [0, 10];
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <span className="text-sm font-medium text-slate-700">{dim.label}</span>
            <span className="text-xs text-slate-400 ml-2">{dim.desc}</span>
          </div>
          <span className="text-lg font-bold text-blue-600 w-10 text-right font-mono">{num}<span className="text-xs text-slate-400">/{max}</span></span>
        </div>
        <input type="range" min={min} max={max} step={1} value={num}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full accent-blue-600" />
        <div className="flex justify-between text-xs text-slate-400 mt-0.5">
          <span>{min}（很差）</span>
          <span>{Math.round((min + max) / 2)}（一般）</span>
          <span>{max}（优秀）</span>
        </div>
      </div>
    );
  }

  if (dim.type === 'boolean') {
    const bool = value as boolean;
    return (
      <div>
        <div className="text-sm font-medium text-slate-700 mb-2">{dim.label}<span className="text-xs text-slate-400 ml-2">{dim.desc}</span></div>
        <div className="flex gap-3">
          {[true, false].map(opt => (
            <label key={String(opt)} className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors ${
              bool === opt ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'
            }`}>
              <input type="radio" checked={bool === opt} onChange={() => onChange(opt)} className="accent-blue-600" />
              <span className="text-sm font-medium">{opt ? '是' : '否'}</span>
            </label>
          ))}
        </div>
      </div>
    );
  }

  // categorical
  const cat = value as string;
  return (
    <div>
      <div className="text-sm font-medium text-slate-700 mb-2">{dim.label}<span className="text-xs text-slate-400 ml-2">{dim.desc}</span></div>
      <div className="flex gap-2">
        {dim.options?.map(opt => (
          <label key={opt} className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors ${
            cat === opt ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'
          }`}>
            <input type="radio" checked={cat === opt} onChange={() => onChange(opt)} className="accent-blue-600" />
            <span className="text-sm font-medium">{opt}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ─── Annotation Detail View ───────────────────────────────────────────────────

function AnnotationView({
  task, items, initialIdx, onBack,
}: {
  task: AnnotationTask;
  items: AnnotationDataItem[];
  initialIdx: number;
  onBack: () => void;
}) {
  const [idx, setIdx] = useState(initialIdx);
  const [scores, setScores] = useState<DimScores>(() => defaultScores(task.dimensions ?? []));
  const [labels, setLabels] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [note, setNote] = useState('');
  const [addToDs, setAddToDs] = useState(false);
  const [savedItems, setSavedItems] = useState<Set<string>>(new Set());

  const item = items[idx];
  const dims = task.dimensions ?? [];

  function toggleLabel(l: string) {
    setLabels(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l]);
  }

  function save() {
    setSavedItems(prev => new Set(prev).add(item.id));
    if (idx < items.length - 1) {
      setIdx(i => i + 1);
      setScores(defaultScores(dims));
      setLabels([]);
      setComment('');
      setNote('');
    }
  }

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft' && idx > 0) { setIdx(i => i - 1); setScores(defaultScores(dims)); setLabels([]); }
      if (e.key === 'ArrowRight' && idx < items.length - 1) { setIdx(i => i + 1); setScores(defaultScores(dims)); setLabels([]); }
      const n = Number(e.key);
      if (n >= 1 && n <= 9) {
        const numericDims = dims.filter(d => d.type === 'numeric');
        if (numericDims.length > 0) {
          setScores(s => ({ ...s, [numericDims[0].id]: n }));
        }
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [idx, items.length, dims]);

  const completed = items.filter(it => savedItems.has(it.id) || it.status === 'completed').length;

  return (
    <div className="flex flex-col h-full">
      {/* top bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-800">
            <ArrowLeft className="w-4 h-4" /> 返回数据列表
          </button>
          <span className="text-slate-300">|</span>
          <span className="text-sm text-slate-700 font-medium">{task.name}</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-sm text-slate-500">数据项 #{item.id}</span>
          <StatusBadge status={savedItems.has(item.id) || item.status === 'completed' ? 'completed' : 'pending'} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 hidden xl:block">快捷键：← → 切换 · 1-9 评分</span>
          <span className="text-sm text-slate-500">进度 <span className="font-semibold text-slate-700">{completed}/{items.length}</span></span>
          <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${(completed / items.length) * 100}%` }} />
          </div>
        </div>
      </div>

      {/* main content */}
      <div className="flex-1 overflow-hidden flex">
        {/* LEFT — message detail */}
        <div className="flex-1 overflow-y-auto border-r border-slate-200 p-5 space-y-4 bg-slate-50/50">
          {/* metadata */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">消息详情</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
              {[
                ['消息ID', item.messageId],
                ['时间', item.time],
                ['SessionId', item.sessionId],
                ['UserId', item.userId],
                ['环境', item.env],
                ['数据类型', item.type],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="text-slate-400 flex-shrink-0">{k}：</span>
                  <span className="font-mono text-slate-700 truncate">{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* input */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Input</div>
            <pre className="text-xs font-mono text-slate-700 bg-slate-50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(item.input, null, 2)}
            </pre>
          </div>

          {/* output */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Output</div>
            <pre className="text-xs font-mono text-slate-700 bg-slate-50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(item.output, null, 2)}
            </pre>
          </div>

          {/* metadata */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Metadata</div>
            <pre className="text-xs font-mono text-slate-700 bg-slate-50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(item.metadata, null, 2)}
            </pre>
          </div>
        </div>

        {/* RIGHT — annotation panel */}
        <div className="w-[380px] flex-shrink-0 overflow-y-auto p-5 space-y-5">
          {/* scoring dimensions */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">评分维度</div>
            <div className="space-y-5">
              {dims.map(dim => (
                <DimControl
                  key={dim.id}
                  dim={dim}
                  value={scores[dim.id] ?? (dim.type === 'numeric' ? 7 : dim.type === 'boolean' ? true : dim.options?.[0] ?? '')}
                  onChange={v => setScores(s => ({ ...s, [dim.id]: v }))}
                />
              ))}
            </div>
          </div>

          {/* labels */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">问题标签</div>
            <div className="flex flex-wrap gap-2">
              {ISSUE_LABELS.map(l => (
                <button key={l} onClick={() => toggleLabel(l)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-full border transition-colors ${
                    labels.includes(l)
                      ? 'border-red-400 bg-red-50 text-red-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}>
                  <Tag className="w-3 h-3" />{l}
                </button>
              ))}
            </div>
          </div>

          {/* comments */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">总体评价</label>
              <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2}
                placeholder="对该条数据的总体评价..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 resize-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">备注（选填）</label>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                placeholder="添加备注..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 resize-none" />
            </div>
          </div>
        </div>
      </div>

      {/* bottom bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-t border-slate-200">
        <button onClick={() => setAddToDs(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
          <Database className="w-4 h-4" /> 添加至数据集
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => { setIdx(i => Math.max(0, i - 1)); setScores(defaultScores(dims)); setLabels([]); }}
            disabled={idx === 0}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
            <ArrowLeft className="w-4 h-4" /> 上一条
          </button>
          <button onClick={() => { setIdx(i => Math.min(items.length - 1, i + 1)); setScores(defaultScores(dims)); setLabels([]); }}
            disabled={idx >= items.length - 1}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
            跳过 <ArrowRight className="w-4 h-4" />
          </button>
          <button onClick={save}
            className="flex items-center gap-1.5 px-5 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700">
            保存并下一条 <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {addToDs && <AddToDatasetModal item={item} onClose={() => setAddToDs(false)} />}
    </div>
  );
}

// ─── Data List View ───────────────────────────────────────────────────────────

function DataListView({
  task, onBack, onAnnotate,
}: {
  task: AnnotationTask;
  onBack: () => void;
  onAnnotate: (idx: number) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [annotatorFilter, setAnnotatorFilter] = useState('all');
  const [query, setQuery] = useState('');

  const filtered = MOCK_DATA_ITEMS.filter(it => {
    if (statusFilter !== 'all' && it.status !== statusFilter) return false;
    if (annotatorFilter !== 'all' && it.annotator !== annotatorFilter) return false;
    if (query && !it.id.includes(query) && !it.type.includes(query)) return false;
    return true;
  });

  const annotators = [...new Set(MOCK_DATA_ITEMS.map(it => it.annotator))];
  const completedCount = MOCK_DATA_ITEMS.filter(it => it.status === 'completed').length;

  return (
    <div>
      {/* breadcrumb header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-800">
            <ArrowLeft className="w-4 h-4" /> 返回任务列表
          </button>
          <span className="text-slate-300">|</span>
          <span className="text-sm font-medium text-slate-700">{task.name}</span>
          <StatusBadge status={task.status} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">进度 <span className="font-semibold text-slate-700">{completedCount}/{MOCK_DATA_ITEMS.length}</span></span>
          <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 rounded-full" style={{ width: `${(completedCount / MOCK_DATA_ITEMS.length) * 100}%` }} />
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* task info */}
        {task.description && (
          <div className="bg-blue-50 rounded-xl border border-blue-100 px-4 py-3 text-sm text-blue-700">
            <MessageSquare className="inline w-4 h-4 mr-1.5" />{task.description}
          </div>
        )}

        {/* dims chips */}
        {task.dimensions && task.dimensions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs text-slate-500 mr-1">评分维度：</span>
            {task.dimensions.map(d => (
              <span key={d.id} className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full border border-slate-200">
                {d.label}
                <span className="ml-1 text-slate-400">
                  {d.type === 'numeric' ? `(数字)` : d.type === 'boolean' ? '(布尔)' : '(分类)'}
                </span>
              </span>
            ))}
          </div>
        )}

        {/* filter bar */}
        <div className="flex items-center gap-3">
          <div className="relative max-w-xs w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索数据ID..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-500 bg-white" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 bg-white">
            <option value="all">全部状态</option>
            <option value="pending">待处理</option>
            <option value="completed">已完成</option>
          </select>
          <select value={annotatorFilter} onChange={e => setAnnotatorFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 bg-white">
            <option value="all">全部标注人</option>
            {annotators.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <div className="ml-auto text-xs text-slate-400">共 {filtered.length} 条</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">ID</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">数据类型</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">标记状态</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">标注人</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">输入摘要</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((it, i) => (
                <tr key={it.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => onAnnotate(MOCK_DATA_ITEMS.indexOf(it))}>
                  <td className="px-5 py-4 text-sm font-mono text-slate-600">{it.id}</td>
                  <td className="px-5 py-4">
                    <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">{it.type}</span>
                  </td>
                  <td className="px-5 py-4"><StatusBadge status={it.status} /></td>
                  <td className="px-5 py-4 text-sm text-slate-600">{it.annotator}</td>
                  <td className="px-5 py-4 text-sm text-slate-500 truncate max-w-xs">
                    {it.input[0]?.content.slice(0, 40)}…
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={e => { e.stopPropagation(); onAnnotate(MOCK_DATA_ITEMS.indexOf(it)); }}
                      className="px-3 py-1.5 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"
                    >
                      {it.status === 'completed' ? '查看标注' : '开始标注'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Review Panel ─────────────────────────────────────────────────────────────

function ReviewPanel({ task, onClose }: { task: AnnotationTask; onClose: () => void }) {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [rejectReason, setRejectReason] = useState('');

  const mockAnnotators = [
    { name: '陈小丽', scores: { 准确性: 8, 相关性: 7, 安全性: 9 }, labels: ['幻觉内容'] },
    { name: '张明博', scores: { 准确性: 7, 相关性: 8, 安全性: 9 }, labels: [] },
  ];

  const kappa = 0.82;

  const REVIEW_ITEMS = MOCK_DATA_ITEMS.filter(it => it.status === 'completed').slice(0, 3);

  function toggleItem(id: string) {
    setSelectedItems(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-[720px] bg-white border-l border-slate-200 flex flex-col shadow-2xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-slate-900">审核：{task.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={task.status} />
              <span className="text-xs text-slate-400">{task.assignedTo}</span>
              <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                Kappa: {kappa}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* consistency */}
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">一致性指标</div>
            <div className="flex items-center gap-6">
              <div>
                <div className="text-2xl font-bold text-emerald-600">{kappa}</div>
                <div className="text-xs text-slate-500">Cohen's Kappa</div>
              </div>
              <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${kappa * 100}%` }} />
              </div>
              <span className="text-xs text-emerald-600 font-medium">高于阈值 0.6 ✓</span>
            </div>
          </div>

          {/* annotator comparison */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">标注者对比</div>
            <div className="space-y-3">
              {mockAnnotators.map(ann => (
                <div key={ann.name} className="bg-slate-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-xs text-white font-semibold flex-shrink-0">
                      {ann.name[0]}
                    </div>
                    <span className="text-sm font-medium text-slate-700">{ann.name}</span>
                    {ann.labels.length > 0 && ann.labels.map(l => (
                      <span key={l} className="text-xs px-2 py-0.5 bg-red-50 text-red-600 rounded-full border border-red-100">{l}</span>
                    ))}
                  </div>
                  <div className="flex gap-4 text-xs">
                    {Object.entries(ann.scores).map(([k, v]) => (
                      <span key={k}><span className="text-slate-400">{k}：</span><span className="font-bold text-slate-700">{v}/10</span></span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* batch review */}
          {selectedItems.size > 0 && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
              <span className="text-xs text-blue-600">已选 {selectedItems.size} 条</span>
              <input value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                placeholder="打回理由（选填）"
                className="flex-1 border border-blue-200 rounded px-2 py-1 text-xs outline-none focus:border-blue-500 bg-white" />
              <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-emerald-600 border border-emerald-200 rounded-lg hover:bg-emerald-50">
                <Check className="w-3.5 h-3.5" /> 批量通过
              </button>
              <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50">
                <RotateCcw className="w-3.5 h-3.5" /> 批量打回
              </button>
            </div>
          )}

          {/* item list */}
          <div className="space-y-3">
            {REVIEW_ITEMS.map(it => (
              <div key={it.id} className={`bg-white rounded-xl border p-4 transition-colors ${selectedItems.has(it.id) ? 'border-blue-300 bg-blue-50/30' : 'border-slate-200'}`}>
                <div className="flex items-start gap-3 mb-3">
                  <button onClick={() => toggleItem(it.id)} className="mt-0.5 flex-shrink-0">
                    {selectedItems.has(it.id)
                      ? <div className="w-4 h-4 rounded border border-blue-500 bg-blue-600 flex items-center justify-center"><span className="text-white text-xs leading-none">✓</span></div>
                      : <div className="w-4 h-4 rounded border border-slate-300" />}
                  </button>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-slate-400">{it.id}</span>
                      <StatusBadge status={it.status} />
                    </div>
                    <div className="text-sm text-slate-700">{it.input[0]?.content.slice(0, 60)}…</div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-emerald-600 border border-emerald-200 rounded-lg hover:bg-emerald-50">
                      <Check className="w-3.5 h-3.5" /> 通过
                    </button>
                    <button className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50">
                      <RotateCcw className="w-3.5 h-3.5" /> 打回
                    </button>
                  </div>
                </div>
                {/* individual annotator scores */}
                <div className="ml-7 text-xs text-slate-500 grid grid-cols-2 gap-1.5">
                  {mockAnnotators.map(ann => (
                    <div key={ann.name} className="flex items-center gap-2">
                      <span className="text-slate-400">{ann.name}：</span>
                      {Object.entries(ann.scores).slice(0, 2).map(([k, v]) => (
                        <span key={k}>{k} <span className="font-semibold text-slate-700">{v}</span></span>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function HumanAnnotation() {
  const [tasks, setTasks] = useState<AnnotationTask[]>(mockAnnotationTasks);
  const [view, setView] = useState<View>('task-list');
  const [selectedTask, setSelectedTask] = useState<AnnotationTask | null>(null);
  const [annotationIdx, setAnnotationIdx] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [reviewTask, setReviewTask] = useState<AnnotationTask | null>(null);

  function openDataList(task: AnnotationTask) {
    setSelectedTask(task);
    setView('data-list');
  }

  function openAnnotation(idx: number) {
    setAnnotationIdx(idx);
    setView('annotation');
  }

  function addTask(task: AnnotationTask) {
    setTasks(prev => [task, ...prev]);
  }

  if (view === 'annotation' && selectedTask) {
    return (
      <div className="flex flex-col h-screen">
        <AnnotationView
          task={selectedTask}
          items={MOCK_DATA_ITEMS}
          initialIdx={annotationIdx}
          onBack={() => setView('data-list')}
        />
      </div>
    );
  }

  if (view === 'data-list' && selectedTask) {
    return (
      <div>
        <DataListView
          task={selectedTask}
          onBack={() => setView('task-list')}
          onAnnotate={openAnnotation}
        />
      </div>
    );
  }

  // task list
  const pendingCount = tasks.filter(t => t.status === 'pending').length;
  const inProgressCount = tasks.filter(t => t.status === 'in_progress').length;
  const reviewCount = tasks.filter(t => t.status === 'review').length;

  return (
    <div>
      <PageHeader
        title="人工标注"
        description="创建并管理人工标注任务，构建高质量 Ground Truth 数据"
        actions={
          <button onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
            <Plus className="w-4 h-4" /> 新建标注任务
          </button>
        }
      />

      <div className="p-6 space-y-4">
        {/* stat cards */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: '待处理', value: pendingCount, icon: <Clock className="w-4 h-4 text-slate-500" />, bg: 'bg-slate-50' },
            { label: '进行中', value: inProgressCount, icon: <FileText className="w-4 h-4 text-blue-500" />, bg: 'bg-blue-50' },
            { label: '待审核', value: reviewCount, icon: <AlertTriangle className="w-4 h-4 text-amber-500" />, bg: 'bg-amber-50' },
            { label: '已通过', value: tasks.filter(t => t.status === 'approved').length, icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />, bg: 'bg-emerald-50' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg ${s.bg} flex items-center justify-center flex-shrink-0`}>{s.icon}</div>
              <div>
                <div className="text-xl font-bold text-slate-800">{s.value}</div>
                <div className="text-xs text-slate-500">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">任务名称</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">状态</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">评分维度</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">进度</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">负责人</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">创建时间</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tasks.map(task => (
                <tr key={task.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4">
                    <button onClick={() => openDataList(task)} className="text-sm font-medium text-blue-600 hover:text-blue-700 text-left">
                      {task.name}
                    </button>
                    {task.description && (
                      <div className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{task.description}</div>
                    )}
                  </td>
                  <td className="px-5 py-4"><StatusBadge status={task.status} /></td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1">
                      {task.dimensions?.slice(0, 3).map(d => (
                        <span key={d.id} className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">{d.label}</span>
                      ))}
                      {(task.dimensions?.length ?? 0) > 3 && (
                        <span className="text-xs text-slate-400">+{(task.dimensions?.length ?? 0) - 3}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: task.total > 0 ? `${(task.completed / task.total) * 100}%` : '0%' }} />
                      </div>
                      <span className="text-xs text-slate-600 font-mono">{task.completed}/{task.total}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-600">{task.assignedTo}</td>
                  <td className="px-5 py-4 text-sm text-slate-500">{task.createdAt}</td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {(task.status === 'in_progress' || task.status === 'pending') && (
                        <button onClick={() => openDataList(task)}
                          className="px-3 py-1.5 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50">
                          {task.status === 'pending' ? '开始标注' : '继续标注'}
                        </button>
                      )}
                      {task.status === 'review' && (
                        <button onClick={() => setReviewTask(task)}
                          className="px-3 py-1.5 text-xs text-amber-700 border border-amber-300 rounded-lg hover:bg-amber-50">
                          进入审核
                        </button>
                      )}
                      {task.status === 'approved' && (
                        <span className="text-xs text-slate-400">已完成</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {createOpen && <CreateTaskModal onClose={() => setCreateOpen(false)} onCreate={addTask} />}
      {reviewTask && <ReviewPanel task={reviewTask} onClose={() => setReviewTask(null)} />}
    </div>
  );
}
