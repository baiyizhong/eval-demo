import { useState } from 'react';
import {
  Plus, Upload, Download, Search, Database, X, Edit2, Trash2,
  AlertTriangle, ChevronDown, ChevronUp, Sparkles,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { mockDatasets, Dataset, DatasetCategory } from '../data/mockData';

// ─── constants ────────────────────────────────────────────────────────────────

type ConvertibleDatasetCategory = Extract<DatasetCategory, 'evaluation' | 'badcase' | 'golden'>;

const sourceLabels: Record<string, string> = {
  annotation: '人工标注',
  auto: '模型生成',
  import: 'CSV 导入',
  trace: '从 Trace 来',
};

const sourceColors: Record<string, string> = {
  annotation: 'bg-purple-100 text-purple-700',
  auto: 'bg-blue-100 text-blue-700',
  import: 'bg-amber-100 text-amber-700',
  trace: 'bg-teal-100 text-teal-700',
};

const categoryLabels: Record<DatasetCategory, string> = {
  evaluation: '评测集',
  badcase: 'BadCase 集',
  golden: '黄金集',
  anomaly: '异常集',
};

const categoryColors: Record<DatasetCategory, string> = {
  evaluation: 'bg-blue-100 text-blue-700',
  badcase: 'bg-rose-100 text-rose-700',
  golden: 'bg-amber-100 text-amber-700',
  anomaly: 'bg-orange-100 text-orange-700',
};

const convertibleCategories: ConvertibleDatasetCategory[] = ['evaluation', 'badcase', 'golden'];

const META_TEMPLATES: Record<string, string> = {
  version: '1.0.0',
  author: '',
  tags: '',
  domain: '',
  description_en: '',
  source_project: '',
};

// ─── Metadata Editor ──────────────────────────────────────────────────────────

interface KVEntry { id: string; key: string; value: string }

function MetadataEditor({
  entries, onChange,
}: {
  entries: KVEntry[];
  onChange: (entries: KVEntry[]) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);

  function addEntry(key = '', value = '') {
    onChange([...entries, { id: `kv_${Date.now()}`, key, value }]);
    setTemplateOpen(false);
  }

  function updateEntry(id: string, patch: Partial<KVEntry>) {
    onChange(entries.map(e => e.id === id ? { ...e, ...patch } : e));
  }

  function removeEntry(id: string) {
    onChange(entries.filter(e => e.id !== id));
  }

  const dupKeys = new Set(
    entries.map(e => e.key).filter((k, i, arr) => k && arr.indexOf(k) !== i)
  );
  const emptyKeys = entries.some(e => !e.key.trim() && e.value.trim());

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      {/* header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <button onClick={() => setCollapsed(o => !o)} className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
          {collapsed ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
          Metadata 键值对
          {entries.length > 0 && <span className="ml-1 text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">{entries.length}</span>}
        </button>
        <div className="flex items-center gap-1.5">
          {/* template picker */}
          <div className="relative">
            <button
              onClick={() => setTemplateOpen(o => !o)}
              className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-white"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" /> 快捷模板
            </button>
            {templateOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-10 min-w-36 py-1">
                {Object.keys(META_TEMPLATES).map(k => (
                  <button
                    key={k}
                    onClick={() => addEntry(k, META_TEMPLATES[k])}
                    className="w-full text-left px-3 py-1.5 text-xs font-mono text-slate-700 hover:bg-slate-50"
                  >
                    {k}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => addEntry()} className="flex items-center gap-1 px-2.5 py-1 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50">
            <Plus className="w-3.5 h-3.5" /> 新增
          </button>
        </div>
      </div>

      {!collapsed && (
        <div>
          {entries.length === 0 ? (
            <div className="px-4 py-5 text-center text-xs text-slate-400">
              暂无 metadata，点击「新增」或使用「快捷模板」添加键值对
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {/* column headers */}
              <div className="grid grid-cols-[1fr_1fr_32px] gap-2 px-4 py-2 bg-slate-50/50 border-b border-slate-100">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Key</span>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Value</span>
              </div>
              {entries.map(entry => (
                <div key={entry.id} className="grid grid-cols-[1fr_1fr_32px] gap-2 px-4 py-2.5 items-center">
                  <div>
                    <input
                      value={entry.key}
                      onChange={e => updateEntry(entry.id, { key: e.target.value })}
                      placeholder="key"
                      className={`w-full border rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none focus:border-blue-500 ${
                        dupKeys.has(entry.key) || (!entry.key.trim() && entry.value.trim())
                          ? 'border-red-300 bg-red-50'
                          : 'border-slate-200'
                      }`}
                    />
                    {dupKeys.has(entry.key) && (
                      <div className="text-xs text-red-500 mt-0.5">Key 重复</div>
                    )}
                  </div>
                  <input
                    value={entry.value}
                    onChange={e => updateEntry(entry.id, { value: e.target.value })}
                    placeholder="value"
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none focus:border-blue-500"
                  />
                  <button onClick={() => removeEntry(entry.id)} className="text-slate-300 hover:text-red-400 transition-colors flex items-center justify-center">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {emptyKeys && (
            <div className="px-4 py-2 text-xs text-red-500 bg-red-50 border-t border-red-100 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Key 不允许为空字符串
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Create / Edit Modal ──────────────────────────────────────────────────────

function metadataToEntries(meta?: Record<string, string>): KVEntry[] {
  if (!meta) return [];
  return Object.entries(meta).map(([k, v], i) => ({ id: `kv_${i}`, key: k, value: v }));
}

function entriesToMetadata(entries: KVEntry[]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const e of entries) {
    if (e.key.trim()) obj[e.key.trim()] = e.value;
  }
  return obj;
}

function CreateEditModal({
  existing,
  allNames,
  onClose,
  onSave,
}: {
  existing?: Dataset;
  allNames: string[];
  onClose: () => void;
  onSave: (ds: Dataset) => void;
}) {
  const isEdit = !!existing;
  const [name, setName] = useState(existing?.name ?? '');
  const [category, setCategory] = useState<DatasetCategory>(existing?.category ?? 'evaluation');
  const [desc, setDesc] = useState(existing?.description ?? '');
  const [entries, setEntries] = useState<KVEntry[]>(() => metadataToEntries(existing?.metadata));

  const nameError = (() => {
    if (!name.trim()) return '数据集名称不能为空';
    if (name.length > 100) return '名称不超过 100 字符';
    const taken = allNames.filter(n => n !== existing?.name);
    if (taken.includes(name.trim())) return '同一项目内名称已存在';
    return '';
  })();

  const descError = desc.length > 500 ? '描述不超过 500 字符' : '';

  const metaError = entries.some(e => !e.key.trim() && e.value.trim())
    ? 'Key 不允许为空字符串'
    : entries.some(e => {
        const keys = entries.map(x => x.key);
        return e.key && keys.indexOf(e.key) !== keys.lastIndexOf(e.key);
      })
      ? '存在重复 Key'
      : '';

  const canSave = !nameError && !descError && !metaError;

  function handleSave() {
    if (!canSave) return;
    const meta = entriesToMetadata(entries);
    const ds: Dataset = {
      id: existing?.id ?? `ds_${Date.now()}`,
      name: name.trim(),
      category,
      source: existing?.source ?? 'annotation',
      itemCount: existing?.itemCount ?? 0,
      version: existing?.version ?? 'v1',
      createdAt: existing?.createdAt ?? new Date().toISOString().slice(0, 10),
      description: desc.trim() || undefined,
      metadata: Object.keys(meta).length > 0 ? meta : undefined,
    };
    onSave(ds);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-slate-900">{isEdit ? '编辑数据集' : '新建数据集'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* name */}
          <div>
            <label className="block text-sm text-slate-600 mb-1.5">
              数据集名称 <span className="text-red-500">*</span>
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={110}
              placeholder="例如：medical-qa-v4"
              className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 ${nameError && name !== '' ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}
            />
            <div className="flex items-center justify-between mt-1">
              {nameError && name !== '' ? (
                <span className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{nameError}</span>
              ) : <span />}
              <span className={`text-xs ${name.length > 100 ? 'text-red-500' : 'text-slate-400'}`}>{name.length}/100</span>
            </div>
          </div>

          {/* category */}
          <div>
            <label className="block text-sm text-slate-600 mb-2">
              数据集类型 <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(categoryLabels) as DatasetCategory[]).map(key => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategory(key)}
                  className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                    category === key
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {categoryLabels[key]}
                </button>
              ))}
            </div>
          </div>

          {/* description */}
          <div>
            <label className="block text-sm text-slate-600 mb-1.5">描述（选填）</label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              rows={3}
              maxLength={510}
              placeholder="说明该数据集的用途或背景信息..."
              className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 resize-none ${descError ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}
            />
            <div className="flex items-center justify-between mt-1">
              {descError ? (
                <span className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{descError}</span>
              ) : <span />}
              <span className={`text-xs ${desc.length > 500 ? 'text-red-500' : 'text-slate-400'}`}>{desc.length}/500</span>
            </div>
          </div>

          {/* metadata editor */}
          <div>
            <label className="block text-sm text-slate-600 mb-1.5">Metadata（选填）</label>
            <MetadataEditor entries={entries} onChange={setEntries} />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">取消</button>
          <button onClick={handleSave} disabled={!canSave || !name.trim()}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
            {isEdit ? '保存修改' : '确认创建'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Confirm Dialog ────────────────────────────────────────────────────

function DeleteConfirm({ dataset, onClose, onConfirm }: {
  dataset: Dataset;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="text-slate-900 mb-1">删除数据集</h3>
            <p className="text-sm text-slate-500">
              确定要删除 <span className="font-mono font-semibold text-slate-700">{dataset.name}</span> 吗？该操作不可撤销，所有关联数据将一并删除。
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">取消</button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700">确认删除</button>
        </div>
      </div>
    </div>
  );
}

// ─── Dataset Detail Panel ─────────────────────────────────────────────────────

const DETAIL_ITEMS = [
  { id: 'item_001', input: '2型糖尿病有哪些症状？', reference: '多饮、多尿、疲劳、视力模糊、伤口愈合缓慢。', version: 'v3' },
  { id: 'item_002', input: '二甲双胍可以与布洛芬同服吗？', reference: '请咨询医生。联合使用可能影响肾功能。', version: 'v3' },
  { id: 'item_003', input: '高血压的一线治疗方案是什么？', reference: '生活方式改变加 ACE 抑制剂或 ARB 作为一线药物治疗。', version: 'v2' },
  { id: 'item_004', input: '急性阑尾炎的体征有哪些？', reference: '右下腹痛、反跳痛、发热、恶心、白细胞升高。', version: 'v3' },
  { id: 'item_005', input: '正常空腹血糖范围是多少？', reference: '70-99 mg/dL（3.9-5.5 mmol/L）。糖尿病前期：100-125 mg/dL。', version: 'v1' },
];

function DatasetDetailPanel({
  dataset,
  onClose,
  onEdit,
}: {
  dataset: Dataset;
  onClose: () => void;
  onEdit: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'data' | 'versions' | 'info'>('data');

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-[700px] bg-white border-l border-slate-200 flex flex-col shadow-2xl overflow-hidden">
        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-600" />
              <h3 className="text-slate-900">{dataset.name}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryColors[dataset.category]}`}>{categoryLabels[dataset.category]}</span>
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-mono">{dataset.version}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sourceColors[dataset.source]}`}>{sourceLabels[dataset.source]}</span>
            </div>
            <div className="text-xs text-slate-400 mt-1">{dataset.itemCount} 条数据 · 创建于 {dataset.createdAt}</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
              <Edit2 className="w-3.5 h-3.5" /> 编辑
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-4 h-4" /></button>
          </div>
        </div>

        {/* tabs */}
        <div className="flex border-b border-slate-200 px-5">
          {[
            { key: 'data', label: '数据列表' },
            { key: 'versions', label: '版本历史' },
            { key: 'info', label: '基本信息' },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key as typeof activeTab)}
              className={`px-4 py-2.5 text-sm border-b-2 transition-colors ${activeTab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* data tab */}
          {activeTab === 'data' && (
            <div>
              <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input placeholder="搜索数据..." className="w-full pl-8 pr-4 py-1.5 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500" />
                </div>
                <button className="px-3 py-1.5 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50">添加数据</button>
              </div>
              <div className="divide-y divide-slate-100">
                {DETAIL_ITEMS.map(item => (
                  <div key={item.id} className="px-5 py-4 hover:bg-slate-50 cursor-pointer">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono text-slate-400">{item.id}</span>
                      <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">{item.version}</span>
                    </div>
                    <div className="text-sm text-slate-800 mb-1.5 font-medium">{item.input}</div>
                    <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2.5 leading-relaxed">{item.reference}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* versions tab */}
          {activeTab === 'versions' && (
            <div className="p-5 space-y-3">
              {[
                { version: 'v3', date: '2026-05-15', changes: '新增 12 条，修正 3 条', author: '陈小丽' },
                { version: 'v2', date: '2026-04-22', changes: '从标注任务导入 45 条数据', author: '张明博' },
                { version: 'v1', date: '2026-04-01', changes: '初始 CSV 导入（143 条）', author: '陈小丽' },
              ].map(v => (
                <div key={v.version} className="p-4 border border-slate-200 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-blue-600">{v.version}</span>
                      <span className="text-xs text-slate-500">{v.date} · {v.author}</span>
                    </div>
                    <button className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 border border-slate-200 rounded-lg">回滚</button>
                  </div>
                  <div className="text-sm text-slate-600">{v.changes}</div>
                </div>
              ))}
            </div>
          )}

          {/* info tab */}
          {activeTab === 'info' && (
            <div className="p-5 space-y-4">
              {dataset.description && (
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">描述</div>
                  <div className="text-sm text-slate-700 leading-relaxed">{dataset.description}</div>
                </div>
              )}
              {dataset.metadata && Object.keys(dataset.metadata).length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">Metadata</div>
                  <div className="divide-y divide-slate-100">
                    {Object.entries(dataset.metadata).map(([k, v]) => (
                      <div key={k} className="grid grid-cols-2 gap-4 px-4 py-2.5">
                        <span className="text-xs font-mono text-slate-500">{k}</span>
                        <span className="text-xs font-mono text-slate-800">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">基本属性</div>
                {[
                  ['类型', categoryLabels[dataset.category]],
                  ['来源', sourceLabels[dataset.source]],
                  ['当前版本', dataset.version],
                  ['样本数', `${dataset.itemCount.toLocaleString()} 条`],
                  ['创建时间', dataset.createdAt],
                ].map(([k, v]) => (
                  <div key={k} className="grid grid-cols-2 gap-4 px-4 py-2.5 border-b last:border-0 border-slate-100">
                    <span className="text-xs text-slate-400">{k}</span>
                    <span className="text-xs text-slate-700">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">
            <Download className="w-3.5 h-3.5" /> 导出 JSON
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">
            <Download className="w-3.5 h-3.5" /> 导出 CSV
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function Datasets() {
  const [datasets, setDatasets] = useState<Dataset[]>(mockDatasets);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [editingDataset, setEditingDataset] = useState<Dataset | null | undefined>(undefined); // undefined=closed, null=create, Dataset=edit
  const [deletingDataset, setDeletingDataset] = useState<Dataset | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<DatasetCategory | 'all'>('all');

  function saveDataset(ds: Dataset) {
    setDatasets(prev => {
      const existing = prev.find(d => d.id === ds.id);
      if (existing) return prev.map(d => d.id === ds.id ? ds : d);
      return [ds, ...prev];
    });
    setSelectedDataset(ds);
    setEditingDataset(undefined);
  }

  function deleteDataset(id: string) {
    setDatasets(prev => prev.filter(d => d.id !== id));
    if (selectedDataset?.id === id) setSelectedDataset(null);
    setDeletingDataset(null);
  }

  function openEdit(ds: Dataset) {
    setSelectedDataset(null);
    setEditingDataset(ds);
  }

  function isConvertibleCategory(category: DatasetCategory): category is ConvertibleDatasetCategory {
    return convertibleCategories.includes(category as ConvertibleDatasetCategory);
  }

  function convertDatasetCategory(id: string, category: ConvertibleDatasetCategory) {
    setDatasets(prev => prev.map(ds => ds.id === id ? { ...ds, category } : ds));
    setSelectedDataset(prev => prev?.id === id ? { ...prev, category } : prev);
  }

  const allNames = datasets.map(d => d.name);
  const totalItems = datasets.reduce((s, d) => s + d.itemCount, 0);
  const filteredDatasets = categoryFilter === 'all'
    ? datasets
    : datasets.filter(d => d.category === categoryFilter);

  return (
    <div>
      <PageHeader
        title="数据集管理"
        description="统一管理评测集、BadCase 集、黄金集和异常集，支撑自动评测、人工标注和回归验证"
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">
              <Upload className="w-4 h-4" /> 导入
            </button>
            <button onClick={() => setEditingDataset(null)}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
              <Plus className="w-4 h-4" /> 新建数据集
            </button>
          </div>
        }
      />

      <div className="p-6">
        {/* stats */}
        <div className="grid grid-cols-6 gap-4 mb-6">
          {[
            { label: '数据集总数', value: datasets.length.toString() },
            { label: '评测集', value: datasets.filter(d => d.category === 'evaluation').length.toString() },
            { label: 'BadCase 集', value: datasets.filter(d => d.category === 'badcase').length.toString() },
            { label: '黄金集', value: datasets.filter(d => d.category === 'golden').length.toString() },
            { label: '异常集', value: datasets.filter(d => d.category === 'anomaly').length.toString() },
            { label: '数据总条数', value: totalItems.toLocaleString() },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-xs text-slate-500 mb-1">{s.label}</div>
              <div className="text-2xl font-bold text-slate-800">{s.value}</div>
            </div>
          ))}
        </div>

        <div className="mb-4 flex items-center gap-2">
          {[
            { key: 'all' as const, label: '全部' },
            { key: 'evaluation' as const, label: '评测集' },
            { key: 'badcase' as const, label: 'BadCase 集' },
            { key: 'golden' as const, label: '黄金集' },
            { key: 'anomaly' as const, label: '异常集' },
          ].map(item => (
            <button
              key={item.key}
              onClick={() => setCategoryFilter(item.key)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                categoryFilter === item.key
                  ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">数据集名称</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">类型</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">来源</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">样本数</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">当前版本</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">创建时间</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDatasets.map(ds => (
                <tr key={ds.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4">
                    <button onClick={() => setSelectedDataset(ds)}
                      className="flex items-start gap-2 text-left group">
                      <Database className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="text-sm text-blue-600 group-hover:text-blue-700 font-medium">{ds.name}</div>
                        {ds.description && (
                          <div className="text-xs text-slate-400 mt-0.5 max-w-xs truncate">{ds.description}</div>
                        )}
                      </div>
                    </button>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryColors[ds.category]}`}>
                      {categoryLabels[ds.category]}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sourceColors[ds.source]}`}>
                      {sourceLabels[ds.source]}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right text-sm text-slate-700 font-mono">{ds.itemCount.toLocaleString()}</td>
                  <td className="px-5 py-4">
                    <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{ds.version}</span>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-500">{ds.createdAt}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <select
                        value=""
                        disabled={!isConvertibleCategory(ds.category)}
                        onChange={e => {
                          if (!e.target.value) return;
                          convertDatasetCategory(ds.id, e.target.value as ConvertibleDatasetCategory);
                        }}
                        className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600 outline-none hover:border-slate-300 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-300"
                        title={isConvertibleCategory(ds.category) ? '转换数据集类型' : '异常集暂不参与互转'}
                      >
                        <option value="">{isConvertibleCategory(ds.category) ? '转换为' : '不可转换'}</option>
                        {convertibleCategories
                          .filter(category => category !== ds.category)
                          .map(category => (
                            <option key={category} value={category}>
                              {categoryLabels[category]}
                            </option>
                          ))}
                      </select>
                      <button onClick={() => setSelectedDataset(ds)}
                        className="px-2.5 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                        查看
                      </button>
                      <button onClick={() => openEdit(ds)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600" title="编辑">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600" title="导出">
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeletingDataset(ds)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500" title="删除">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* detail panel */}
      {selectedDataset && (
        <DatasetDetailPanel
          dataset={selectedDataset}
          onClose={() => setSelectedDataset(null)}
          onEdit={() => openEdit(selectedDataset)}
        />
      )}

      {/* create / edit modal */}
      {editingDataset !== undefined && (
        <CreateEditModal
          existing={editingDataset ?? undefined}
          allNames={allNames}
          onClose={() => setEditingDataset(undefined)}
          onSave={saveDataset}
        />
      )}

      {/* delete confirm */}
      {deletingDataset && (
        <DeleteConfirm
          dataset={deletingDataset}
          onClose={() => setDeletingDataset(null)}
          onConfirm={() => deleteDataset(deletingDataset.id)}
        />
      )}

      {/* import modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-slate-900">导入数据集</h2>
              <button onClick={() => setShowImport(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center mb-4">
              <Upload className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500 mb-2">将 JSON 或 CSV 文件拖拽到此处</p>
              <button className="text-sm text-blue-600 hover:text-blue-700">或点击选择文件</button>
              <div className="text-xs text-slate-400 mt-2">支持格式：JSON、NDJSON、CSV</div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setShowImport(false)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">取消</button>
              <button onClick={() => setShowImport(false)} className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700">确认导入</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
