import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Plus, Search, MoreHorizontal, Activity, Clock, Archive, Trash2, Edit2, X } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { useApp } from '../context/AppContext';
import { mockProjects, Project } from '../data/mockData';

function ProjectCard({ project, onSelect }: { project: Project; onSelect: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className="bg-white rounded-xl border border-slate-200 p-5 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group relative"
      onClick={onSelect}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center">
          <Activity className="w-5 h-5 text-blue-600" />
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={project.status} />
          <button
            className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 opacity-0 group-hover:opacity-100 transition-all"
            onClick={e => { e.stopPropagation(); setMenuOpen(o => !o); }}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {menuOpen && (
        <div
          className="absolute top-14 right-4 z-10 bg-white rounded-lg border border-slate-200 shadow-lg overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          <button className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 w-full">
            <Edit2 className="w-3.5 h-3.5" /> 编辑项目
          </button>
          <button className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 w-full">
            <Archive className="w-3.5 h-3.5" /> 归档项目
          </button>
          <div className="border-t border-slate-100" />
          <button className="flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 w-full">
            <Trash2 className="w-3.5 h-3.5" /> 删除项目
          </button>
        </div>
      )}

      <h3 className="text-slate-900 mb-1 truncate">{project.name}</h3>
      <p className="text-slate-500 text-sm line-clamp-2 mb-4 leading-relaxed">{project.description}</p>

      <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-100 pt-3">
        <div className="flex items-center gap-1">
          <Activity className="w-3 h-3" />
          <span>{project.traceCount.toLocaleString()} 条 Trace</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span>活跃于 {new Date(project.lastActiveAt).toLocaleDateString('zh-CN')}</span>
        </div>
      </div>
    </div>
  );
}

function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-slate-900">新建项目</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-700 mb-1.5">项目名称 <span className="text-red-500">*</span></label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="例如：客服机器人 v2"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-700 mb-1.5">项目描述</label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              rows={3}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none"
              placeholder="该项目的用途是什么？"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
              取消
            </button>
            <button
              onClick={onClose}
              disabled={!name.trim()}
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              创建项目
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProjectList() {
  const { setCurrentProject } = useApp();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'created' | 'active'>('active');
  const [createOpen, setCreateOpen] = useState(false);

  const projects = mockProjects.filter(p => {
    if (!showArchived && p.status === 'archived') return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'created') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime();
  });

  function handleSelect(project: typeof mockProjects[0]) {
    setCurrentProject(project);
    navigate(`/project/${project.id}/traces`);
  }

  return (
    <div>
      <PageHeader
        title="项目列表"
        description="选择一个项目以查看 Trace 日志并执行评测"
        actions={
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> 新建项目
          </button>
        }
      />

      {/* 工具栏 */}
      <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索项目..."
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <button
          onClick={() => setShowArchived(o => !o)}
          className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm transition-colors ${
            showArchived ? 'border-blue-400 text-blue-700 bg-blue-50' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Archive className="w-4 h-4" />
          {showArchived ? '隐藏归档' : '显示归档'}
        </button>

        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as typeof sortBy)}
          className="border border-slate-200 rounded-lg text-sm px-3 py-2 outline-none focus:border-blue-500"
        >
          <option value="active">排序：最近活跃</option>
          <option value="created">排序：创建时间</option>
          <option value="name">排序：名称</option>
        </select>
      </div>

      {/* 卡片网格 */}
      <div className="p-6">
        {projects.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <Activity className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-slate-500 mb-4">暂无项目</p>
            <button
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" /> 创建第一个项目
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {projects.map(p => (
              <ProjectCard key={p.id} project={p} onSelect={() => handleSelect(p)} />
            ))}
          </div>
        )}
      </div>

      {createOpen && <CreateProjectModal onClose={() => setCreateOpen(false)} />}
    </div>
  );
}
