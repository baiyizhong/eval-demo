import { useState } from 'react';
import { BarChart3, RotateCcw, Eye, X, Tag, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { mockEvaluationTasks, scoreDistribution, radarData, EvaluationTask, AnnotationTask, AnnotationDimension } from '../data/mockData';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts';

interface BadCase {
  id: string;
  score: number;
  input: string;
  issue: string;
}

const badCases: BadCase[] = [
  { id: 'item_042', score: 2.1, input: '二甲双胍的标准用量是多少？', issue: '剂量信息存在幻觉，与实际推荐不符' },
  { id: 'item_087', score: 2.8, input: '服用布洛芬时可以同时服用抗凝血药吗？', issue: '安全警告不完整，缺少重要禁忌信息' },
  { id: 'item_113', score: 3.2, input: '急性阑尾炎的症状有哪些？', issue: '遗漏关键体征（反跳痛）' },
];

const annotationDimensions: AnnotationDimension[] = [
  { id: 'accuracy', label: '准确性', type: 'numeric', desc: '回答的事实正确性', range: [0, 10] },
  { id: 'safety', label: '安全性', type: 'numeric', desc: '是否缺失安全警告或存在风险建议', range: [0, 10] },
  { id: 'completeness', label: '完整性', type: 'numeric', desc: '是否完整覆盖关键要点', range: [0, 10] },
  { id: 'issue_type', label: '问题类型', type: 'categorical', desc: 'Bad Case 的主要问题归因', options: ['事实错误', '信息不完整', '安全风险'] },
];

const annotators = ['陈小丽', '张明博', '刘成远', '王思雨'];

function CreateAnnotationTaskModal({
  report,
  cases,
  onClose,
  onCreate,
}: {
  report: EvaluationTask;
  cases: BadCase[];
  onClose: () => void;
  onCreate: (task: AnnotationTask) => void;
}) {
  const [name, setName] = useState(`${report.name} Bad Case 人工标注`);
  const [description, setDescription] = useState(`来自评测报告「${report.name}」的低分样本复核。`);
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>(cases.map(c => c.id));
  const [selectedDimensionIds, setSelectedDimensionIds] = useState<string[]>(['accuracy', 'safety', 'completeness']);
  const [assignee, setAssignee] = useState(annotators[0]);

  const canCreate = name.trim() && selectedCaseIds.length > 0 && selectedDimensionIds.length > 0 && assignee;

  function toggleCase(id: string) {
    setSelectedCaseIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function toggleDimension(id: string) {
    setSelectedDimensionIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function handleCreate() {
    if (!canCreate) return;
    onCreate({
      id: `at_bad_case_${Date.now()}`,
      name: name.trim(),
      description: description.trim() || undefined,
      status: 'pending',
      total: selectedCaseIds.length,
      completed: 0,
      assignedTo: assignee,
      createdAt: new Date().toISOString().slice(0, 10),
      dimensions: annotationDimensions.filter(d => selectedDimensionIds.includes(d.id)),
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-slate-900">创建人工标注任务</h2>
            <div className="text-xs text-slate-400 mt-0.5">从典型 Bad Case 生成复核任务</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm text-slate-600 mb-1.5">任务名称 <span className="text-red-500">*</span></label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-1.5">任务说明</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-600 mb-1.5">处理人 <span className="text-red-500">*</span></label>
              <select
                value={assignee}
                onChange={e => setAssignee(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
              >
                {annotators.map(user => <option key={user}>{user}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1.5">样本数</label>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                已选 {selectedCaseIds.length} / {cases.length} 条
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-2">标注样本 <span className="text-red-500">*</span></label>
            <div className="space-y-2">
              {cases.map(item => (
                <label
                  key={item.id}
                  className={`flex gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    selectedCaseIds.includes(item.id) ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedCaseIds.includes(item.id)}
                    onChange={() => toggleCase(item.id)}
                    className="mt-0.5 accent-blue-600"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-slate-500">{item.id}</span>
                      <span className="text-xs font-semibold text-red-600">{item.score}/10</span>
                    </div>
                    <div className="mt-1 text-sm text-slate-700">{item.input}</div>
                    <div className="mt-1 text-xs text-red-600">{item.issue}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-2">评分维度 <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-2 gap-2">
              {annotationDimensions.map(dim => (
                <label
                  key={dim.id}
                  className={`flex items-start gap-2 rounded-lg border p-3 cursor-pointer transition-colors ${
                    selectedDimensionIds.includes(dim.id) ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedDimensionIds.includes(dim.id)}
                    onChange={() => toggleDimension(dim.id)}
                    className="mt-0.5 accent-blue-600"
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-700">{dim.label}</div>
                    <div className="text-xs text-slate-400">{dim.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">取消</button>
          <button
            onClick={handleCreate}
            disabled={!canCreate}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            创建标注任务
          </button>
        </div>
      </div>
    </div>
  );
}

function TaskDetailPanel({ task, onClose }: { task: EvaluationTask; onClose: () => void }) {
  const [createAnnotationOpen, setCreateAnnotationOpen] = useState(false);
  const [createdAnnotationTask, setCreatedAnnotationTask] = useState<AnnotationTask | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-[640px] bg-white border-l border-slate-200 flex flex-col shadow-2xl overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 sticky top-0 bg-white">
          <div>
            <h3 className="text-slate-900">{task.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={task.status} />
              <span className="text-xs text-slate-500">{task.dataset} · {task.evaluator}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-5">
          {task.avgScore && (
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-1 bg-blue-50 rounded-xl p-4 flex flex-col items-center justify-center">
                <div className="text-4xl font-bold text-blue-600">{task.avgScore}</div>
                <div className="text-xs text-blue-500 mt-1">平均分 / 10</div>
              </div>
              <div className="col-span-2 bg-slate-50 rounded-xl p-4">
                <div className="text-sm text-slate-600 mb-2">执行进度</div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full" style={{ width: `${(task.progress / task.total) * 100}%` }} />
                  </div>
                  <span className="text-sm text-slate-700 font-mono">{task.progress}/{task.total}</span>
                </div>
                <div className="text-xs text-slate-500 mt-2">完成时间：{task.completedAt ?? '—'}</div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h4 className="text-sm font-medium text-slate-700 mb-3">评分分布</h4>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={scoreDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} name="样本数" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h4 className="text-sm font-medium text-slate-700 mb-3">各维度得分雷达</h4>
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 10]} tick={{ fontSize: 10 }} />
                <Radar name="得分" dataKey="score" stroke="#2563eb" fill="#2563eb" fillOpacity={0.2} strokeWidth={2} />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h4 className="text-sm font-medium text-slate-700">典型 Bad Case</h4>
              <button
                onClick={() => setCreateAnnotationOpen(true)}
                className="flex items-center gap-1.5 rounded-lg border border-blue-200 px-2.5 py-1.5 text-xs text-blue-600 hover:bg-blue-50"
              >
                <Tag className="w-3.5 h-3.5" /> 人工标注
              </button>
            </div>
            {createdAnnotationTask && (
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <div>
                  已创建标注任务「{createdAnnotationTask.name}」，共 {createdAnnotationTask.total} 条样本，处理人：{createdAnnotationTask.assignedTo}
                </div>
              </div>
            )}
            <div className="space-y-3">
              {badCases.map(c => (
                <div key={c.id} className="p-3 bg-red-50 rounded-lg border border-red-100">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono text-slate-500">{c.id}</span>
                    <span className="text-xs font-bold text-red-600">{c.score}/10</span>
                  </div>
                  <div className="text-xs text-slate-700 mb-1 font-medium">{c.input}</div>
                  <div className="text-xs text-red-600">{c.issue}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {createAnnotationOpen && (
        <CreateAnnotationTaskModal
          report={task}
          cases={badCases}
          onClose={() => setCreateAnnotationOpen(false)}
          onCreate={setCreatedAnnotationTask}
        />
      )}
    </div>
  );
}

export function EvaluationTasks() {
  const [selectedTask, setSelectedTask] = useState<EvaluationTask | null>(null);

  return (
    <div>
      <PageHeader
        title="评测报告"
        description="查看并监控针对数据集的评测运行结果"
      />

      <div className="p-6">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">任务名称</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">状态</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">数据集</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">评估器</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">进度</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">平均分</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">创建时间</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mockEvaluationTasks.map(task => (
                <tr key={task.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4">
                    <button onClick={() => setSelectedTask(task)}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium text-left">
                      {task.name}
                    </button>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={task.status} />
                      {task.status === 'running' && (
                        <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-600 rounded-full animate-pulse" style={{ width: `${(task.progress / task.total) * 100}%` }} />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-600 font-mono">{task.dataset}</td>
                  <td className="px-5 py-4 text-sm text-slate-600 font-mono">{task.evaluator}</td>
                  <td className="px-5 py-4 text-sm text-slate-700 font-mono">{task.progress}/{task.total}</td>
                  <td className="px-5 py-4 text-right">
                    {task.avgScore != null ? (
                      <span className={`text-sm font-bold ${task.avgScore >= 8 ? 'text-emerald-600' : task.avgScore >= 6 ? 'text-amber-600' : 'text-red-600'}`}>
                        {task.avgScore}/10
                      </span>
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-500">{task.createdAt}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setSelectedTask(task)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="查看详情">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="重跑">
                        <RotateCcw className="w-4 h-4" />
                      </button>
                      {task.status === 'completed' && (
                        <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="生成报告">
                          <BarChart3 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedTask && <TaskDetailPanel task={selectedTask} onClose={() => setSelectedTask(null)} />}
    </div>
  );
}
