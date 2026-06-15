import { useMemo, useState } from "react";
import {
  Activity,
  Archive,
  Clock,
  Edit2,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  X
} from "lucide-react";

type ProjectStatus = "active" | "archived";

interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  traceCount: number;
  createdAt: string;
  lastActiveAt: string;
}

const mockProjects: Project[] = [
  {
    id: "p1",
    name: "医疗问答助手",
    description: "面向临床决策支持的 LLM 问答系统，与医院 EMR 系统深度集成。",
    status: "active",
    traceCount: 12847,
    createdAt: "2026-01-15",
    lastActiveAt: "2026-06-10"
  },
  {
    id: "p2",
    name: "客服智能机器人",
    description: "处理退款申请、技术问题和产品咨询的自动化一线客服代理。",
    status: "active",
    traceCount: 45231,
    createdAt: "2026-02-03",
    lastActiveAt: "2026-06-10"
  },
  {
    id: "p3",
    name: "代码审查助手",
    description: "基于 Claude 的自动化代码审查流水线，提供安全性、正确性和风格反馈。",
    status: "active",
    traceCount: 8932,
    createdAt: "2026-03-10",
    lastActiveAt: "2026-06-09"
  },
  {
    id: "p4",
    name: "法律文档摘要",
    description: "面向法务团队的合同分析与摘要工具，支持 12 种文档类型。",
    status: "active",
    traceCount: 3201,
    createdAt: "2026-03-22",
    lastActiveAt: "2026-06-08"
  },
  {
    id: "p5",
    name: "销售智能副驾",
    description: "会议后实时生成跟进邮件并自动更新 CRM 的销售助手。",
    status: "active",
    traceCount: 7654,
    createdAt: "2026-04-01",
    lastActiveAt: "2026-06-07"
  },
  {
    id: "p6",
    name: "HR 政策机器人（旧版）",
    description: "已废弃的 HR 政策问答机器人，功能已迁移至客服智能机器人。",
    status: "archived",
    traceCount: 1230,
    createdAt: "2025-10-10",
    lastActiveAt: "2026-02-01"
  }
];

const statusLabels: Record<ProjectStatus, string> = {
  active: "启用",
  archived: "已归档"
};

function PageHeader({ onCreate }: { onCreate: () => void }) {
  return (
    <header className="page-header">
      <div>
        <h1>项目列表</h1>
        <p>选择一个项目以查看 Trace 日志并执行评测</p>
      </div>
      <button className="primary-button" type="button" onClick={onCreate}>
        <Plus size={16} aria-hidden="true" />
        新建项目
      </button>
    </header>
  );
}

function StatusBadge({ status }: { status: ProjectStatus }) {
  return <span className={`status-badge status-badge-${status}`}>{statusLabels[status]}</span>;
}

function ProjectCard({ project }: { project: Project }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <article className="project-card">
      <div className="project-card-top">
        <div className="project-icon">
          <Activity size={20} aria-hidden="true" />
        </div>
        <div className="project-actions">
          <StatusBadge status={project.status} />
          <button
            className="icon-button project-menu-button"
            type="button"
            aria-label={`打开 ${project.name} 操作菜单`}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreHorizontal size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="project-menu">
          <button type="button">
            <Edit2 size={14} aria-hidden="true" />
            编辑项目
          </button>
          <button type="button">
            <Archive size={14} aria-hidden="true" />
            归档项目
          </button>
          <button className="danger" type="button">
            <Trash2 size={14} aria-hidden="true" />
            删除项目
          </button>
        </div>
      )}

      <h2>{project.name}</h2>
      <p>{project.description}</p>

      <footer className="project-card-footer">
        <span>
          <Activity size={12} aria-hidden="true" />
          {project.traceCount.toLocaleString("zh-CN")} 条 Trace
        </span>
        <span>
          <Clock size={12} aria-hidden="true" />
          活跃于 {new Date(project.lastActiveAt).toLocaleDateString("zh-CN")}
        </span>
      </footer>
    </article>
  );
}

function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel" aria-label="新建项目">
        <div className="modal-header">
          <h2>新建项目</h2>
          <button className="icon-button" type="button" aria-label="关闭" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <label>
          项目名称
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：客服机器人 v2" />
        </label>
        <label>
          项目描述
          <textarea rows={3} placeholder="该项目的用途是什么？" />
        </label>
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary-button" type="button" disabled={!name.trim()} onClick={onClose}>
            创建项目
          </button>
        </div>
      </section>
    </div>
  );
}

export function ProjectList() {
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [sortBy, setSortBy] = useState<"active" | "created" | "name">("active");
  const [createOpen, setCreateOpen] = useState(false);

  const projects = useMemo(() => {
    return mockProjects
      .filter((project) => {
        if (!showArchived && project.status === "archived") return false;
        if (!search.trim()) return true;
        return project.name.toLowerCase().includes(search.trim().toLowerCase());
      })
      .sort((first, second) => {
        if (sortBy === "name") return first.name.localeCompare(second.name, "zh-CN");
        if (sortBy === "created") return new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime();
        return new Date(second.lastActiveAt).getTime() - new Date(first.lastActiveAt).getTime();
      });
  }, [search, showArchived, sortBy]);

  return (
    <div className="project-list-page">
      <PageHeader onCreate={() => setCreateOpen(true)} />

      <div className="project-toolbar">
        <label className="search-field">
          <Search size={16} aria-hidden="true" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索项目..." />
        </label>

        <button
          className={`secondary-button ${showArchived ? "is-active" : ""}`}
          type="button"
          onClick={() => setShowArchived((value) => !value)}
        >
          <Archive size={16} aria-hidden="true" />
          {showArchived ? "隐藏归档" : "显示归档"}
        </button>

        <select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}>
          <option value="active">排序：最近活跃</option>
          <option value="created">排序：创建时间</option>
          <option value="name">排序：名称</option>
        </select>
      </div>

      <div className="project-grid-wrap">
        {projects.length > 0 ? (
          <div className="project-grid">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">
              <Activity size={24} aria-hidden="true" />
            </div>
            <p>暂无项目</p>
            <button className="primary-button" type="button" onClick={() => setCreateOpen(true)}>
              <Plus size={16} aria-hidden="true" />
              创建第一个项目
            </button>
          </div>
        )}
      </div>

      {createOpen && <CreateProjectModal onClose={() => setCreateOpen(false)} />}
    </div>
  );
}
