import { useState } from 'react';
import { Plus, Edit2, Trash2, ToggleRight, ChevronRight, Zap, Code2, Sliders, X } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { mockEvaluators } from '../data/mockData';

const typeIcons: Record<string, React.ReactNode> = {
  llm_judge: <Zap className="w-4 h-4 text-indigo-500" />,
  code_rule: <Code2 className="w-4 h-4 text-cyan-500" />,
  heuristic: <Sliders className="w-4 h-4 text-amber-500" />,
};

const typeDesc: Record<string, string> = {
  llm_judge: '使用大模型评估输出质量',
  code_rule: '确定性代码规则验证',
  heuristic: '统计或规则打分',
};

const codeTemplate = `function evaluate(input, output, reference, metadata) {
  // 检查输出是否为合法 JSON
  try {
    const parsed = JSON.parse(output);
    const hasRequiredFields =
      'accuracy' in parsed &&
      'relevance' in parsed &&
      typeof parsed.accuracy === 'number';

    return {
      score: hasRequiredFields ? 10 : 0,
      passed: hasRequiredFields,
      reason: hasRequiredFields
        ? "输出是包含必要字段的合法 JSON"
        : "缺少必要字段：accuracy, relevance"
    };
  } catch (e) {
    return {
      score: 0,
      passed: false,
      reason: "输出不是合法 JSON: " + e.message
    };
  }
}`;

function CreateEvaluatorWizard({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [type, setType] = useState<'llm_judge' | 'code_rule' | 'heuristic'>('llm_judge');
  const [name, setName] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-slate-900">新建评估器 — 第 {step}/3 步</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-5">
          {step === 1 && (
            <div className="space-y-3">
              <label className="block text-sm text-slate-600 mb-3">选择评估器类型</label>
              {(['llm_judge', 'code_rule', 'heuristic'] as const).map(t => (
                <label key={t}
                  className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-colors ${
                    type === t ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                  }`}>
                  <input type="radio" checked={type === t} onChange={() => setType(t)} className="text-blue-600 mt-1" />
                  <div className="flex items-center gap-2">
                    {typeIcons[t]}
                    <div>
                      <div className="text-sm font-semibold text-slate-800 mb-0.5"><StatusBadge status={t} size="md" /></div>
                      <div className="text-xs text-slate-500 mt-1">{typeDesc[t]}</div>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-600 mb-1.5">评估器名称 *</label>
                <input value={name} onChange={e => setName(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
                  placeholder="例如：medical-accuracy-judge" />
              </div>

              {type === 'llm_judge' && (
                <div>
                  <label className="block text-sm text-slate-600 mb-1.5">Judge 模型</label>
                  <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500">
                    <option>gpt-4o</option>
                    <option>claude-3-5-sonnet</option>
                    <option>gemini-1.5-pro</option>
                  </select>
                  <div className="mt-3">
                    <label className="block text-sm text-slate-600 mb-1.5">评测 Prompt 模板</label>
                    <textarea rows={8}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-blue-500 resize-none bg-slate-950 text-slate-200"
                      defaultValue={"你是一位专业的质量评测专家。请对以下输出进行准确性评分（0-10分）。\n\n输入：{{ input }}\n输出：{{ actual_output }}\n\n请以 JSON 格式返回：{\"score\": 0-10, \"reason\": \"评分理由\"}"} />
                  </div>
                </div>
              )}

              {type === 'code_rule' && (
                <div>
                  <label className="block text-sm text-slate-600 mb-1.5">评估函数（JavaScript）</label>
                  <textarea rows={14}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-blue-500 resize-none bg-slate-950 text-slate-200"
                    defaultValue={codeTemplate} />
                </div>
              )}

              {type === 'heuristic' && (
                <div className="space-y-3">
                  <label className="block text-sm text-slate-600 mb-2">预设函数</label>
                  {['回复长度检测', 'Token 数量统计', '关键词存在检测', 'JSON 格式验证'].map(f => (
                    <label key={f} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 cursor-pointer hover:border-slate-300">
                      <input type="radio" name="heuristic" className="text-blue-600" />
                      <span className="text-sm text-slate-700">{f}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-3">测试评估器</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">示例输入</label>
                    <textarea rows={3} defaultValue="2型糖尿病的症状有哪些？"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 resize-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">示例输出</label>
                    <textarea rows={3} defaultValue='{"accuracy": 8, "relevance": 9, "safety": 10, "reasoning": "症状覆盖较全面"}'
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 resize-none" />
                  </div>
                </div>
                <button className="mt-3 flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                  <Zap className="w-4 h-4" /> 运行测试
                </button>
              </div>
              <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-sm font-semibold text-emerald-700">测试通过</span>
                </div>
                <pre className="text-xs text-emerald-800 font-mono">{JSON.stringify({ score: 8, passed: true, reason: "合法 JSON，包含必要字段" }, null, 2)}</pre>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">取消</button>
          {step > 1 && <button onClick={() => setStep(s => s - 1)} className="px-4 py-2 text-sm text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">上一步</button>}
          {step < 3 ? (
            <button onClick={() => setStep(s => s + 1)} className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700">
              下一步 <ChevronRight className="inline w-4 h-4" />
            </button>
          ) : (
            <button onClick={onClose} className="px-4 py-2 text-sm text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">
              发布上线
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function Evaluators() {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div>
      <PageHeader
        title="评估器管理"
        description="创建和管理评测逻辑组件"
        actions={
          <button onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
            <Plus className="w-4 h-4" /> 新建评估器
          </button>
        }
      />

      <div className="p-6">
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { type: 'llm_judge', label: 'LLM 评测员', count: 3, icon: <Zap className="w-5 h-5 text-indigo-500" />, desc: '基于大模型评测' },
            { type: 'code_rule', label: '代码规则', count: 1, icon: <Code2 className="w-5 h-5 text-cyan-500" />, desc: '确定性代码验证' },
            { type: 'heuristic', label: '启发式', count: 2, icon: <Sliders className="w-5 h-5 text-amber-500" />, desc: '统计 / 指标评分' },
          ].map(t => (
            <div key={t.type} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                {t.icon}
              </div>
              <div>
                <div className="text-xl font-bold text-slate-800">{t.count}</div>
                <div className="text-sm text-slate-600">{t.label}</div>
                <div className="text-xs text-slate-400">{t.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">名称</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">类型</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">状态</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">累计使用</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">创建时间</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mockEvaluators.map(ev => (
                <tr key={ev.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2.5">
                      {typeIcons[ev.type]}
                      <span className="text-sm font-medium text-slate-800 font-mono">{ev.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4"><StatusBadge status={ev.type} /></td>
                  <td className="px-5 py-4"><StatusBadge status={ev.status} /></td>
                  <td className="px-5 py-4 text-right text-sm font-mono text-slate-700">{ev.usageCount.toLocaleString()} 次</td>
                  <td className="px-5 py-4 text-sm text-slate-500">{ev.createdAt}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="编辑"><Edit2 className="w-4 h-4" /></button>
                      <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title={ev.status === 'active' ? '下线' : '上线'}>
                        <ToggleRight className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500" title="删除">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {createOpen && <CreateEvaluatorWizard onClose={() => setCreateOpen(false)} />}
    </div>
  );
}
