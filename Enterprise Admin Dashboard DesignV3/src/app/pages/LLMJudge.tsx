import { useState, useEffect, useRef } from 'react';
import {
  Plus, Search, Pause, Eye, X, ChevronRight, ChevronDown, ChevronUp,
  Zap, Square, CheckSquare, Minus, AlertCircle, Clock,
  Database, Filter, SlidersHorizontal, RefreshCw, Play,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import {
  mockLLMJudgeTasks, mockEvaluators, mockDatasets, mockTraces,
  LLMJudgeTask, FilterCondition, DatasetCategory,
} from '../data/mockData';

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function pct(progress: number, total: number) {
  if (total === 0) return 0;
  return Math.round((progress / total) * 100);
}

const datasetCategoryLabels: Record<DatasetCategory, string> = {
  evaluation: '评测集',
  badcase: 'BadCase 集',
  golden: '黄金集',
  anomaly: '异常集',
};

// ─── Task Detail Panel ────────────────────────────────────────────────────────

const LOG_LINES = [
  { ts: '14:31:02', id: 'item_001', status: '✅ 完成', ms: 1823, score: 8.2 },
  { ts: '14:31:05', id: 'item_002', status: '✅ 完成', ms: 2104, score: 7.4 },
  { ts: '14:31:08', id: 'item_003', status: '✅ 完成', ms: 1567, score: 9.1 },
  { ts: '14:31:11', id: 'item_004', status: '❌ 失败', ms: 5002, score: 0 },
  { ts: '14:31:14', id: 'item_005', status: '🔄 重试', ms: 3200, score: 6.8 },
  { ts: '14:31:17', id: 'item_006', status: '✅ 完成', ms: 1900, score: 7.9 },
  { ts: '14:31:20', id: 'item_007', status: '✅ 完成', ms: 2341, score: 8.5 },
  { ts: '14:31:23', id: 'item_008', status: '✅ 完成', ms: 1231, score: 9.0 },
];

function TaskDetailPanel({ task, onClose }: { task: LLMJudgeTask; onClose: () => void }) {
  const [logsOpen, setLogsOpen] = useState(true);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-[700px] bg-white border-l border-slate-200 flex flex-col shadow-2xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <StatusBadge status={task.status} />
              <h3 className="text-slate-900">{task.name}</h3>
            </div>
            <div className="text-xs text-slate-400">
              创建于 {formatTime(task.createdAt)}
              {task.startedAt && <> · 开始于 {formatTime(task.startedAt)}</>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 mt-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {task.status === 'running' && (
            <div className="bg-blue-50 rounded-xl border border-blue-100 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-700">执行进度</span>
                <span className="text-sm font-bold text-blue-700 font-mono">
                  {task.progress}/{task.total}（{pct(task.progress, task.total)}%）
                </span>
              </div>
              <div className="w-full h-2.5 bg-blue-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-500"
                  style={{ width: `${pct(task.progress, task.total)}%` }}
                />
              </div>
              {task.avgScore != null && (
                <div className="mt-2 text-xs text-blue-500">
                  当前平均分：<span className="font-semibold">{task.avgScore}/10</span>
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">评估器信息</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-slate-400 mb-0.5">评估器名称</div>
                <div className="text-sm font-mono text-slate-800">{task.evaluatorName}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-0.5">Judge 模型</div>
                <div className="text-sm font-mono text-slate-800">{task.judgeModel}</div>
              </div>
              <div className="col-span-2">
                <div className="text-xs text-slate-400 mb-1.5">评分维度</div>
                <div className="flex flex-wrap gap-1.5">
                  {task.dimensions.map(d => (
                    <span key={d} className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100">{d}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">执行参数</h4>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 bg-slate-50 rounded-lg">
                <div className="text-lg font-bold text-slate-800">{task.concurrency}</div>
                <div className="text-xs text-slate-500 mt-0.5">并发数</div>
              </div>
              <div className="text-center p-3 bg-slate-50 rounded-lg">
                <div className="text-lg font-bold text-slate-800">{task.retries}</div>
                <div className="text-xs text-slate-500 mt-0.5">重试次数</div>
              </div>
              <div className="text-center p-3 bg-slate-50 rounded-lg">
                <div className={`text-lg font-bold ${task.cacheEnabled ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {task.cacheEnabled ? '开启' : '关闭'}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">结果缓存</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">数据集信息</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-slate-400 mb-0.5">数据集</div>
                <div className="text-sm font-mono text-blue-600">{task.datasetName}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-0.5">版本快照</div>
                <div className="text-sm font-mono text-slate-700">{task.datasetVersion}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-0.5">采样方式</div>
                <div className="text-sm text-slate-700">
                  {task.samplingMethod}
                  {task.samplingValue != null
                    ? `（${task.samplingValue}${task.samplingMethod.includes('%') ? '%' : '条'}）`
                    : ''}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-0.5">实际执行条数</div>
                <div className="text-sm font-mono text-slate-700">{task.total} 条</div>
              </div>
            </div>
            {task.filterConditions.length > 0 && (
              <div className="mt-3">
                <div className="text-xs text-slate-400 mb-1.5">过滤条件</div>
                <div className="space-y-1">
                  {task.filterConditions.map(fc => (
                    <div key={fc.id} className="text-xs font-mono bg-slate-50 rounded-lg px-3 py-2 text-slate-600">
                      {fc.field} <span className="text-blue-600">{fc.operator}</span> "{fc.value}"
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <button
              onClick={() => setLogsOpen(o => !o)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <span>执行日志</span>
              {logsOpen
                ? <ChevronUp className="w-4 h-4 text-slate-400" />
                : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>
            {logsOpen && (
              <div className="bg-slate-950 max-h-64 overflow-y-auto">
                {LOG_LINES.map((line, i) => (
                  <div key={i}>
                    <div
                      onClick={() => setExpandedLog(expandedLog === line.id ? null : line.id)}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-slate-800 cursor-pointer transition-colors"
                    >
                      <span className="text-slate-500 text-xs font-mono shrink-0">{line.ts}</span>
                      <span className="text-slate-400 text-xs font-mono shrink-0">[{line.id}]</span>
                      <span className="text-xs font-mono shrink-0">{line.status}</span>
                      <span className="text-slate-500 text-xs font-mono shrink-0">{line.ms}ms</span>
                      <span className={`text-xs font-mono font-bold ${line.score >= 8 ? 'text-emerald-400' : line.score >= 6 ? 'text-amber-400' : 'text-red-400'}`}>
                        {line.score > 0 ? `评分: ${line.score}/10` : '—'}
                      </span>
                    </div>
                    {expandedLog === line.id && (
                      <div className="px-4 py-3 bg-slate-900 border-t border-slate-800 text-xs font-mono text-slate-300">
                        <div className="text-slate-400 mb-1">评测输出详情：</div>
                        <pre className="text-emerald-300">{JSON.stringify({
                          score: line.score,
                          reason: '回答准确，内容完整，逻辑清晰',
                          dimensions: { 准确性: line.score, 相关性: Math.min(10, line.score + 0.3) },
                        }, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Create Task Wizard ───────────────────────────────────────────────────────

const OPERATORS: FilterCondition['operator'][] = [
  '等于', '不等于', '包含', '不包含', '大于', '小于', '正则表达式',
];

const SAMPLING_METHODS: LLMJudgeTask['samplingMethod'][] = [
  '全量执行', '随机采样N条', '随机采样X%', '均匀采样', '分层采样',
];

type EvaluationDataSource = 'trace' | 'dataset';

function CreateTaskWizard({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (task: LLMJudgeTask) => void;
}) {
  const [step, setStep] = useState(1);
  const [taskName, setTaskName] = useState('');
  const [selectedEvaluators, setSelectedEvaluators] = useState<string[]>([]);
  const [dataSource, setDataSource] = useState<EvaluationDataSource>('dataset');
  const [selectedTraceIds, setSelectedTraceIds] = useState<string[]>(mockTraces.slice(0, 3).map(trace => trace.id));
  const [selectedDataset, setSelectedDataset] = useState('');
  const [filters, setFilters] = useState<FilterCondition[]>([]);
  const [filterLogic, setFilterLogic] = useState<'AND' | 'OR'>('AND');
  const [samplingMethod, setSamplingMethod] = useState<LLMJudgeTask['samplingMethod']>('全量执行');
  const [samplingValue, setSamplingValue] = useState(50);
  const [concurrency, setConcurrency] = useState(5);
  const [retries, setRetries] = useState(2);
  const [cacheEnabled, setCacheEnabled] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);

  const llmEvaluators = mockEvaluators.filter(e => e.type === 'llm_judge');
  const ds = mockDatasets.find(d => d.id === selectedDataset);
  const sourceCount = dataSource === 'trace' ? selectedTraceIds.length : ds?.itemCount ?? 0;

  function toggleEval(id: string) {
    setSelectedEvaluators(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  function toggleTrace(id: string) {
    setSelectedTraceIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  function addFilter() {
    setFilters(prev => [...prev, { id: `f${Date.now()}`, field: 'input', operator: '包含', value: '' }]);
  }

  function removeFilter(id: string) {
    setFilters(prev => prev.filter(f => f.id !== id));
  }

  function updateFilter(id: string, patch: Partial<FilterCondition>) {
    setFilters(prev => prev.map(f => (f.id === id ? { ...f, ...patch } : f)));
  }

  function estimatedCount() {
    const base = sourceCount;
    if (samplingMethod === '全量执行') return base;
    if (samplingMethod === '随机采样N条' || samplingMethod === '均匀采样') return Math.min(samplingValue, base);
    if (samplingMethod === '随机采样X%' || samplingMethod === '分层采样') return Math.round(base * samplingValue / 100);
    return base;
  }

  function handleCreate() {
    const ev = llmEvaluators.find(e => e.id === selectedEvaluators[0]);
    if (!ev || sourceCount === 0) return;
    const total = estimatedCount();
    const now = new Date().toISOString();
    const datasetName = dataSource === 'trace' ? '已选 Trace' : ds?.name ?? '';
    const name = taskName || `${ev.name} × ${datasetName}`;
    const task: LLMJudgeTask = {
      id: `jt_${Date.now()}`,
      name,
      status: 'pending',
      evaluatorId: ev.id,
      evaluatorName: ev.name,
      judgeModel: ev.judgeModel ?? 'gpt-4o',
      dimensions: ev.dimensions ?? [],
      datasetId: dataSource === 'trace' ? 'trace-selection' : ds?.id ?? '',
      datasetName,
      datasetVersion: dataSource === 'trace' ? 'live' : ds?.version ?? '',
      filterConditions: filters,
      samplingMethod,
      samplingValue: samplingMethod !== '全量执行' ? samplingValue : undefined,
      progress: 0,
      total,
      concurrency,
      retries,
      cacheEnabled,
      createdAt: now,
    };
    onCreate(task);
    onClose();
  }

  const canProceed = step === 1 ? selectedEvaluators.length > 0 : sourceCount > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-slate-900">新建评测任务</h2>
            <div className="flex items-center gap-2 mt-1.5">
              {[1, 2].map(s => (
                <div key={s} className="flex items-center gap-1.5">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                    step === s ? 'bg-blue-600 text-white' : step > s ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'
                  }`}>
                    {step > s ? '✓' : s}
                  </div>
                  <span className={`text-xs ${step === s ? 'text-blue-600 font-medium' : 'text-slate-400'}`}>
                    {s === 1 ? '选择评估器' : '选择运行数据'}
                  </span>
                  {s < 2 && <ChevronRight className="w-3 h-3 text-slate-300" />}
                </div>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* ── Step 1 ── */}
          {step === 1 && (
            <div className="space-y-3">
              <div className="mb-4">
                <label className="block text-sm text-slate-600 mb-1.5">任务名称（选填）</label>
                <input
                  value={taskName}
                  onChange={e => setTaskName(e.target.value)}
                  placeholder="留空则自动生成"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </div>
              <label className="block text-sm text-slate-600 mb-2">选择 LLM Judge 评估器（可多选）</label>
              {llmEvaluators.map(ev => {
                const isSelected = selectedEvaluators.includes(ev.id);
                const isDisabled = ev.status === 'inactive';
                return (
                  <div
                    key={ev.id}
                    onClick={() => !isDisabled && toggleEval(ev.id)}
                    className={`p-4 rounded-xl border transition-colors ${
                      isDisabled
                        ? 'border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed'
                        : isSelected
                          ? 'border-blue-500 bg-blue-50 cursor-pointer'
                          : 'border-slate-200 hover:border-slate-300 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-4 h-4 rounded border mt-0.5 flex items-center justify-center flex-shrink-0 ${
                        isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300'
                      }`}>
                        {isSelected && <span className="text-white text-xs leading-none">✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <Zap className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                          <span className="text-sm font-semibold text-slate-800 font-mono">{ev.name}</span>
                          {isDisabled && (
                            <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">未上线</span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                          <span>模型：<span className="text-slate-700 font-mono">{ev.judgeModel}</span></span>
                          <span>使用次数：<span className="text-slate-700">{ev.usageCount.toLocaleString()}</span></span>
                          <div className="flex items-center gap-1">
                            <span>维度：</span>
                            {ev.dimensions?.map(d => (
                              <span key={d} className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded">{d}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Step 2 ── */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">选择运行数据</label>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <button
                    onClick={() => {
                      setDataSource('trace');
                      setPreviewOpen(false);
                    }}
                    className={`rounded-lg border p-4 text-left transition-colors ${
                      dataSource === 'trace'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 ${dataSource === 'trace' ? 'border-blue-600 bg-blue-600' : 'border-slate-300'}`}>
                        {dataSource === 'trace' && <div className="m-1 h-1.5 w-1.5 rounded-full bg-white" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Zap className="w-4 h-4 text-blue-600" />
                          <span className="text-sm font-semibold text-slate-800">选择 Trace</span>
                        </div>
                        <div className="text-2xl font-bold text-blue-700">{selectedTraceIds.length}</div>
                        <div className="text-xs text-slate-500 mt-1">从 Trace 日志中勾选运行数据</div>
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      setDataSource('dataset');
                      setPreviewOpen(false);
                    }}
                    className={`rounded-lg border p-4 text-left transition-colors ${
                      dataSource === 'dataset'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 ${dataSource === 'dataset' ? 'border-blue-600 bg-blue-600' : 'border-slate-300'}`}>
                        {dataSource === 'dataset' && <div className="m-1 h-1.5 w-1.5 rounded-full bg-white" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Database className="w-4 h-4 text-indigo-600" />
                          <span className="text-sm font-semibold text-slate-800">选择数据集</span>
                        </div>
                        <div className="text-2xl font-bold text-indigo-700">{ds?.itemCount.toLocaleString() ?? '--'}</div>
                        <div className="text-xs text-slate-500 mt-1">从已有数据集中选择运行数据</div>
                      </div>
                    </div>
                  </button>
                </div>

                {dataSource === 'trace' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {mockTraces.map(trace => {
                        const checked = selectedTraceIds.includes(trace.id);
                        return (
                          <button
                            key={trace.id}
                            onClick={() => toggleTrace(trace.id)}
                            className={`w-full rounded-lg border p-3 text-left transition-colors ${
                              checked ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <div className={`mt-0.5 h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${checked ? 'border-blue-600 bg-blue-600' : 'border-slate-300'}`}>
                                {checked && <span className="text-white text-xs leading-none">✓</span>}
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-mono text-blue-600">{trace.id}</div>
                                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                                  <span>{trace.model}</span>
                                  <span>{trace.tokens.toLocaleString()} Token</span>
                                  <span>{trace.duration}ms</span>
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
                      <div className="text-xs font-semibold text-slate-600 mb-2">Trace 选择摘要</div>
                      <div className="text-sm font-semibold text-slate-800">{selectedTraceIds.length} 条 Trace</div>
                      <div className="mt-2 space-y-1.5">
                        {mockTraces
                          .filter(trace => selectedTraceIds.includes(trace.id))
                          .slice(0, 5)
                          .map(trace => (
                            <div key={trace.id} className="rounded border border-slate-100 bg-white px-2 py-1.5 text-xs">
                              <span className="font-mono text-slate-400 mr-2">{trace.id}</span>
                              <span className="text-slate-600">{trace.model}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                      {mockDatasets.map(d2 => (
                        <div
                          key={d2.id}
                          onClick={() => setSelectedDataset(d2.id)}
                          className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                            selectedDataset === d2.id
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-0.5">
                            <Database className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-sm font-mono text-blue-600">{d2.name}</span>
                            <span className="text-xs text-slate-400 font-mono">{d2.version}</span>
                            <span className="text-xs rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">{datasetCategoryLabels[d2.category]}</span>
                          </div>
                          <div className="text-xs text-slate-500">
                            {d2.itemCount.toLocaleString()} 条 · {
                              d2.source === 'annotation' ? '人工标注' :
                              d2.source === 'auto' ? '模型生成' :
                              d2.source === 'import' ? 'CSV 导入' : '从 Trace 来'
                            }
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 flex flex-col">
                      {ds ? (
                        <>
                          <div className="text-xs font-semibold text-slate-600 mb-2">数据集详情</div>
                          <div className="space-y-1.5 text-xs text-slate-600">
                            <div><span className="text-slate-400">名称：</span>{ds.name}</div>
                            <div><span className="text-slate-400">类型：</span>{datasetCategoryLabels[ds.category]}</div>
                            <div><span className="text-slate-400">版本：</span>{ds.version}</div>
                            <div><span className="text-slate-400">数据量：</span>{ds.itemCount.toLocaleString()} 条</div>
                            <div><span className="text-slate-400">创建时间：</span>{ds.createdAt}</div>
                          </div>
                          <div className="mt-3 pt-3 border-t border-slate-200">
                            <div className="text-xs text-slate-400 mb-2">样本预览（前 3 条）</div>
                            {[
                              { id: 'item_001', input: '2型糖尿病有哪些症状？' },
                              { id: 'item_002', input: '高血压一线治疗方案？' },
                              { id: 'item_003', input: '正常空腹血糖范围？' },
                            ].map(s => (
                              <div key={s.id} className="text-xs text-slate-500 mb-1.5 bg-white rounded p-1.5 border border-slate-100">
                                <span className="font-mono text-slate-400 mr-1.5">{s.id}</span>
                                {s.input}
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div className="flex-1 flex items-center justify-center text-xs text-slate-400">← 选择数据集以预览</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    <Filter className="w-4 h-4 text-slate-400" /> 条件过滤
                  </label>
                  <div className="flex items-center gap-2">
                    {filters.length > 1 && (
                      <select
                        value={filterLogic}
                        onChange={e => setFilterLogic(e.target.value as 'AND' | 'OR')}
                        className="text-xs border border-slate-200 rounded px-2 py-1 outline-none"
                      >
                        <option>AND</option>
                        <option>OR</option>
                      </select>
                    )}
                    <button onClick={addFilter} className="text-xs text-blue-600 border border-blue-200 rounded-lg px-2.5 py-1 hover:bg-blue-50">
                      + 添加条件
                    </button>
                  </div>
                </div>
                {filters.length === 0 ? (
                  <div className="text-xs text-slate-400 bg-slate-50 rounded-lg px-4 py-3 border border-dashed border-slate-200">
                    未设置过滤条件，将使用{dataSource === 'trace' ? '已选 Trace' : '数据集'}全部数据
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filters.map((fc, idx) => (
                      <div key={fc.id} className="flex items-center gap-2">
                        {idx > 0
                          ? <span className="text-xs font-bold text-slate-400 w-7 text-center">{filterLogic}</span>
                          : <div className="w-7" />}
                        <select
                          value={fc.field}
                          onChange={e => updateFilter(fc.id, { field: e.target.value })}
                          className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-blue-500"
                        >
                          <option value="input">input</option>
                          <option value="reference_output">reference_output</option>
                          <option value="metadata.model">metadata.model</option>
                          <option value="metadata.source">metadata.source</option>
                        </select>
                        <select
                          value={fc.operator}
                          onChange={e => updateFilter(fc.id, { operator: e.target.value as FilterCondition['operator'] })}
                          className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-blue-500"
                        >
                          {OPERATORS.map(op => <option key={op}>{op}</option>)}
                        </select>
                        <input
                          value={fc.value}
                          onChange={e => updateFilter(fc.id, { value: e.target.value })}
                          placeholder="值"
                          className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-blue-500"
                        />
                        <button onClick={() => removeFilter(fc.id)} className="text-slate-400 hover:text-red-500 flex-shrink-0">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <SlidersHorizontal className="inline w-4 h-4 text-slate-400 mr-1.5" />
                  按需采样
                </label>
                <div className="grid grid-cols-5 gap-2 mb-3">
                  {SAMPLING_METHODS.map(m => (
                    <button
                      key={m}
                      onClick={() => setSamplingMethod(m)}
                      className={`px-2 py-2 text-xs rounded-lg border text-center transition-colors ${
                        samplingMethod === m
                          ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                {samplingMethod !== '全量执行' && (
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="number"
                      value={samplingValue}
                      onChange={e => setSamplingValue(Number(e.target.value))}
                      min={1}
                      max={samplingMethod.includes('%') ? 100 : sourceCount}
                      className="w-28 border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-500"
                    />
                    <span className="text-sm text-slate-500">{samplingMethod.includes('%') ? '%' : '条'}</span>
                  </div>
                )}
                {sourceCount > 0 && (
                  <div className="mt-2 p-3 bg-amber-50 rounded-lg border border-amber-100 text-sm text-amber-700">
                    预计执行 <span className="font-bold">{estimatedCount()}</span> 条 / {dataSource === 'trace' ? `已选 ${selectedTraceIds.length} 条` : `总 ${sourceCount.toLocaleString()} 条`}
                    <button
                      onClick={() => setPreviewOpen(o => !o)}
                      className="ml-3 text-xs text-amber-600 underline"
                    >
                      {previewOpen ? '收起预览' : '预览数据'}
                    </button>
                  </div>
                )}
                {previewOpen && (
                  <div className="mt-2 space-y-2">
                    {dataSource === 'trace' ? (
                      mockTraces
                        .filter(trace => selectedTraceIds.includes(trace.id))
                        .slice(0, 5)
                        .map(trace => (
                          <div key={trace.id} className="bg-white rounded-lg border border-slate-200 p-3 text-xs">
                            <div className="font-mono text-slate-400 mb-1">{trace.id}</div>
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div><span className="text-slate-400">model: </span><span className="text-slate-700">{trace.model}</span></div>
                              <div><span className="text-slate-400">tokens: </span><span className="text-slate-600">{trace.tokens.toLocaleString()}</span></div>
                              <div><span className="text-slate-400">status: </span><span className="font-mono text-slate-500">{trace.status}</span></div>
                            </div>
                          </div>
                        ))
                    ) : (
                      [
                        { id: 'item_001', input: '2型糖尿病有哪些症状？', ref: '多饮、多尿、疲劳、视力模糊…', meta: '{"model":"gpt-4o"}' },
                        { id: 'item_002', input: '高血压一线治疗方案？', ref: '生活方式改变 + ACE 抑制剂…', meta: '{"model":"claude-3-5-sonnet"}' },
                        { id: 'item_003', input: '正常空腹血糖范围？', ref: '70-99 mg/dL（3.9-5.5 mmol/L）', meta: '{"model":"gpt-4o"}' },
                        { id: 'item_004', input: '急性阑尾炎体征？', ref: '右下腹痛、反跳痛、发热…', meta: '{"model":"gpt-4o-mini"}' },
                        { id: 'item_005', input: '二甲双胍与布洛芬能否同服？', ref: '需咨询医生，联用可能影响肾功能。', meta: '{"model":"gpt-4o"}' },
                      ].map(s => (
                        <div key={s.id} className="bg-white rounded-lg border border-slate-200 p-3 text-xs">
                          <div className="font-mono text-slate-400 mb-1">{s.id}</div>
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <div><span className="text-slate-400">input: </span><span className="text-slate-700">{s.input}</span></div>
                            <div><span className="text-slate-400">ref: </span><span className="text-slate-600">{s.ref}</span></div>
                            <div><span className="text-slate-400">meta: </span><span className="font-mono text-slate-500">{s.meta}</span></div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <label className="block text-sm font-medium text-slate-700 mb-3">执行参数配置</label>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1.5">并发数（1-50）</label>
                    <input
                      type="number"
                      value={concurrency}
                      onChange={e => setConcurrency(Math.max(1, Math.min(50, Number(e.target.value))))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1.5">重试次数（0-5）</label>
                    <input
                      type="number"
                      value={retries}
                      onChange={e => setRetries(Math.max(0, Math.min(5, Number(e.target.value))))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1.5">启用缓存</label>
                    <button
                      onClick={() => setCacheEnabled(v => !v)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors w-full ${
                        cacheEnabled
                          ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 bg-white text-slate-500'
                      }`}
                    >
                      <div className={`w-8 h-4 rounded-full relative transition-colors flex-shrink-0 ${cacheEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${cacheEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </div>
                      {cacheEnabled ? '开启' : '关闭'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">取消</button>
          {step > 1 && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="px-4 py-2 text-sm text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              上一步
            </button>
          )}
          {step < 2 ? (
            <button
              disabled={!canProceed}
              onClick={() => setStep(s => s + 1)}
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              下一步 <ChevronRight className="inline w-4 h-4" />
            </button>
          ) : (
            <button
              disabled={!canProceed}
              onClick={handleCreate}
              className="px-5 py-2 text-sm text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              确认创建
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function LLMJudge() {
  const [tasks, setTasks] = useState<LLMJudgeTask[]>(mockLLMJudgeTasks);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [detailTask, setDetailTask] = useState<LLMJudgeTask | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setTasks(prev => prev.map(t => {
        if (t.status !== 'running') return t;
        const next = Math.min(t.progress + Math.ceil(Math.random() * 4 + 1), t.total);
        if (next >= t.total) return { ...t, progress: t.total, status: 'completed' };
        return { ...t, progress: next };
      }));
    }, 3000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const completed = tasks.filter(t => t.status === 'completed');
    if (completed.length === 0) return;
    const id = setTimeout(() => {
      setTasks(prev => prev.filter(t => t.status !== 'completed'));
      setSelected(prev => {
        const next = new Set(prev);
        completed.forEach(t => next.delete(t.id));
        return next;
      });
    }, 2000);
    return () => clearTimeout(id);
  }, [tasks]);

  const displayed = tasks.filter(t =>
    (t.status === 'running' || t.status === 'pending') &&
    t.name.toLowerCase().includes(query.toLowerCase())
  );

  const allSelected = displayed.length > 0 && displayed.every(t => selected.has(t.id));

  function toggleAll() {
    if (allSelected) {
      setSelected(prev => { const n = new Set(prev); displayed.forEach(t => n.delete(t.id)); return n; });
    } else {
      setSelected(prev => { const n = new Set(prev); displayed.forEach(t => n.add(t.id)); return n; });
    }
  }

  function toggleOne(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function batchAction(action: 'pause' | 'cancel') {
    setTasks(prev => prev.map(t => {
      if (!selected.has(t.id)) return t;
      if (action === 'pause' && t.status === 'running') return { ...t, status: 'paused' as LLMJudgeTask['status'] };
      if (action === 'cancel') return { ...t, status: 'cancelled' as LLMJudgeTask['status'] };
      return t;
    }));
    setSelected(new Set());
  }

  function pauseTask(id: string) {
    setTasks(prev => prev.map(t =>
      t.id === id && t.status === 'running' ? { ...t, status: 'paused' as LLMJudgeTask['status'] } : t
    ));
  }

  function cancelTask(id: string) {
    setTasks(prev => prev.map(t =>
      t.id === id ? { ...t, status: 'cancelled' as LLMJudgeTask['status'] } : t
    ));
  }

  const runningCount = tasks.filter(t => t.status === 'running').length;
  const pendingCount = tasks.filter(t => t.status === 'pending').length;
  const hasCompleting = tasks.some(t => t.status === 'completed');

  return (
    <div>
      <PageHeader
        title="LLM 评测"
        description="在途 LLM Judge 评测任务实时监控"
        actions={
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> 新建评测任务
          </button>
        }
      />

      <div className="p-6 space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
              <RefreshCw className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <div className="text-xl font-bold text-blue-600">{runningCount}</div>
              <div className="text-xs text-slate-500">运行中</div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center">
              <Clock className="w-4 h-4 text-slate-500" />
            </div>
            <div>
              <div className="text-xl font-bold text-slate-700">{pendingCount}</div>
              <div className="text-xs text-slate-500">等待中</div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
              <AlertCircle className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-700">每 3s 刷新</div>
              <div className="text-xs text-slate-500">进度自动更新</div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative max-w-xs w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="搜索任务名称..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-500 bg-white"
            />
          </div>
          {selected.size > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-slate-500">已选 {selected.size} 条</span>
              <button
                onClick={() => batchAction('pause')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-amber-700 border border-amber-300 rounded-lg hover:bg-amber-50"
              >
                <Pause className="w-3.5 h-3.5" /> 批量暂停
              </button>
              <button
                onClick={() => batchAction('cancel')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
              >
                <Square className="w-3.5 h-3.5" /> 批量取消
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1.5"
              >
                取消选择
              </button>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 w-10">
                  <button onClick={toggleAll} className="text-slate-400 hover:text-slate-600 flex items-center justify-center">
                    {allSelected
                      ? <CheckSquare className="w-4 h-4 text-blue-600" />
                      : <Minus className="w-4 h-4" />}
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">任务名称</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">状态</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">进度</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">评估器</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">数据集</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">开始时间</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayed.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-sm text-slate-400">
                    {query ? '没有符合搜索条件的任务' : '暂无在途评测任务'}
                  </td>
                </tr>
              ) : displayed.map(task => (
                <tr
                  key={task.id}
                  className={`hover:bg-slate-50 transition-colors ${selected.has(task.id) ? 'bg-blue-50/40' : ''}`}
                >
                  <td className="px-4 py-4">
                    <button onClick={() => toggleOne(task.id)} className="flex items-center justify-center">
                      {selected.has(task.id)
                        ? <CheckSquare className="w-4 h-4 text-blue-600" />
                        : <div className="w-4 h-4 rounded border border-slate-300" />}
                    </button>
                  </td>
                  <td className="px-4 py-4">
                    <button
                      onClick={() => setDetailTask(task)}
                      className="text-sm font-medium text-blue-600 hover:text-blue-700 text-left"
                    >
                      {task.name}
                    </button>
                  </td>
                  <td className="px-4 py-4">
                    <StatusBadge status={task.status} />
                  </td>
                  <td className="px-4 py-4">
                    {task.status === 'running' ? (
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all duration-500"
                            style={{ width: `${pct(task.progress, task.total)}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono text-slate-600">{pct(task.progress, task.total)}%</span>
                        <span className="text-xs text-slate-400">{task.progress}/{task.total}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-sm font-mono text-slate-600">{task.evaluatorName}</td>
                  <td className="px-4 py-4">
                    <span className="text-sm font-mono text-blue-600 cursor-pointer hover:text-blue-700">{task.datasetName}</span>
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-500">
                    {task.status === 'running' && task.startedAt
                      ? formatTime(task.startedAt)
                      : formatTime(task.createdAt)}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-end gap-1">
                      {task.status === 'running' && (
                        <button
                          onClick={() => pauseTask(task.id)}
                          title="暂停"
                          className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600"
                        >
                          <Pause className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => setDetailTask(task)}
                        title="查看详情"
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => cancelTask(task.id)}
                        title="取消"
                        className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {hasCompleting && (
          <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2">
            <Play className="w-3.5 h-3.5" />
            有任务已完成，即将自动移入「评测任务」历史列表…
          </div>
        )}
      </div>

      {createOpen && (
        <CreateTaskWizard onClose={() => setCreateOpen(false)} onCreate={t => setTasks(prev => [t, ...prev])} />
      )}
      {detailTask && <TaskDetailPanel task={detailTask} onClose={() => setDetailTask(null)} />}
    </div>
  );
}
