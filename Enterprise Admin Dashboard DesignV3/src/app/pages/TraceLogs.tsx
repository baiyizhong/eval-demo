import { useState, useMemo } from 'react';
import { Search, Download, ChevronRight, ChevronDown, X, Copy, Tag, Database, AlertCircle, CheckCircle2, AlignLeft, Code2, Activity, Clock3, DollarSign, Gauge, Layers3, RefreshCw, SlidersHorizontal, Sparkles, ShieldCheck, Plus } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { useApp } from '../context/AppContext';
import { mockTraces, traceOverTimeData, mockAnnotationTasks, mockDatasets, mockEvaluators, Trace, DatasetCategory } from '../data/mockData';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const modelColors: Record<string, string> = {
  'gpt-4o': 'bg-emerald-100 text-emerald-700',
  'gpt-4o-mini': 'bg-teal-100 text-teal-700',
  'claude-3-5-sonnet': 'bg-purple-100 text-purple-700',
  'gemini-1.5-pro': 'bg-blue-100 text-blue-700',
};

type FilterField = 'name' | 'id' | 'userId' | 'sessionId' | 'model' | 'status' | 'environment' | 'score' | 'duration' | 'tokens' | 'cost' | 'observations';
type FilterOperator = 'contains' | 'equals' | 'notEquals' | 'gt' | 'lt';

interface AdvancedFilter {
  id: string;
  field: FilterField;
  operator: FilterOperator;
  value: string;
}

interface LaunchedEvaluation {
  id: string;
  name: string;
  evaluator: string;
  source: string;
  traceCount: number;
  concurrency: number;
  retries: number;
  cacheEnabled: boolean;
}

type TraceSamplingMethod = '全量执行' | '随机采样N条' | '随机采样X%' | '均匀采样' | '分层采样';
type EvaluationDataSource = 'trace' | 'dataset';

const datasetCategoryLabels: Record<DatasetCategory, string> = {
  evaluation: '评测集',
  badcase: 'BadCase 集',
  golden: '黄金集',
  anomaly: '异常集',
};

const traceSamplingMethods: TraceSamplingMethod[] = [
  '全量执行', '随机采样N条', '随机采样X%', '均匀采样', '分层采样',
];

const filterFields: Array<{ value: FilterField; label: string; type: 'text' | 'number' }> = [
  { value: 'name', label: 'Trace 名称', type: 'text' },
  { value: 'id', label: 'Trace ID', type: 'text' },
  { value: 'userId', label: '用户 ID', type: 'text' },
  { value: 'sessionId', label: '会话 ID', type: 'text' },
  { value: 'model', label: '模型', type: 'text' },
  { value: 'status', label: '状态', type: 'text' },
  { value: 'environment', label: '环境', type: 'text' },
  { value: 'score', label: '质量分', type: 'number' },
  { value: 'duration', label: '延迟 ms', type: 'number' },
  { value: 'tokens', label: 'Token 数', type: 'number' },
  { value: 'cost', label: '费用', type: 'number' },
  { value: 'observations', label: '观测节点', type: 'number' },
];

const operatorLabels: Record<FilterOperator, string> = {
  contains: '包含',
  equals: '等于',
  notEquals: '不等于',
  gt: '大于',
  lt: '小于',
};

const statusLabels: Record<Trace['status'], string> = {
  success: '成功',
  error: '错误',
  partial_error: '部分错误',
  timeout: '超时',
};

function getFieldLabel(field: FilterField) {
  return filterFields.find((item) => item.value === field)?.label ?? field;
}

function getFilterSummary(filter: AdvancedFilter) {
  return `${getFieldLabel(filter.field)} ${operatorLabels[filter.operator]} ${filter.value}`;
}

const traceNames = [
  '医疗分诊回答',
  '检索增强问答',
  '症状追问',
  '发票工具调用',
  '政策依据回答',
  '安全分类',
  '临床摘要',
  '意图路由',
  '兜底回复',
  '最终回答生成',
];

function getTraceName(trace: Trace) {
  const index = Number(trace.id.replace(/\D/g, '')) % traceNames.length;
  return traceNames[index];
}

function getEnvironment(trace: Trace) {
  if (trace.status === 'success') return '生产';
  if (trace.status === 'timeout') return '预发';
  return '生产';
}

function getTraceScore(trace: Trace) {
  if (trace.status === 'success') return Math.max(7.2, 9.4 - trace.duration / 8000);
  if (trace.status === 'partial_error') return 5.8;
  if (trace.status === 'timeout') return 3.1;
  return 4.4;
}

function getObservationCount(trace: Trace) {
  return trace.status === 'timeout' ? 5 : trace.model.includes('claude') ? 4 : 6;
}

