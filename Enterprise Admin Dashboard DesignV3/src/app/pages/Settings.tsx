import { useState, useRef } from 'react';
import { Key, Plus, Eye, EyeOff, Trash2, Copy, Check, Plug, BarChart3, Settings2, AlertCircle, X, Edit2, GripVertical, ToggleLeft, ToggleRight, ChevronDown } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { useApp } from '../context/AppContext';

const apiKeys = [
  { id: 'k1', name: '生产环境 Key', prefix: '...a3f2', permission: 'write', createdAt: '2026-05-01', lastUsed: '2026-06-09' },
  { id: 'k2', name: '调试 Key', prefix: '...b7c1', permission: 'read', createdAt: '2026-05-10', lastUsed: '2026-05-15' },
];

const connections = [
  { id: 'c1', name: '生产 OpenAI 连接', provider: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini'], status: 'connected' },
  { id: 'c2', name: 'Anthropic 主连接', provider: 'Anthropic', models: ['claude-3-5-sonnet', 'claude-3-haiku'], status: 'connected' },
  { id: 'c3', name: 'Gemini 预览连接', provider: 'Google Gemini', models: ['gemini-1.5-pro'], status: 'error' },
];

// ─── Metrics types ────────────────────────────────────────────────────────────

type MetricType = 'numeric' | 'categorical' | 'boolean';
type MetricStatus = 'enabled' | 'disabled';

interface Metric {
  id: string;
  name: string;
  type: MetricType;
  description: string;
  status: MetricStatus;
  weight: number;
  isDefault: boolean;
  options?: string[];
}

const DEFAULT_METRICS: Metric[] = [
  { id: 'm1', name: '准确性', type: 'numeric', description: '回答的事实正确性', status: 'enabled', weight: 30, isDefault: true },
  { id: 'm2', name: '相关性', type: 'numeric', description: '回答是否切题', status: 'enabled', weight: 25, isDefault: true },
  { id: 'm3', name: '安全性', type: 'numeric', description: '是否有害或不当内容', status: 'enabled', weight: 25, isDefault: true },
  { id: 'm4', name: '完整性', type: 'numeric', description: '回答是否完整覆盖问题', status: 'enabled', weight: 20, isDefault: true },
];

const TYPE_LABELS: Record<MetricType, string> = {
  numeric: '数字',
  categorical: '分类',
  boolean: '布尔',
};

const TYPE_COLORS: Record<MetricType, string> = {
  numeric: 'bg-blue-100 text-blue-700',
  categorical: 'bg-purple-100 text-purple-700',
  boolean: 'bg-teal-100 text-teal-700',
};

const API_PERMISSION_LABELS: Record<string, string> = {
  write: '读写',
  read: '只读',
};

function GeneralTab() {
  const { currentProject } = useApp();
  return (
    <div className="max-w-2xl space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">项目信息</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-600 mb-1.5">项目名称</label>
            <input defaultValue={currentProject?.name} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1.5">项目描述</label>
            <textarea defaultValue={currentProject?.description} rows={3}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-600 mb-1.5">时区</label>
              <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500">
                <option>UTC+8 (Asia/Shanghai)</option>
                <option>UTC-5 (America/New_York)</option>
                <option>UTC+0 (UTC)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1.5">Trace 保留天数</label>
              <input type="number" defaultValue="90" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">告警设置</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-600 mb-1.5">错误率阈值</label>
              <div className="flex items-center gap-2">
                <input type="number" defaultValue="5" className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" />
                <span className="text-sm text-slate-500">%</span>
              </div>
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1.5">告警渠道</label>
              <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500">
                <option>邮件</option>
                <option>Webhook</option>
                <option>不通知</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1.5">Webhook 地址</label>
            <input placeholder="https://hooks.slack.com/..." className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button className="px-5 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700">保存修改</button>
      </div>
    </div>
  );
}

function APIKeysTab() {
  const [showNewKey, setShowNewKey] = useState(false);
  const [newKeyVisible, setNewKeyVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-amber-800 space-y-1">
          <div className="font-medium">安全建议</div>
          <ul className="list-disc list-inside text-xs space-y-0.5 text-amber-700">
            <li>不要在客户端代码中暴露 API Key</li>
            <li>使用环境变量或密钥管理服务保存凭据</li>
            <li>定期轮换 Key，并撤销不再使用的 Key</li>
          </ul>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-700">API Key</h3>
          <button onClick={() => setShowNewKey(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700">
            <Plus className="w-4 h-4" /> 新建 API Key
          </button>
        </div>

        {showNewKey && (
          <div className="px-5 py-4 bg-blue-50 border-b border-blue-200">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-blue-800">已创建新的 API Key</h4>
              <button onClick={() => setShowNewKey(false)} className="text-blue-500 hover:text-blue-700"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex items-center gap-2 bg-white rounded-lg border border-blue-200 px-3 py-2">
              <Key className="w-4 h-4 text-blue-500 flex-shrink-0" />
              <span className="text-sm font-mono text-slate-700 flex-1">
                {newKeyVisible ? 'oiq_prod_a3f2b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2' : 'oiq_prod_••••••••••••••••••••••••••••••••••••'}
              </span>
              <button onClick={() => setNewKeyVisible(v => !v)} className="text-slate-400 hover:text-slate-600">
                {newKeyVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button onClick={handleCopy} className="text-slate-400 hover:text-slate-600">
                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-blue-700 mt-2">此 Key 仅展示一次，请立即妥善保存。</p>
          </div>
        )}

        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">名称</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Key 后缀</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">权限</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">创建时间</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">最近使用</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {apiKeys.map(k => (
              <tr key={k.id} className="hover:bg-slate-50">
                <td className="px-5 py-4 text-sm font-mono text-slate-800">{k.name}</td>
                <td className="px-5 py-4 text-sm font-mono text-slate-500">{k.prefix}</td>
                <td className="px-5 py-4">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${k.permission === 'write' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                    {API_PERMISSION_LABELS[k.permission] ?? k.permission}
                  </span>
                </td>
                <td className="px-5 py-4 text-sm text-slate-500">{k.createdAt}</td>
                <td className="px-5 py-4 text-sm text-slate-500">{k.lastUsed}</td>
                <td className="px-5 py-4">
                  <div className="flex items-center justify-end gap-1">
                    <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"><Copy className="w-4 h-4" /></button>
                    <button className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConnectionsTab() {
  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex justify-end">
        <button className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
          <Plus className="w-4 h-4" /> 添加连接
        </button>
      </div>

      <div className="space-y-3">
        {connections.map(conn => (
          <div key={conn.id} className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full mt-0.5 ${conn.status === 'connected' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                <div>
                  <div className="text-sm font-semibold text-slate-800">{conn.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{conn.provider} · {conn.status === 'connected' ? '已连接' : '连接异常'}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">编辑</button>
                <button className="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50">移除</button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {conn.models.map(m => (
                <span key={m} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-mono">{m}</span>
              ))}
            </div>
            {conn.status === 'error' && (
              <div className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                API Key 校验失败，请检查凭据配置。
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-dashed border-slate-300 p-6 text-center">
        <Plug className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500 mb-3">添加更多 LLM 服务商</p>
        <div className="flex flex-wrap justify-center gap-2">
          {['OpenAI', 'Anthropic', 'Google Gemini', 'Amazon Bedrock', '自定义 API'].map(p => (
            <button key={p} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">{p}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Metric Modal ─────────────────────────────────────────────────────────────

function MetricModal({
  existing,
  isDefault,
  allNames,
  onClose,
  onSave,
}: {
  existing?: Metric;
  isDefault: boolean;
  allNames: string[];
  onClose: () => void;
  onSave: (m: Metric) => void;
}) {
  const isEdit = !!existing;
  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<MetricType>(existing?.type ?? 'numeric');
  const [desc, setDesc] = useState(existing?.description ?? '');
  const [status, setStatus] = useState<MetricStatus>(existing?.status ?? 'enabled');
  const [options, setOptions] = useState<string[]>(existing?.options ?? ['优', '良', '差']);
  const [newOpt, setNewOpt] = useState('');
  const dragIdx = useRef<number | null>(null);

  // auto-fill description for boolean
  function handleTypeChange(t: MetricType) {
    setType(t);
    if (t === 'boolean' && !desc.trim()) setDesc('是否为真');
  }

  function addOption() {
    if (!newOpt.trim() || options.length >= 10) return;
    setOptions(prev => [...prev, newOpt.trim()]);
    setNewOpt('');
  }

  function removeOption(i: number) {
    setOptions(prev => prev.filter((_, idx) => idx !== i));
  }

  function updateOption(i: number, v: string) {
    setOptions(prev => prev.map((o, idx) => idx === i ? v : o));
  }

  // drag-sort options
  function onOptDragStart(i: number) { dragIdx.current = i; }
  function onOptDrop(i: number) {
    if (dragIdx.current === null || dragIdx.current === i) return;
    const arr = [...options];
    const [item] = arr.splice(dragIdx.current, 1);
    arr.splice(i, 0, item);
    setOptions(arr);
    dragIdx.current = null;
  }

  const takenNames = allNames.filter(n => n !== existing?.name);
  const nameError = !name.trim()
    ? '名称不能为空'
    : name.length > 50
      ? '不超过 50 字符'
      : takenNames.includes(name.trim())
        ? '与现有指标重名'
        : '';
  const descError = desc.length > 200 ? '不超过 200 字符' : '';
  const optError = type === 'categorical' && options.filter(o => o.trim()).length < 2
    ? '至少配置 2 个分类选项'
    : '';

  const canSave = !nameError && !descError && !optError;

  function handleSave() {
    if (!canSave) return;
    onSave({
      id: existing?.id ?? `m_${Date.now()}`,
      name: name.trim(),
      type,
      description: desc.trim(),
      status,
      weight: existing?.weight ?? 0,
      isDefault: existing?.isDefault ?? false,
      options: type === 'categorical' ? options.filter(o => o.trim()) : undefined,
    });
  }

  const readonlyField = isEdit && isDefault;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-slate-900">{isEdit ? '编辑指标' : '新增指标'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* name */}
          <div>
            <label className="block text-sm text-slate-600 mb-1.5">
              指标名称 <span className="text-red-500">*</span>
              {readonlyField && <span className="ml-2 text-xs text-slate-400">（默认指标不可修改）</span>}
            </label>
            <input
              value={name}
              onChange={e => !readonlyField && setName(e.target.value)}
              readOnly={readonlyField}
              maxLength={55}
              placeholder="例如：流利性"
              className={`w-full border rounded-lg px-3 py-2 text-sm outline-none ${
                readonlyField
                  ? 'bg-slate-50 text-slate-500 cursor-not-allowed border-slate-200'
                  : nameError && name !== ''
                    ? 'border-red-300 bg-red-50 focus:border-red-400'
                    : 'border-slate-200 focus:border-blue-500'
              }`}
            />
            <div className="flex items-center justify-between mt-1">
              {nameError && name !== ''
                ? <span className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{nameError}</span>
                : <span />}
              <span className={`text-xs ${name.length > 50 ? 'text-red-500' : 'text-slate-400'}`}>{name.length}/50</span>
            </div>
          </div>

          {/* type */}
          <div>
            <label className="block text-sm text-slate-600 mb-1.5">
              数据类型 <span className="text-red-500">*</span>
              {readonlyField && <span className="ml-2 text-xs text-slate-400">（默认指标不可修改）</span>}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['numeric', 'categorical', 'boolean'] as MetricType[]).map(t => (
                <button
                  key={t}
                  onClick={() => !readonlyField && handleTypeChange(t)}
                  disabled={readonlyField}
                  className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    type === t
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : readonlyField
                        ? 'border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
            <div className="mt-1.5 text-xs text-slate-400">
              {type === 'numeric' && '数字：整数或浮点数，支持范围约束（默认 0-10）'}
              {type === 'categorical' && '分类：从预定义选项中选择一项'}
              {type === 'boolean' && '布尔：是/否二值判断'}
            </div>
          </div>

          {/* categorical options */}
          {type === 'categorical' && (
            <div>
              <label className="block text-sm text-slate-600 mb-2">
                分类选项 <span className="text-red-500">*</span>
                <span className="ml-2 text-xs text-slate-400">（至少 2 个，最多 10 个，可拖拽排序）</span>
              </label>
              <div className="space-y-1.5 mb-2">
                {options.map((opt, i) => (
                  <div
                    key={i}
                    draggable
                    onDragStart={() => onOptDragStart(i)}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => onOptDrop(i)}
                    className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200 cursor-grab active:cursor-grabbing"
                  >
                    <GripVertical className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                    <input
                      value={opt}
                      onChange={e => updateOption(i, e.target.value)}
                      className="flex-1 bg-transparent text-sm outline-none text-slate-700"
                    />
                    <button onClick={() => removeOption(i)} className="text-slate-300 hover:text-red-400 flex-shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              {options.length < 10 && (
                <div className="flex gap-2">
                  <input
                    value={newOpt}
                    onChange={e => setNewOpt(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addOption()}
                    placeholder="输入选项后按 Enter 或点击添加"
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-500"
                  />
                  <button onClick={addOption} className="px-3 py-1.5 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 flex-shrink-0">
                    添加
                  </button>
                </div>
              )}
              {optError && <div className="mt-1.5 text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{optError}</div>}
            </div>
          )}

          {/* description */}
          <div>
            <label className="block text-sm text-slate-600 mb-1.5">描述（选填）</label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              rows={2}
              maxLength={210}
              placeholder="指标的详细说明，帮助标注者理解评分标准..."
              className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 resize-none ${descError ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}
            />
            <div className="flex items-center justify-between mt-1">
              {descError
                ? <span className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{descError}</span>
                : <span />}
              <span className={`text-xs ${desc.length > 200 ? 'text-red-500' : 'text-slate-400'}`}>{desc.length}/200</span>
            </div>
          </div>

          {/* status */}
          <div>
            <label className="block text-sm text-slate-600 mb-2">状态</label>
            <div className="flex gap-3">
              {(['enabled', 'disabled'] as MetricStatus[]).map(s => (
                <label key={s} className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors ${
                  status === s ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}>
                  <input type="radio" checked={status === s} onChange={() => setStatus(s)} className="accent-blue-600" />
                  <span className="text-sm">{s === 'enabled' ? '已启用' : '已停用'}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">取消</button>
          <button onClick={handleSave} disabled={!canSave || !name.trim()}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
            {isEdit ? '保存修改' : '确认新增'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Confirm ────────────────────────────────────────────────────────────

function MetricDeleteConfirm({ metric, onClose, onConfirm }: {
  metric: Metric; onClose: () => void; onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="text-slate-900 mb-1">删除指标</h3>
            <p className="text-sm text-slate-500">确定删除指标 <span className="font-semibold text-slate-700">「{metric.name}」</span> 吗？该操作不可撤销。</p>
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

// ─── Metrics Tab ──────────────────────────────────────────────────────────────

function MetricsTab() {
  const [metrics, setMetrics] = useState<Metric[]>(DEFAULT_METRICS);
  const [editingMetric, setEditingMetric] = useState<Metric | null | undefined>(undefined);
  const [deletingMetric, setDeletingMetric] = useState<Metric | null>(null);

  // drag state for custom metric reorder
  const dragId = useRef<string | null>(null);

  const defaultMetrics = metrics.filter(m => m.isDefault);
  const customMetrics = metrics.filter(m => !m.isDefault);
  const enabledMetrics = metrics.filter(m => m.status === 'enabled');
  const totalWeight = enabledMetrics.reduce((s, m) => s + m.weight, 0);
  const weightOk = totalWeight === 100;

  function toggleStatus(id: string) {
    setMetrics(prev => prev.map(m => m.id === id ? { ...m, status: m.status === 'enabled' ? 'disabled' : 'enabled' } : m));
  }

  function setWeight(id: string, w: number) {
    setMetrics(prev => prev.map(m => m.id === id ? { ...m, weight: w } : m));
  }

  function saveMetric(updated: Metric) {
    setMetrics(prev => {
      const idx = prev.findIndex(m => m.id === updated.id);
      if (idx >= 0) return prev.map(m => m.id === updated.id ? updated : m);
      return [...prev, updated];
    });
    setEditingMetric(undefined);
  }

  function deleteMetric(id: string) {
    setMetrics(prev => prev.filter(m => m.id !== id));
    setDeletingMetric(null);
  }

  function onCustomDragStart(id: string) { dragId.current = id; }
  function onCustomDrop(targetId: string) {
    if (!dragId.current || dragId.current === targetId) return;
    setMetrics(prev => {
      const customs = prev.filter(m => !m.isDefault);
      const defaults = prev.filter(m => m.isDefault);
      const fromIdx = customs.findIndex(m => m.id === dragId.current);
      const toIdx = customs.findIndex(m => m.id === targetId);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const arr = [...customs];
      const [item] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, item);
      return [...defaults, ...arr];
    });
    dragId.current = null;
  }

  const allNames = metrics.map(m => m.name);

  return (
    <div className="max-w-3xl space-y-5">
      {/* metric list */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">评分指标列表</h3>
            <div className="text-xs text-slate-400 mt-0.5">默认指标固定在顶部，自定义指标支持拖拽排序</div>
          </div>
          <button onClick={() => setEditingMetric(null)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700">
            <Plus className="w-4 h-4" /> 新增指标
          </button>
        </div>

        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="w-6 px-3" />
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">指标名称</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">数据类型</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">描述</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">状态</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {/* default metrics */}
            {defaultMetrics.map(m => (
              <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-3 py-4 text-center">
                  <div className="w-4 h-4 rounded-sm bg-blue-100 flex items-center justify-center mx-auto" title="默认指标">
                    <span className="text-blue-500 text-xs leading-none">★</span>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <span className="text-sm font-medium text-slate-800">{m.name}</span>
                  <span className="ml-2 text-xs text-slate-400">默认</span>
                </td>
                <td className="px-4 py-4">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[m.type]}`}>{TYPE_LABELS[m.type]}</span>
                </td>
                <td className="px-4 py-4 text-sm text-slate-500 max-w-xs truncate">{m.description || <span className="text-slate-300">—</span>}</td>
                <td className="px-4 py-4 text-center">
                  <button onClick={() => toggleStatus(m.id)} className="inline-flex items-center gap-1.5 group">
                    {m.status === 'enabled'
                      ? <ToggleRight className="w-6 h-6 text-blue-600 group-hover:text-blue-700" />
                      : <ToggleLeft className="w-6 h-6 text-slate-300 group-hover:text-slate-400" />}
                    <span className={`text-xs ${m.status === 'enabled' ? 'text-blue-600' : 'text-slate-400'}`}>
                      {m.status === 'enabled' ? '已启用' : '已停用'}
                    </span>
                  </button>
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => setEditingMetric(m)}
                      title="编辑（默认指标仅可编辑描述和状态）"
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button disabled title="默认指标不可删除"
                      className="p-1.5 rounded-lg text-slate-200 cursor-not-allowed">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {/* custom metrics (draggable) */}
            {customMetrics.map(m => (
              <tr key={m.id}
                draggable
                onDragStart={() => onCustomDragStart(m.id)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => onCustomDrop(m.id)}
                className="hover:bg-slate-50 transition-colors cursor-grab active:cursor-grabbing active:bg-blue-50/40"
              >
                <td className="px-3 py-4 text-center">
                  <GripVertical className="w-4 h-4 text-slate-300 mx-auto" />
                </td>
                <td className="px-4 py-4">
                  <span className="text-sm font-medium text-slate-800">{m.name}</span>
                  {m.type === 'categorical' && m.options && (
                    <div className="flex gap-1 mt-1">
                      {m.options.map(o => (
                        <span key={o} className="text-xs bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded">{o}</span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-4">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[m.type]}`}>{TYPE_LABELS[m.type]}</span>
                </td>
                <td className="px-4 py-4 text-sm text-slate-500 max-w-xs truncate">{m.description || <span className="text-slate-300">—</span>}</td>
                <td className="px-4 py-4 text-center">
                  <button onClick={() => toggleStatus(m.id)} className="inline-flex items-center gap-1.5 group">
                    {m.status === 'enabled'
                      ? <ToggleRight className="w-6 h-6 text-blue-600 group-hover:text-blue-700" />
                      : <ToggleLeft className="w-6 h-6 text-slate-300 group-hover:text-slate-400" />}
                    <span className={`text-xs ${m.status === 'enabled' ? 'text-blue-600' : 'text-slate-400'}`}>
                      {m.status === 'enabled' ? '已启用' : '已停用'}
                    </span>
                  </button>
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => setEditingMetric(m)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeletingMetric(m)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {customMetrics.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-center text-xs text-slate-400">
                  暂无自定义指标，点击「新增指标」添加
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* weight config */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">权重配置</h3>
            <div className="text-xs text-slate-400 mt-0.5">仅已启用指标参与计算，权重总和须等于 100%</div>
          </div>
          <div className={`flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg ${
            weightOk ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'
          }`}>
            {weightOk ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            总计：{totalWeight}%
          </div>
        </div>

        {enabledMetrics.length === 0 ? (
          <div className="text-center py-6 text-sm text-slate-400">无已启用指标</div>
        ) : (
          <div className="space-y-4">
            {enabledMetrics.map(m => (
              <div key={m.id} className="flex items-center gap-4">
                <div className="w-24 flex-shrink-0 flex items-center gap-1.5">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${TYPE_COLORS[m.type]}`}>{TYPE_LABELS[m.type][0]}</span>
                  <span className="text-sm text-slate-700 truncate">{m.name}</span>
                </div>
                <div className="flex-1">
                  <div className="relative">
                    <input
                      type="range" min={0} max={100} step={1} value={m.weight}
                      onChange={e => setWeight(m.id, Number(e.target.value))}
                      className="w-full accent-blue-600"
                    />
                    <div className="flex justify-between text-xs text-slate-300 -mt-0.5">
                      <span>0%</span><span>50%</span><span>100%</span>
                    </div>
                  </div>
                </div>
                <div className="w-14 flex items-center gap-1 flex-shrink-0">
                  <input
                    type="number" min={0} max={100} value={m.weight}
                    onChange={e => setWeight(m.id, Math.max(0, Math.min(100, Number(e.target.value))))}
                    className="w-12 border border-slate-200 rounded px-1.5 py-1 text-sm text-center outline-none focus:border-blue-500"
                  />
                  <span className="text-xs text-slate-400">%</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {!weightOk && enabledMetrics.length > 0 && (
          <div className="mt-4 flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            权重总和为 {totalWeight}%，须等于 100% 才可保存
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button disabled={!weightOk}
          className="px-5 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
          保存评分指标
        </button>
      </div>

      {/* modal */}
      {editingMetric !== undefined && (
        <MetricModal
          existing={editingMetric ?? undefined}
          isDefault={editingMetric?.isDefault ?? false}
          allNames={allNames}
          onClose={() => setEditingMetric(undefined)}
          onSave={saveMetric}
        />
      )}

      {deletingMetric && (
        <MetricDeleteConfirm
          metric={deletingMetric}
          onClose={() => setDeletingMetric(null)}
          onConfirm={() => deleteMetric(deletingMetric.id)}
        />
      )}
    </div>
  );
}

export function Settings() {
  const [activeTab, setActiveTab] = useState<'general' | 'apikeys' | 'connections' | 'metrics'>('general');

  const tabs = [
    { key: 'general', label: '通用设置', icon: <Settings2 className="w-4 h-4" /> },
    { key: 'apikeys', label: 'API Key', icon: <Key className="w-4 h-4" /> },
    { key: 'connections', label: '模型连接', icon: <Plug className="w-4 h-4" /> },
    { key: 'metrics', label: '评分指标', icon: <BarChart3 className="w-4 h-4" /> },
  ] as const;

  return (
    <div>
      <PageHeader title="项目设置" description="配置项目行为、模型集成与评分指标" />

      <div className="flex border-b border-slate-200 bg-white px-6">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm border-b-2 transition-colors ${
              activeTab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="p-6">
        {activeTab === 'general' && <GeneralTab />}
        {activeTab === 'apikeys' && <APIKeysTab />}
        {activeTab === 'connections' && <ConnectionsTab />}
        {activeTab === 'metrics' && <MetricsTab />}
      </div>
    </div>
  );
}
