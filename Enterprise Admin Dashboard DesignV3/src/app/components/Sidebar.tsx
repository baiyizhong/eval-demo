import { NavLink, useNavigate } from 'react-router';
import {
  LayoutGrid, Settings, Users, Building2, Activity, FlaskConical,
  ClipboardList, Bot, PenLine, Database, Cpu, ChevronDown,
  ArrowLeft, Shield
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { mockProjects } from '../data/mockData';
import { useState } from 'react';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
    isActive
      ? 'bg-blue-600 text-white'
      : 'text-slate-300 hover:bg-slate-700/60 hover:text-white'
  }`;

const sectionLabel = (label: string) => (
  <div className="px-3 pt-4 pb-1">
    <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</span>
  </div>
);

export function Sidebar() {
  const { currentProject, setCurrentProject, projects } = useApp();
  const navigate = useNavigate();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const activeProjects = projects.filter(p => p.status === 'active');

  function handleProjectSwitch(projectId: string | null) {
    setSwitcherOpen(false);
    if (projectId === null) {
      setCurrentProject(null);
      navigate('/');
    } else {
      const p = projects.find(x => x.id === projectId) ?? null;
      setCurrentProject(p);
      if (p) navigate(`/project/${p.id}/traces`);
    }
  }

  return (
    <aside className="flex flex-col w-60 min-h-screen bg-slate-900 border-r border-slate-800">
      {/* 品牌 */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-slate-800">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
          <Activity className="w-4 h-4 text-white" />
        </div>
        <div>
          <div className="text-white text-sm font-semibold leading-tight">ObserveIQ</div>
          <div className="text-slate-500 text-xs">LLM 可观测性平台</div>
        </div>
      </div>

      {/* 项目切换器 */}
      <div className="px-3 py-3 border-b border-slate-800">
        <button
          onClick={() => setSwitcherOpen(o => !o)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm text-white transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <LayoutGrid className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <span className="truncate">{currentProject?.name ?? '切换项目'}</span>
          </div>
          <ChevronDown className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${switcherOpen ? 'rotate-180' : ''}`} />
        </button>
        {switcherOpen && (
          <div className="mt-1 bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
            <button
              onClick={() => handleProjectSwitch(null)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            >
              <Shield className="w-3.5 h-3.5 text-slate-400" />
              切换项目
            </button>
            <div className="border-t border-slate-700 my-0.5" />
            {activeProjects.map(p => (
              <button
                key={p.id}
                onClick={() => handleProjectSwitch(p.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                  currentProject?.id === p.id ? 'text-blue-400 bg-slate-700' : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                <div className="w-3.5 h-3.5 rounded-sm bg-blue-600 flex-shrink-0" />
                <span className="truncate">{p.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 导航菜单 */}
      <nav className="flex-1 px-3 py-2 overflow-y-auto">
        {currentProject ? (
          <>
            <button
              onClick={() => handleProjectSwitch(null)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white transition-colors w-full mb-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              返回系统层
            </button>

            {sectionLabel('可观测性')}
            <NavLink to={`/project/${currentProject.id}/traces`} className={navLinkClass}>
              <Activity className="w-4 h-4" /> Trace 日志
            </NavLink>

            {sectionLabel('评测')}
            <NavLink to={`/project/${currentProject.id}/evaluations`} end className={navLinkClass}>
              <ClipboardList className="w-4 h-4" /> 评测报告
            </NavLink>
            <NavLink to={`/project/${currentProject.id}/evaluations/judge`} className={navLinkClass}>
              <Bot className="w-4 h-4" /> LLM 评测
            </NavLink>
            <NavLink to={`/project/${currentProject.id}/evaluations/annotation`} className={navLinkClass}>
              <PenLine className="w-4 h-4" /> 人工标注
            </NavLink>
            <NavLink to={`/project/${currentProject.id}/evaluations/datasets`} className={navLinkClass}>
              <Database className="w-4 h-4" /> 数据集
            </NavLink>

            {sectionLabel('配置')}
            <NavLink to={`/project/${currentProject.id}/evaluators`} className={navLinkClass}>
              <Cpu className="w-4 h-4" /> 评估器管理
            </NavLink>
            <NavLink to={`/project/${currentProject.id}/settings`} className={navLinkClass}>
              <Settings className="w-4 h-4" /> 项目设置
            </NavLink>
          </>
        ) : (
          <>
            {sectionLabel('项目')}
            <NavLink to="/" end className={navLinkClass}>
              <LayoutGrid className="w-4 h-4" /> 项目列表
            </NavLink>

            {sectionLabel('系统管理')}
            <NavLink to="/system/tenants" className={navLinkClass}>
              <Building2 className="w-4 h-4" /> 租户管理
            </NavLink>
            <NavLink to="/system/users" className={navLinkClass}>
              <Users className="w-4 h-4" /> 用户管理
            </NavLink>
            <NavLink to="/system/settings" className={navLinkClass}>
              <Settings className="w-4 h-4" /> 系统设置
            </NavLink>
          </>
        )}
      </nav>

      {/* 底部用户信息 */}
      <div className="px-3 py-3 border-t border-slate-800">
        <div className="flex items-center gap-2.5 px-3 py-2">
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs text-white font-semibold flex-shrink-0">
            陈
          </div>
          <div className="min-w-0">
            <div className="text-slate-200 text-xs font-medium truncate">陈小丽</div>
            <div className="text-slate-500 text-xs truncate">所有者</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
