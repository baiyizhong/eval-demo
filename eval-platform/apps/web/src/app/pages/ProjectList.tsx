import { useCallback, useEffect, useMemo, useState } from "react";
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

import { apiGet, apiPost } from "../../lib/api";

type ProjectStatus = "active" | "archived";

interface ApiProject {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  trace_count: number;
  created_at: string | null;
  last_active_at: string | null;
  organization_name: string | null;
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  traceCount: number;
  createdAt: string | null;
  lastActiveAt: string | null;
  organizationName: string | null;
}

interface ProjectCreatePayload {
  name: string;
  description: string | null;
}

const statusLabels: Record<ProjectStatus, string> = {
  active: "启用",
  archived: "已归档"
};

function mapProject(project: ApiProject): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status,
    traceCount: project.trace_count,
    createdAt: project.created_at,
    lastActiveAt: project.last_active_at,
    organizationName: project.organization_name
  };
}

function timestampValue(value: string | null): number {
  return value ? new Date(value).getTime() : 0;
}

function formatLastActive(value: string | null): string {
  if (!value) return "暂无 Trace";
  return `活跃于 ${new Date(value).toLocaleDateString("zh-CN")}`;
}

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

function ProjectCard({ project, onSelect }: { project: ProjectSummary; onSelect: (project: ProjectSummary) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <article className="project-card" onClick={() => onSelect(project)}>
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
            onClick={(event) => {
              event.stopPropagation();
              setMenuOpen((open) => !open);
            }}
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
      <p>{project.description ?? project.organizationName ?? "Langfuse 项目"}</p>

      <footer className="project-card-footer">
        <span>
          <Activity size={12} aria-hidden="true" />
          {project.traceCount.toLocaleString("zh-CN")} 条 Trace
        </span>
        <span>
          <Clock size={12} aria-hidden="true" />
          {formatLastActive(project.lastActiveAt)}
        </span>
      </footer>
    </article>
  );
}

function CreateProjectModal({
  onClose,
  onCreate
}: {
  onClose: () => void;
  onCreate: (payload: ProjectCreatePayload) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function handleCreate() {
    setSubmitting(true);
    setCreateError(null);
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim() || null
      });
      onClose();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "创建 Langfuse 项目失败。");
    } finally {
      setSubmitting(false);
    }
  }

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
          <textarea
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="该项目的用途是什么？"
          />
        </label>
        {createError && <p className="modal-error">{createError}</p>}
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={!name.trim() || submitting}
            onClick={() => void handleCreate()}
          >
            {submitting ? "创建中..." : "创建项目"}
          </button>
        </div>
      </section>
    </div>
  );
}

export function ProjectList({
  onProjectsChange,
  onSelectProject
}: {
  onProjectsChange?: (projects: ProjectSummary[]) => void;
  onSelectProject?: (project: ProjectSummary) => void;
}) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [sortBy, setSortBy] = useState<"active" | "created" | "name">("active");
  const [createOpen, setCreateOpen] = useState(false);

  const loadProjects = useCallback(async (shouldApply: () => boolean = () => true) => {
    setLoading(true);
    setLoadError(null);
    const envelope = await apiGet<ApiProject[]>("/api/projects");
    if (!shouldApply()) return;

    if (envelope.error) {
      setProjects([]);
      onProjectsChange?.([]);
      setLoadError(envelope.error.message);
    } else {
      const nextProjects = (envelope.data ?? []).map(mapProject);
      setProjects(nextProjects);
      onProjectsChange?.(nextProjects);
    }
    setLoading(false);
  }, [onProjectsChange]);

  useEffect(() => {
    let ignore = false;

    void loadProjects(() => !ignore).catch((error: unknown) => {
      if (ignore) return;
      setProjects([]);
      setLoadError(error instanceof Error ? error.message : "加载 Langfuse 项目失败。");
      setLoading(false);
    });

    return () => {
      ignore = true;
    };
  }, [loadProjects]);

  async function handleCreateProject(payload: ProjectCreatePayload) {
    const envelope = await apiPost<ApiProject>("/api/projects", payload);
    if (envelope.error) {
      throw new Error(envelope.error.message);
    }
    if (!envelope.data) {
      throw new Error("Langfuse 未返回新建项目。");
    }
    const createdProject = mapProject(envelope.data);
    setProjects((current) => {
      const nextProjects = [createdProject, ...current.filter((project) => project.id !== createdProject.id)];
      onProjectsChange?.(nextProjects);
      return nextProjects;
    });
  }

  const visibleProjects = useMemo(() => {
    return projects
      .filter((project) => {
        if (!showArchived && project.status === "archived") return false;
        if (!search.trim()) return true;
        return project.name.toLowerCase().includes(search.trim().toLowerCase());
      })
      .sort((first, second) => {
        if (sortBy === "name") return first.name.localeCompare(second.name, "zh-CN");
        if (sortBy === "created") return timestampValue(second.createdAt) - timestampValue(first.createdAt);
        return timestampValue(second.lastActiveAt) - timestampValue(first.lastActiveAt);
      });
  }, [projects, search, showArchived, sortBy]);

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
        {loading ? (
          <div className="empty-state">
            <div className="empty-icon">
              <Activity size={24} aria-hidden="true" />
            </div>
            <p>正在从 Langfuse API 加载项目...</p>
          </div>
        ) : loadError ? (
          <div className="empty-state">
            <div className="empty-icon">
              <Activity size={24} aria-hidden="true" />
            </div>
            <p>Langfuse 项目加载失败</p>
            <span className="empty-detail">{loadError}</span>
          </div>
        ) : visibleProjects.length > 0 ? (
          <div className="project-grid">
            {visibleProjects.map((project) => (
              <ProjectCard key={project.id} project={project} onSelect={(value) => onSelectProject?.(value)} />
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

      {createOpen && (
        <CreateProjectModal onClose={() => setCreateOpen(false)} onCreate={handleCreateProject} />
      )}
    </div>
  );
}