function formatDuration(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(ms > 10000 ? 1 : 2)}s` : `${ms}ms`;
}

function getFilterValue(trace: Trace, field: FilterField) {
  const values: Record<FilterField, string | number> = {
    name: getTraceName(trace),
    id: trace.id,
    userId: trace.userId,
    sessionId: trace.sessionId,
    model: trace.model,
    status: trace.status,
    environment: getEnvironment(trace),
    score: getTraceScore(trace),
    duration: trace.duration,
    tokens: trace.tokens,
    cost: trace.cost,
    observations: getObservationCount(trace),
  };
  return values[field];
}

function matchesAdvancedFilter(trace: Trace, filter: AdvancedFilter) {
  if (!filter.value.trim()) return true;
  const raw = getFilterValue(trace, filter.field);
  const fieldType = filterFields.find((field) => field.value === filter.field)?.type ?? 'text';

  if (fieldType === 'number') {
    const actual = Number(raw);
    const expected = Number(filter.value);
    if (Number.isNaN(expected)) return true;
    if (filter.operator === 'gt') return actual > expected;
    if (filter.operator === 'lt') return actual < expected;
    if (filter.operator === 'notEquals') return actual !== expected;
    return actual === expected;
  }

  const actual = String(raw).toLowerCase();
  const expected = filter.value.toLowerCase();
  if (filter.operator === 'equals') return actual === expected;
  if (filter.operator === 'notEquals') return actual !== expected;
  return actual.includes(expected);
}

// ─── 批量标注弹窗 ─────────────────────────────────────────────────────────────

function AnnotationTaskModal({
  traceCount,
  onClose,
}: {
  traceCount: number;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState('');

  const filtered = mockAnnotationTasks.filter(t =>
    t.name.toLowerCase().includes(query.toLowerCase())
  );
  const selectedTask = mockAnnotationTasks.find(t => t.id === selectedTaskId);

  const statusLabel: Record<string, string> = {
    pending: '待处理', in_progress: '进行中', review: '待审核', approved: '已通过', rejected: '已打回',
  };
  const statusColor: Record<string, string> = {
    pending: 'text-slate-500', in_progress: 'text-blue-600', review: 'text-amber-600',
    approved: 'text-emerald-600', rejected: 'text-red-500',
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-slate-900">批量标注</h2>
            <div className="text-xs text-slate-400 mt-0.5">已选 {traceCount} 条 Trace</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {mockAnnotationTasks.length === 0 ? (
            <div className="text-center py-10">
              <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <div className="text-sm text-slate-500 mb-2">当前项目尚未创建标注任务</div>
              <div className="text-xs text-slate-400">请前往「评测 → 人工标注」先创建标注任务</div>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm text-slate-600 mb-1.5">目标标注任务 <span className="text-red-500">*</span></label>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="搜索标注任务..."
                    className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500"
                  />
                </div>
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                  {filtered.length === 0 ? (
                    <div className="px-4 py-6 text-center text-xs text-slate-400">无匹配任务</div>
                  ) : filtered.map(task => (
                    <div
                      key={task.id}
                      onClick={() => setSelectedTaskId(task.id)}
                      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-b last:border-0 border-slate-100 ${
                        selectedTaskId === task.id ? 'bg-blue-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        selectedTaskId === task.id ? 'border-blue-500 bg-blue-500' : 'border-slate-300'
                      }`}>
                        {selectedTaskId === task.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">{task.name}</div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className={`text-xs ${statusColor[task.status]}`}>{statusLabel[task.status]}</span>
                          <span className="text-xs text-slate-400">进度 {task.completed}/{task.total}</span>
                          <span className="text-xs text-slate-400">负责人：{task.assignedTo}</span>
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: task.total > 0 ? `${(task.completed / task.total) * 100}%` : '0%' }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {selectedTask && (
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">评分维度（只读）</div>
                  {selectedTask.dimensions && selectedTask.dimensions.length > 0 ? (
                    <div className="space-y-2">
                      {selectedTask.dimensions.map(d => (
                        <div key={d.id} className="flex items-center gap-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                            d.type === 'numeric' ? 'bg-blue-100 text-blue-700' :
                            d.type === 'boolean' ? 'bg-teal-100 text-teal-700' : 'bg-purple-100 text-purple-700'
                          }`}>
                            {d.type === 'numeric' ? '数字' : d.type === 'boolean' ? '布尔' : '分类'}
                          </span>
                          <span className="text-sm font-medium text-slate-700">{d.label}</span>
                          {d.desc && <span className="text-xs text-slate-400 truncate">{d.desc}</span>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400">该任务未配置评分维度</div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">取消</button>
          <button
            disabled={!selectedTaskId || mockAnnotationTasks.length === 0}
            onClick={onClose}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            确认关联
          </button>
        </div>
      </div>
    </div>
  );
}

function LaunchEvaluationModal({
  traceCount,
  onClose,
  onLaunch,
}: {
  traceCount: number;
  onClose: () => void;
  onLaunch: (evaluation: LaunchedEvaluation) => void;
}) {
  const llmEvaluators = mockEvaluators.filter(evaluator => evaluator.type === 'llm_judge');
  const [step, setStep] = useState(1);
  const [taskName, setTaskName] = useState('');
  const [selectedEvaluators, setSelectedEvaluators] = useState<string[]>([]);
  const [dataSource, setDataSource] = useState<EvaluationDataSource>('trace');
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [samplingMethod, setSamplingMethod] = useState<TraceSamplingMethod>('全量执行');
  const [samplingValue, setSamplingValue] = useState(50);
  const [concurrency, setConcurrency] = useState(5);
  const [retries, setRetries] = useState(2);
  const [cacheEnabled, setCacheEnabled] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const selectedDataset = mockDatasets.find(dataset => dataset.id === selectedDatasetId);
  const sourceCount = dataSource === 'trace' ? traceCount : selectedDataset?.itemCount ?? 0;

  function toggleEvaluator(id: string) {
    setSelectedEvaluators(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function estimatedCount() {
    if (samplingMethod === '全量执行') return sourceCount;
    if (samplingMethod === '随机采样N条' || samplingMethod === '均匀采样') return Math.min(samplingValue, sourceCount);
    if (samplingMethod === '随机采样X%' || samplingMethod === '分层采样') return Math.round(sourceCount * samplingValue / 100);
    return sourceCount;
  }

  const canProceed = step === 1
    ? selectedEvaluators.length > 0
    : dataSource === 'trace'
      ? traceCount > 0
      : !!selectedDataset;

  function handleLaunch() {
    const selectedEvaluator = llmEvaluators.find(evaluator => evaluator.id === selectedEvaluators[0]);
    if (!selectedEvaluator) return;
    onLaunch({
      id: `eval_${Date.now()}`,
      name: taskName.trim() || `${selectedEvaluator.name} × ${dataSource === 'trace' ? '已选 Trace' : selectedDataset?.name}`,
      evaluator: selectedEvaluator.name,
      source: dataSource === 'trace' ? '已选 Trace' : `数据集：${selectedDataset?.name}`,
      traceCount: estimatedCount(),
      concurrency,
      retries,
      cacheEnabled,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
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
              {llmEvaluators.map(evaluator => {
                const isSelected = selectedEvaluators.includes(evaluator.id);
                const isDisabled = evaluator.status === 'inactive';
                return (
                  <div
                    key={evaluator.id}
                    onClick={() => !isDisabled && toggleEvaluator(evaluator.id)}
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
                          <Sparkles className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                          <span className="text-sm font-semibold text-slate-800 font-mono">{evaluator.name}</span>
                          {isDisabled && (
                            <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">未上线</span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                          <span>模型：<span className="text-slate-700 font-mono">{evaluator.judgeModel}</span></span>
                          <span>使用次数：<span className="text-slate-700">{evaluator.usageCount.toLocaleString()}</span></span>
                          <div className="flex items-center gap-1">
                            <span>维度：</span>
                            {evaluator.dimensions?.map(dimension => (
                              <span key={dimension} className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded">{dimension}</span>
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
                          <Activity className="w-4 h-4 text-blue-600" />
                          <span className="text-sm font-semibold text-slate-800">当前已选 Trace</span>
                        </div>
                        <div className="text-2xl font-bold text-blue-700">{traceCount}</div>
                        <div className="text-xs text-slate-500 mt-1">使用列表中已勾选的 Trace 作为运行数据</div>
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
                        <div className="text-2xl font-bold text-indigo-700">{selectedDataset?.itemCount.toLocaleString() ?? '--'}</div>
                        <div className="text-xs text-slate-500 mt-1">从已有数据集中选择运行数据</div>
                      </div>
                    </div>
                  </button>
                </div>

                {dataSource === 'trace' ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold text-slate-600 mb-2">Trace 数据预览</div>
                    {mockTraces.slice(0, Math.min(3, traceCount)).map(trace => (
                      <div key={trace.id} className="mb-1.5 rounded border border-slate-100 bg-white px-2 py-1.5 text-xs">
                        <span className="font-mono text-slate-400 mr-2">{trace.id}</span>
                        <span className="text-slate-600">{getTraceName(trace)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                      {mockDatasets.map(dataset => (
                        <button
                          key={dataset.id}
                          onClick={() => setSelectedDatasetId(dataset.id)}
                          className={`w-full rounded-lg border p-3 text-left transition-colors ${
                            selectedDatasetId === dataset.id
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-0.5">
                            <Database className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-sm font-mono text-blue-600">{dataset.name}</span>
                            <span className="text-xs text-slate-400 font-mono">{dataset.version}</span>
                            <span className="text-xs rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">{datasetCategoryLabels[dataset.category]}</span>
                          </div>
                          <div className="text-xs text-slate-500">
                            {dataset.itemCount.toLocaleString()} 条 · {
                              dataset.source === 'annotation' ? '人工标注' :
                              dataset.source === 'auto' ? '模型生成' :
                              dataset.source === 'import' ? 'CSV 导入' : '从 Trace 来'
                            }
                          </div>
                        </button>
                      ))}
                    </div>
                    <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 flex flex-col">
                      {selectedDataset ? (
                        <>
                          <div className="text-xs font-semibold text-slate-600 mb-2">数据集详情</div>
                          <div className="space-y-1.5 text-xs text-slate-600">
                            <div><span className="text-slate-400">名称：</span>{selectedDataset.name}</div>
                            <div><span className="text-slate-400">类型：</span>{datasetCategoryLabels[selectedDataset.category]}</div>
                            <div><span className="text-slate-400">版本：</span>{selectedDataset.version}</div>
                            <div><span className="text-slate-400">数据量：</span>{selectedDataset.itemCount.toLocaleString()} 条</div>
                            <div><span className="text-slate-400">创建时间：</span>{selectedDataset.createdAt}</div>
                          </div>
                          {selectedDataset.description && (
                            <div className="mt-3 pt-3 border-t border-slate-200 text-xs text-slate-500 leading-relaxed">
                              {selectedDataset.description}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex-1 flex items-center justify-center text-xs text-slate-400">← 选择数据集以预览</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <SlidersHorizontal className="inline w-4 h-4 text-slate-400 mr-1.5" />
                  按需采样
                </label>
                <div className="grid grid-cols-5 gap-2 mb-3">
                  {traceSamplingMethods.map(method => (
                    <button
                      key={method}
                      onClick={() => setSamplingMethod(method)}
                      className={`px-2 py-2 text-xs rounded-lg border text-center transition-colors ${
                        samplingMethod === method
                          ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
                {samplingMethod !== '全量执行' && (
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="number"
                      value={samplingValue}
                      onChange={e => setSamplingValue(Math.max(1, Number(e.target.value) || 1))}
                      min={1}
                      max={samplingMethod.includes('%') ? 100 : sourceCount}
                      className="w-28 border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-500"
                    />
                    <span className="text-sm text-slate-500">{samplingMethod.includes('%') ? '%' : '条'}</span>
                  </div>
                )}
                <div className="mt-2 p-3 bg-amber-50 rounded-lg border border-amber-100 text-sm text-amber-700">
                  预计执行 <span className="font-bold">{estimatedCount()}</span> 条 / {dataSource === 'trace' ? `已选 ${traceCount} 条` : `数据集 ${sourceCount.toLocaleString()} 条`}
                  <button
                    onClick={() => setPreviewOpen(open => !open)}
                    className="ml-3 text-xs text-amber-600 underline"
                  >
                    {previewOpen ? '收起预览' : '预览数据'}
                  </button>
                </div>
                {previewOpen && (
                  <div className="mt-2 space-y-2">
                    {dataSource === 'trace' ? (
                      mockTraces.slice(0, Math.min(5, traceCount)).map(trace => (
                        <div key={trace.id} className="bg-white rounded-lg border border-slate-200 p-3 text-xs">
                          <div className="font-mono text-slate-400 mb-1">{trace.id}</div>
                          <div className="grid grid-cols-3 gap-2">
                            <div><span className="text-slate-400">名称：</span><span className="text-slate-700">{getTraceName(trace)}</span></div>
                            <div><span className="text-slate-400">模型：</span><span className="font-mono text-slate-600">{trace.model}</span></div>
                            <div><span className="text-slate-400">质量分：</span><span className="text-slate-600">{getTraceScore(trace).toFixed(1)}</span></div>
                          </div>
                        </div>
                      ))
                    ) : selectedDataset ? (
                      [
                        { id: 'item_001', input: '2型糖尿病有哪些症状？', ref: '多饮、多尿、疲劳、视力模糊…', meta: '{"model":"gpt-4o"}' },
                        { id: 'item_002', input: '高血压一线治疗方案？', ref: '生活方式改变 + ACE 抑制剂…', meta: '{"model":"claude-3-5-sonnet"}' },
                        { id: 'item_003', input: '正常空腹血糖范围？', ref: '70-99 mg/dL（3.9-5.5 mmol/L）', meta: '{"model":"gpt-4o"}' },
                      ].map(item => (
                        <div key={item.id} className="bg-white rounded-lg border border-slate-200 p-3 text-xs">
                          <div className="font-mono text-slate-400 mb-1">{item.id}</div>
                          <div className="grid grid-cols-3 gap-2">
                            <div><span className="text-slate-400">input: </span><span className="text-slate-700">{item.input}</span></div>
                            <div><span className="text-slate-400">ref: </span><span className="text-slate-600">{item.ref}</span></div>
                            <div><span className="text-slate-400">meta: </span><span className="font-mono text-slate-500">{item.meta}</span></div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-lg border border-dashed border-slate-200 bg-white p-4 text-center text-xs text-slate-400">
                        请先选择数据集
                      </div>
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
                      onChange={e => setConcurrency(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1.5">重试次数（0-5）</label>
                    <input
                      type="number"
                      value={retries}
                      onChange={e => setRetries(Math.max(0, Math.min(5, Number(e.target.value) || 0)))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1.5">启用缓存</label>
                    <button
                      onClick={() => setCacheEnabled(enabled => !enabled)}
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
              onClick={handleLaunch}
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

// ─── 加入数据集弹窗 ────────────────────────────────────────────────────────────

function AddToDatasetModal({
  trace,
  onClose,
}: {
  trace: Trace;
  onClose: () => void;
}) {
  const [dsId, setDsId] = useState('');
  const [mode, setMode] = useState<'pretty' | 'minify'>('pretty');

  const defaultJson = useMemo(() => {
    const data = {
      input: [{ role: 'user', content: '2型糖尿病有哪些症状？' }],
      expected_output: '',
      metadata: {
        model: trace.model,
        session_id: trace.sessionId,
        user_id: trace.userId,
        duration_ms: trace.duration,
        tokens: trace.tokens,
        cost_usd: trace.cost,
      },
    };
    return JSON.stringify(data, null, 2);
  }, [trace]);

  const [jsonText, setJsonText] = useState(defaultJson);

  const jsonError = useMemo(() => {
    try { JSON.parse(jsonText); return ''; }
    catch (e: unknown) { return e instanceof Error ? e.message : '无效 JSON'; }
  }, [jsonText]);

  function handleModeToggle(m: 'pretty' | 'minify') {
    try {
      const parsed = JSON.parse(jsonText);
      setJsonText(m === 'pretty' ? JSON.stringify(parsed, null, 2) : JSON.stringify(parsed));
      setMode(m);
    } catch { setMode(m); }
  }

  const canSubmit = !!dsId && !jsonError;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-slate-900">添加到数据集</h2>
            <div className="text-xs text-slate-400 mt-0.5">Trace: <span className="font-mono">{trace.id}</span></div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* dataset selector */}
          <div>
            <label className="block text-sm text-slate-600 mb-1.5">目标数据集 <span className="text-red-500">*</span></label>
            <select
              value={dsId}
              onChange={e => setDsId(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
            >
              <option value="">请选择数据集...</option>
              {mockDatasets.map(ds => (
                <option key={ds.id} value={ds.id}>
                  {ds.name}（{datasetCategoryLabels[ds.category]}，{ds.version}，{ds.itemCount.toLocaleString()} 条）
                </option>
              ))}
            </select>
          </div>

          {/* json editor */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm text-slate-600">自定义修改数据内容</label>
              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                <button
                  onClick={() => handleModeToggle('pretty')}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md transition-colors ${mode === 'pretty' ? 'bg-white shadow-sm text-slate-700 font-medium' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <AlignLeft className="w-3 h-3" /> 格式化
                </button>
                <button
                  onClick={() => handleModeToggle('minify')}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md transition-colors ${mode === 'minify' ? 'bg-white shadow-sm text-slate-700 font-medium' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <Code2 className="w-3 h-3" /> 压缩
                </button>
              </div>
            </div>
            <div className="relative">
              <textarea
                value={jsonText}
                onChange={e => setJsonText(e.target.value)}
                rows={16}
                spellCheck={false}
                className={`w-full border rounded-lg px-4 py-3 text-xs font-mono outline-none resize-none bg-slate-950 text-emerald-300 leading-relaxed ${
                  jsonError ? 'border-red-500' : 'border-slate-700 focus:border-blue-500'
                }`}
              />
            </div>
            {jsonError ? (
              <div className="flex items-center gap-1.5 mt-1.5 text-xs text-red-500">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="font-mono">{jsonError}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 mt-1.5 text-xs text-emerald-600">
                <CheckCircle2 className="w-3.5 h-3.5" /> JSON 格式有效
              </div>
            )}
            <div className="mt-2 text-xs text-slate-400">
              支持修改 <span className="font-mono">input</span>、<span className="font-mono">expected_output</span>、<span className="font-mono">metadata</span> 中的任意字段
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">取消</button>
          <button
            disabled={!canSubmit}
            onClick={onClose}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Database className="w-4 h-4" /> 确认写入
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Trace 详情面板 ───────────────────────────────────────────────────────────

function TraceDetailPanel({ trace, onClose }: { trace: Trace; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'observations' | 'input' | 'output' | 'metadata' | 'tokens' | 'scores'>('observations');
  const [showAddToDataset, setShowAddToDataset] = useState(false);
  const [showAnnotationModal, setShowAnnotationModal] = useState(false);
  const score = getTraceScore(trace);
  const observations = [
    { name: '根 Trace', type: '链路', latency: trace.duration, status: trace.status },
    { name: '意图路由', type: '编排', latency: 96, status: 'success' },
    { name: '知识检索.policy_search', type: '检索', latency: 328, status: trace.status === 'timeout' ? 'partial_error' : 'success' },
    { name: `模型调用.${trace.model}`, type: '生成', latency: Math.max(240, trace.duration - 520), status: trace.status },
    { name: '评分.综合', type: '评分', latency: 120, status: trace.status === 'error' ? 'error' : 'success' },
  ];

  const tabs = [
    { key: 'observations', label: '调用链' },
    { key: 'input', label: '输入' },
    { key: 'output', label: '输出' },
    { key: 'metadata', label: '元数据' },
    { key: 'tokens', label: '用量' },
    { key: 'scores', label: '评分' },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-[640px] bg-white border-l border-slate-200 flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-slate-900 font-semibold text-sm">{getTraceName(trace)}</span>
              <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-mono text-slate-500">{trace.id}</span>
              <button className="text-slate-400 hover:text-slate-600"><Copy className="w-3.5 h-3.5" /></button>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={trace.status} />
              <span className="text-xs rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">{getEnvironment(trace)}</span>
              <span className="text-xs text-slate-500">{new Date(trace.startTime).toLocaleString('zh-CN')}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-4 h-4" /></button>
        </div>

        <div className="grid grid-cols-4 border-b border-slate-200 divide-x divide-slate-200">
          {[
            { label: '耗时', value: formatDuration(trace.duration) },
            { label: 'Token 数', value: trace.tokens.toLocaleString() },
            { label: '费用', value: `$${trace.cost.toFixed(4)}` },
            { label: '质量分', value: score.toFixed(1) },
          ].map(s => (
            <div key={s.label} className="px-4 py-3 text-center">
              <div className="text-xs text-slate-500 mb-0.5">{s.label}</div>
              <div className="text-sm font-semibold text-slate-900">{s.value}</div>
            </div>
          ))}
        </div>

        <div className="flex border-b border-slate-200 px-4">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-3 py-2.5 text-sm border-b-2 transition-colors ${
                activeTab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'observations' && (
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>调用链结构</span>
                  <span>{observations.length} 个观测节点 · {getObservationCount(trace)} 个调用步骤</span>
                </div>
              </div>
              {observations.map((obs, index) => (
                <div key={obs.name} className="relative rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 grid h-7 w-7 place-items-center rounded-lg ${
                        obs.type === '生成' ? 'bg-blue-50 text-blue-600' :
                        obs.type === '检索' ? 'bg-emerald-50 text-emerald-600' :
                        obs.type === '评分' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {obs.type === '生成' ? <Sparkles className="h-3.5 w-3.5" /> :
                          obs.type === '评分' ? <ShieldCheck className="h-3.5 w-3.5" /> :
                          <Layers3 className="h-3.5 w-3.5" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-slate-900">{obs.name}</span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">{obs.type}</span>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          层级 {index} · 开始 +{index * 84}ms · {formatDuration(obs.latency)}
                        </div>
                      </div>
                    </div>
                    <StatusBadge status={obs.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {activeTab === 'input' && (
            <pre className="text-xs text-slate-200 bg-slate-950 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap font-mono">
{JSON.stringify({
  messages: [
    { role: "system", content: "你是一位专业的医疗助手。" },
    { role: "user", content: "2型糖尿病有哪些症状？" }
  ],
  model: trace.model,
  temperature: 0.7,
  max_tokens: 1024
}, null, 2)}
            </pre>
          )}
          {activeTab === 'output' && (
            <pre className="text-xs text-slate-200 bg-slate-950 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap font-mono">
{JSON.stringify({
  id: `chatcmpl-${trace.id}`,
  choices: [{
    message: {
      role: "assistant",
      content: "2型糖尿病的常见症状包括：多饮（口渴）、多尿、疲劳感、视力模糊、伤口愈合缓慢和不明原因体重下降。许多患者在早期无明显症状。"
    },
    finish_reason: "stop"
  }],
  usage: { prompt_tokens: 45, completion_tokens: 62, total_tokens: trace.tokens }
}, null, 2)}
            </pre>
          )}
          {activeTab === 'metadata' && (
            <div className="space-y-3">
              {[
                { key: '会话 ID', value: trace.sessionId },
                { key: '用户 ID', value: trace.userId },
                { key: '模型', value: trace.model },
                { key: '项目 ID', value: trace.projectId },
                { key: '环境', value: getEnvironment(trace) },
                { key: 'SDK 版本', value: 'observeiq-python@1.2.0' },
              ].map(m => (
                <div key={m.key} className="flex items-start justify-between py-2 border-b border-slate-100">
                  <span className="text-sm text-slate-500">{m.key}</span>
                  <span className="text-sm text-slate-900 font-mono">{m.value}</span>
                </div>
              ))}
            </div>
          )}
          {activeTab === 'tokens' && (
            <div className="space-y-4">
              {[
                { label: '提示词 Token', value: Math.floor(trace.tokens * 0.4), color: 'bg-blue-500' },
                { label: '补全 Token', value: Math.floor(trace.tokens * 0.6), color: 'bg-emerald-500' },
                { label: '总 Token', value: trace.tokens, color: 'bg-slate-400' },
              ].map(t => (
                <div key={t.label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-600">{t.label}</span>
                    <span className="text-slate-900 font-semibold">{t.value.toLocaleString()}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${t.color} rounded-full`} style={{ width: `${(t.value / trace.tokens) * 100}%` }} />
                  </div>
                </div>
              ))}
              <div className="mt-4 pt-3 border-t border-slate-200">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">估算费用</span>
                  <span className="text-slate-900 font-semibold">${trace.cost.toFixed(6)}</span>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'scores' && (
            <div className="space-y-3">
              {[
                { name: '综合评分', value: score, source: '评估器', comment: 'LLM Judge 自动评分，已纳入 30 天质量趋势。' },
                { name: '有用性', value: Math.min(10, score + 0.4), source: '评估器', comment: '回答是否直接解决用户问题。' },
                { name: '用户反馈', value: trace.status === 'success' ? 1 : 0, source: '用户反馈', comment: trace.status === 'success' ? '正向反馈' : '负向反馈' },
              ].map(item => (
                <div key={item.name} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-mono text-sm text-slate-900">{item.name}</div>
                      <div className="mt-1 text-xs text-slate-500">{item.source}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-semibold ${Number(item.value) >= 7 ? 'text-emerald-600' : Number(item.value) >= 5 ? 'text-amber-600' : 'text-red-600'}`}>
                        {Number(item.value).toFixed(1)}
                      </div>
                      <div className="text-[11px] text-slate-400">数值型</div>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">{item.comment}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex items-center gap-2">
          <button
            onClick={() => setShowAddToDataset(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600"
          >
            <Database className="w-3.5 h-3.5" /> 加入数据集
          </button>
          <button
            onClick={() => setShowAnnotationModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600"
          >
            <Tag className="w-3.5 h-3.5" /> 发起标注
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">
            <Download className="w-3.5 h-3.5" /> 导出
          </button>
        </div>
      </div>

      {showAddToDataset && (
        <AddToDatasetModal trace={trace} onClose={() => setShowAddToDataset(false)} />
      )}
      {showAnnotationModal && (
        <AnnotationTaskModal traceCount={1} onClose={() => setShowAnnotationModal(false)} />
      )}
    </div>
  );
}

export function TraceLogs() {
  const { currentProject } = useApp();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modelFilter, setModelFilter] = useState('all');
  const [envFilter, setEnvFilter] = useState('all');
  const [timeRange, setTimeRange] = useState('14d');
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilter[]>([
    { id: 'filter_score', field: 'score', operator: 'gt', value: '5' },
  ]);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(true);
  const [selectedTrace, setSelectedTrace] = useState<Trace | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBatchAnnotation, setShowBatchAnnotation] = useState(false);
  const [showLaunchEvaluation, setShowLaunchEvaluation] = useState(false);
  const [launchedEvaluation, setLaunchedEvaluation] = useState<LaunchedEvaluation | null>(null);
  const activeAdvancedFilters = advancedFilters.filter((filter) => filter.value.trim());
  const activeFilterCount =
    activeAdvancedFilters.length +
    (search.trim() ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (modelFilter !== 'all' ? 1 : 0) +
    (envFilter !== 'all' ? 1 : 0);

  const traces = mockTraces.filter(t => {
    const searchTerm = search.trim().toLowerCase();
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (modelFilter !== 'all' && t.model !== modelFilter) return false;
    if (envFilter !== 'all' && getEnvironment(t) !== envFilter) return false;
    if (
      searchTerm &&
      ![t.id, t.userId, t.sessionId, getTraceName(t)]
        .some((value) => value.toLowerCase().includes(searchTerm))
    ) return false;
    if (!advancedFilters.every((filter) => matchesAdvancedFilter(t, filter))) return false;
    return true;
  });

  const filterSummaries = [
    ...(search.trim() ? [{ id: 'search', label: `搜索：${search.trim()}`, onRemove: () => setSearch('') }] : []),
    ...(envFilter !== 'all' ? [{ id: 'env', label: `环境：${envFilter}`, onRemove: () => setEnvFilter('all') }] : []),
    ...(statusFilter !== 'all' ? [{ id: 'status', label: `状态：${statusLabels[statusFilter as Trace['status']] ?? statusFilter}`, onRemove: () => setStatusFilter('all') }] : []),
    ...(modelFilter !== 'all' ? [{ id: 'model', label: `模型：${modelFilter}`, onRemove: () => setModelFilter('all') }] : []),
    ...activeAdvancedFilters.map((filter) => ({
      id: filter.id,
      label: getFilterSummary(filter),
      onRemove: () => removeFilter(filter.id),
    })),
  ];

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const addFilter = () => {
    setAdvancedFilters((prev) => [
      ...prev,
      { id: `filter_${Date.now()}`, field: 'name', operator: 'contains', value: '' },
    ]);
  };

  const updateFilter = (id: string, patch: Partial<AdvancedFilter>) => {
    setAdvancedFilters((prev) =>
      prev.map((filter) => {
        if (filter.id !== id) return filter;
        const next = { ...filter, ...patch };
        const fieldType = filterFields.find((field) => field.value === next.field)?.type ?? 'text';
        if (fieldType === 'number' && (next.operator === 'contains')) next.operator = 'equals';
        if (fieldType === 'text' && (next.operator === 'gt' || next.operator === 'lt')) next.operator = 'contains';
        return next;
      }),
    );
  };

  const removeFilter = (id: string) => {
    setAdvancedFilters((prev) => prev.filter((filter) => filter.id !== id));
  };

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setModelFilter('all');
    setEnvFilter('all');
    setAdvancedFilters([]);
  };

  const applyPreset = (preset: 'errors' | 'slow' | 'lowScore') => {
    setIsFilterPanelOpen(true);
    setStatusFilter('all');
    setModelFilter('all');
    setEnvFilter('all');
    setSearch('');
    if (preset === 'errors') {
      setStatusFilter('error');
      setAdvancedFilters([]);
      return;
    }
    if (preset === 'slow') {
      setAdvancedFilters([{ id: 'filter_slow', field: 'duration', operator: 'gt', value: '2000' }]);
      return;
    }
    setAdvancedFilters([{ id: 'filter_low_score', field: 'score', operator: 'lt', value: '6' }]);
  };

  const stats = {
    total: mockTraces.length,
    observations: mockTraces.reduce((sum, t) => sum + getObservationCount(t), 0),
    errors: mockTraces.filter(t => t.status !== 'success').length,
    p95Latency: [...mockTraces].sort((a, b) => a.duration - b.duration)[Math.max(0, Math.ceil(mockTraces.length * 0.95) - 1)]?.duration ?? 0,
    totalCost: mockTraces.reduce((s, t) => s + t.cost, 0),
    avgScore: mockTraces.reduce((s, t) => s + getTraceScore(t), 0) / mockTraces.length,
  };

  return (
    <div className="bg-slate-50 min-h-full">
      <PageHeader
        title={currentProject?.name ?? '评估桥接项目'}
        description="当前项目的 Trace、调用链、评分、模型成本和延迟概览"
        actions={
          <>
            <button className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">
              <RefreshCw className="w-4 h-4" /> 刷新
            </button>
            <select
              value={timeRange}
              onChange={e => setTimeRange(e.target.value)}
              className="border border-slate-200 rounded-lg text-sm px-3 py-2 outline-none focus:border-blue-500 bg-white"
            >
              <option value="24h">24h</option>
              <option value="7d">7d</option>
              <option value="14d">14d</option>
              <option value="30d">30d</option>
              <option value="90d">90d</option>
            </select>
            <button className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">
              <Download className="w-4 h-4" /> 导出
            </button>
          </>
        }
      />

      {/* 统计卡片 */}
      <div className="grid grid-cols-5 gap-3 px-6 py-4 bg-white border-b border-slate-200">
        {[
          { label: 'Trace 数', value: stats.total.toLocaleString(), sub: `${timeRange} 时间窗口`, color: 'text-blue-600', icon: Activity },
          { label: '观测节点', value: stats.observations.toLocaleString(), sub: '调用步骤 + 生成调用', color: 'text-indigo-600', icon: Layers3 },
          { label: '错误率', value: `${((stats.errors / stats.total) * 100).toFixed(1)}%`, sub: `${stats.errors} 条受影响 Trace`, color: 'text-red-500', icon: Gauge },
          { label: 'P95 延迟', value: formatDuration(stats.p95Latency), sub: '端到端耗时', color: 'text-slate-700', icon: Clock3 },
          { label: '总成本', value: `$${stats.totalCost.toFixed(4)}`, sub: `平均分 ${stats.avgScore.toFixed(1)}`, color: 'text-emerald-600', icon: DollarSign },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-slate-500">{s.label}</div>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-slate-400 mt-0.5">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* 趋势图 */}
      <div className="px-6 py-4 bg-white border-b border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-slate-700 text-sm font-medium">Trace 数量与错误趋势（{timeRange}）</h4>
          <div className="flex gap-1">
            {['15m', '1h', '24h', '7d', '30d'].map(t => (
              <button
                key={t}
                onClick={() => setTimeRange(t)}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  timeRange === t ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={100}>
          <AreaChart data={traceOverTimeData}>
            <defs>
              <linearGradient id="traceGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
            <Area type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2} fill="url(#traceGrad)" name="Trace 数" />
            <Area type="monotone" dataKey="errors" stroke="#ef4444" strokeWidth={1.5} fill="none" name="错误数" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* 筛选栏 */}
      <div className="bg-white border-b border-slate-200">
        <div className="px-6 py-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-60 flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索 Trace 名称、ID、会话或用户..."
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500"
            />
          </div>
          <button
            onClick={() => setIsFilterPanelOpen((open) => !open)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
              isFilterPanelOpen || activeFilterCount > 0
                ? 'border-blue-200 bg-blue-50 text-blue-700'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            条件筛选
            {activeFilterCount > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded bg-blue-600 px-1.5 text-xs text-white">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown className={`w-4 h-4 transition-transform ${isFilterPanelOpen ? 'rotate-180' : ''}`} />
          </button>
          <button
            onClick={resetFilters}
            disabled={activeFilterCount === 0}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            重置
          </button>
        </div>

        {isFilterPanelOpen && (
          <div className="border-t border-slate-100 px-6 py-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-700">筛选条件</span>
                <span className="text-xs text-slate-400">当前显示 {traces.length} / {mockTraces.length} 条 Trace</span>
              </div>
              <div className="flex items-center gap-2">
                {[
                  { key: 'errors', label: '错误 Trace' },
                  { key: 'slow', label: '高延迟' },
                  { key: 'lowScore', label: '低分' },
                ].map((preset) => (
                  <button
                    key={preset.key}
                    onClick={() => applyPreset(preset.key as 'errors' | 'slow' | 'lowScore')}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                  >
                    {preset.label}
                  </button>
                ))}
                <button
                  onClick={addFilter}
                  className="flex items-center gap-1.5 rounded-lg border border-blue-200 px-2.5 py-1.5 text-xs text-blue-600 hover:bg-blue-50"
                >
                  <Plus className="w-3.5 h-3.5" /> 添加条件
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 mb-3 md:grid-cols-3">
              <label className="space-y-1">
                <span className="text-xs text-slate-500">环境</span>
                <select value={envFilter} onChange={e => setEnvFilter(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg text-sm px-3 py-2 outline-none focus:border-blue-500">
                  <option value="all">全部环境</option>
                  <option value="生产">生产</option>
                  <option value="预发">预发</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-500">状态</span>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg text-sm px-3 py-2 outline-none focus:border-blue-500">
                  <option value="all">全部状态</option>
                  <option value="success">成功</option>
                  <option value="error">错误</option>
                  <option value="partial_error">部分错误</option>
                  <option value="timeout">超时</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-500">模型</span>
                <select value={modelFilter} onChange={e => setModelFilter(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg text-sm px-3 py-2 outline-none focus:border-blue-500">
                  <option value="all">全部模型</option>
                  <option value="gpt-4o">gpt-4o</option>
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                  <option value="claude-3-5-sonnet">claude-3-5-sonnet</option>
                  <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                </select>
              </label>
            </div>

            <div className="space-y-2">
              {advancedFilters.length === 0 ? (
                <button
                  onClick={addFilter}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-slate-50 py-3 text-sm text-slate-500 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                >
                  <Plus className="w-4 h-4" /> 添加自定义筛选条件
                </button>
              ) : advancedFilters.map((filter) => {
                const fieldType = filterFields.find((field) => field.value === filter.field)?.type ?? 'text';
                const operators: FilterOperator[] = fieldType === 'number'
                  ? ['equals', 'notEquals', 'gt', 'lt']
                  : ['contains', 'equals', 'notEquals'];
                return (
                  <div key={filter.id} className="grid grid-cols-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 md:grid-cols-[180px_132px_minmax(220px,1fr)_32px]">
                    <select
                      value={filter.field}
                      onChange={(event) => updateFilter(filter.id, { field: event.target.value as FilterField })}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-500"
                    >
                      {filterFields.map((field) => (
                        <option key={field.value} value={field.value}>{field.label}</option>
                      ))}
                    </select>
                    <select
                      value={filter.operator}
                      onChange={(event) => updateFilter(filter.id, { operator: event.target.value as FilterOperator })}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-500"
                    >
                      {operators.map((operator) => (
                        <option key={operator} value={operator}>{operatorLabels[operator]}</option>
                      ))}
                    </select>
                    <input
                      value={filter.value}
                      onChange={(event) => updateFilter(filter.id, { value: event.target.value })}
                      placeholder={fieldType === 'number' ? '输入数值' : '输入筛选值'}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={() => removeFilter(filter.id)}
                      className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-700"
                      title="删除条件"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>

            {filterSummaries.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {filterSummaries.map((filter) => (
                  <button
                    key={filter.id}
                    onClick={filter.onRemove}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700 hover:bg-blue-100"
                    title="移除此条件"
                  >
                    {filter.label}
                    <X className="h-3 w-3" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {selectedIds.size > 0 && (
          <div className="px-6 pb-3 flex items-center gap-2">
            <span className="text-sm text-slate-600">已选 <span className="font-semibold text-slate-800">{selectedIds.size}</span> 条</span>
            <button
              onClick={() => setShowBatchAnnotation(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50"
            >
              <Tag className="w-3.5 h-3.5" /> 批量标注
            </button>
            <button
              onClick={() => setShowLaunchEvaluation(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50"
            >
              <Sparkles className="w-3.5 h-3.5" /> 发起评测
            </button>
          </div>
        )}

        {launchedEvaluation && (
          <div className="px-6 pb-3">
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <div>
                已发起评测「{launchedEvaluation.name}」，来源：{launchedEvaluation.source}，评估器：{launchedEvaluation.evaluator}，范围：{launchedEvaluation.traceCount} 条，并发：{launchedEvaluation.concurrency}，重试：{launchedEvaluation.retries}，缓存：{launchedEvaluation.cacheEnabled ? '开启' : '关闭'}
              </div>
              <button onClick={() => setLaunchedEvaluation(null)} className="ml-auto text-emerald-600 hover:text-emerald-800">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 表格 */}
      <div className="overflow-x-auto bg-white">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="w-10 px-4 py-3">
                <input type="checkbox" className="rounded border-slate-300" />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">名称 / ID</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">时间</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">环境</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">模型</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">状态</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">观测</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">评分</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">延迟</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Token</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">费用</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">用户 / 会话</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {traces.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-6 py-12 text-center">
                  <div className="text-sm font-medium text-slate-600">无匹配 Trace</div>
                  <div className="mt-1 text-xs text-slate-400">调整筛选条件或重置后再查看</div>
                </td>
              </tr>
            ) : traces.map(trace => (
              <tr key={trace.id} className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                onClick={() => setSelectedTrace(trace)}>
                <td className="px-4 py-3" onClick={e => { e.stopPropagation(); toggleSelect(trace.id); }}>
                  <input type="checkbox" checked={selectedIds.has(trace.id)} onChange={() => {}} className="rounded border-slate-300" />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-slate-900">{getTraceName(trace)}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <div className="text-xs text-blue-600 font-mono mt-0.5">{trace.id}</div>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500 font-mono whitespace-nowrap">
                  <div>{new Date(trace.startTime).toLocaleTimeString('zh-CN')}</div>
                  <div className="mt-0.5 text-slate-400">{new Date(trace.startTime).toLocaleDateString('zh-CN')}</div>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{getEnvironment(trace)}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${modelColors[trace.model] ?? 'bg-slate-100 text-slate-600'}`}>
                    {trace.model}
                  </span>
                </td>
                <td className="px-4 py-3"><StatusBadge status={trace.status} /></td>
                <td className="px-4 py-3 text-right text-sm font-mono text-slate-700">
                  {getObservationCount(trace)}
                </td>
                <td className={`px-4 py-3 text-right text-sm font-mono font-semibold ${
                  getTraceScore(trace) >= 7 ? 'text-emerald-600' : getTraceScore(trace) >= 5 ? 'text-amber-600' : 'text-red-600'
                }`}>
                  {getTraceScore(trace).toFixed(1)}
                </td>
                <td className={`px-4 py-3 text-right text-sm font-mono ${trace.duration > 10000 ? 'text-red-600 font-semibold' : 'text-slate-700'}`}>
                  {formatDuration(trace.duration)}
                </td>
                <td className="px-4 py-3 text-right text-sm font-mono text-slate-700">{trace.tokens.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-sm font-mono text-slate-700">${trace.cost.toFixed(4)}</td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  <div>{trace.userId}</div>
                  <div className="mt-0.5 text-xs font-mono text-slate-400">{trace.sessionId}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-white">
          <span className="text-sm text-slate-500">显示 {traces.length} / {mockTraces.length} 条</span>
          <div className="flex items-center gap-1">
            {[1, 2, 3, '...', 12].map((p, i) => (
              <button key={i} className={`w-8 h-8 text-sm rounded-lg ${p === 1 ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{p}</button>
            ))}
          </div>
        </div>
      </div>

      {selectedTrace && <TraceDetailPanel trace={selectedTrace} onClose={() => setSelectedTrace(null)} />}
      {showBatchAnnotation && (
        <AnnotationTaskModal traceCount={selectedIds.size} onClose={() => setShowBatchAnnotation(false)} />
      )}
      {showLaunchEvaluation && (
        <LaunchEvaluationModal
          traceCount={selectedIds.size}
          onClose={() => setShowLaunchEvaluation(false)}
          onLaunch={setLaunchedEvaluation}
        />
      )}
    </div>
  );
}
