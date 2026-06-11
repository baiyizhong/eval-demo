interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

const statusMap: Record<string, string> = {
  success: 'bg-emerald-100 text-emerald-700',
  error: 'bg-red-100 text-red-700',
  partial_error: 'bg-orange-100 text-orange-700',
  timeout: 'bg-slate-100 text-slate-600',
  active: 'bg-emerald-100 text-emerald-700',
  archived: 'bg-slate-100 text-slate-500',
  pending: 'bg-slate-100 text-slate-600',
  running: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-500',
  paused: 'bg-amber-100 text-amber-700',
  invited: 'bg-yellow-100 text-yellow-700',
  suspended: 'bg-red-100 text-red-700',
  inactive: 'bg-slate-100 text-slate-500',
  in_progress: 'bg-blue-100 text-blue-700',
  review: 'bg-purple-100 text-purple-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  free: 'bg-slate-100 text-slate-600',
  pro: 'bg-blue-100 text-blue-700',
  enterprise: 'bg-purple-100 text-purple-700',
  llm_judge: 'bg-indigo-100 text-indigo-700',
  code_rule: 'bg-cyan-100 text-cyan-700',
  heuristic: 'bg-amber-100 text-amber-700',
};

const labelMap: Record<string, string> = {
  success: '成功', error: '错误', partial_error: '部分错误', timeout: '超时',
  active: '启用', archived: '已归档', pending: '待处理', running: '运行中',
  completed: '已完成', failed: '失败', cancelled: '已取消', paused: '已暂停', invited: '已邀请',
  suspended: '已停用', inactive: '已下线', in_progress: '进行中', review: '待审核',
  approved: '已通过', rejected: '已打回', free: '免费版', pro: '专业版',
  enterprise: '企业版', llm_judge: 'LLM 评测员', code_rule: '代码规则', heuristic: '启发式',
};

export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const colorClass = statusMap[status] ?? 'bg-slate-100 text-slate-600';
  const label = labelMap[status] ?? status;
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-2.5 py-1';
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${colorClass} ${sizeClass}`}>
      {label}
    </span>
  );
}
