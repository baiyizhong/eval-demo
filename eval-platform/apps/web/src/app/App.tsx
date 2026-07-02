import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Building2,
  ChevronDown,
  ClipboardList,
  Cpu,
  LayoutGrid,
  Settings,
  Users
} from "lucide-react";

import { EvaluationTasks } from "./pages/EvaluationTasks";
import { Evaluators } from "./pages/Evaluators";
import { ProjectList, type ProjectSummary } from "./pages/ProjectList";
import { TraceLogs } from "./pages/TraceLogs";
import { apiGet } from "../lib/api";

type PageKey = "projects" | "traces" | "tasks" | "evaluators" | "tenants" | "users" | "settings";

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

interface AppProps {
  initialProjects?: ProjectSummary[];
  initialSwitcherOpen?: boolean;
}

const navSections: Array<{
  title: string;
  items: Array<{ key: PageKey; label: string; icon: typeof LayoutGrid }>;
}> = [
  {
    title: "项目",
    items: [{ key: "projects", label: "项目列表", icon: LayoutGrid }]
  },
  {
    title: "可观测性",
    items: [{ key: "traces", label: "Trace 日志", icon: Activity }]
  },
  {
    title: "评测",
    items: [
      { key: "tasks", label: "评测任务", icon: ClipboardList },
      { key: "evaluators", label: "评估器管理", icon: Cpu }
    ]
  },
  {
    title: "系统管理",
    items: [
      { key: "tenants", label: "租户管理", icon: Building2 },
      { key: "users", label: "用户管理", icon: Users },
      { key: "settings", label: "系统设置", icon: Settings }
    ]
  }
];

function mapApiProject(project: ApiProject): ProjectSummary {
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

export function App({ initialProjects = [], initialSwitcherOpen = false }: AppProps) {
  const [page, setPage] = useState<PageKey>("projects");
  const [selectedProject, setSelectedProject] = useState<ProjectSummary | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(initialSwitcherOpen);
  const [switcherProjects, setSwitcherProjects] = useState<ProjectSummary[]>(initialProjects);
  const [switcherLoading, setSwitcherLoading] = useState(initialProjects.length === 0);
  const [switcherError, setSwitcherError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadSwitcherProjects() {
      setSwitcherLoading(true);
      setSwitcherError(null);
      const envelope = await apiGet<ApiProject[]>("/api/projects");
      if (ignore) return;

      if (envelope.error) {
        setSwitcherProjects([]);
        setSwitcherError(envelope.error.message);
      } else {
        setSwitcherProjects((envelope.data ?? []).map(mapApiProject));
      }
      setSwitcherLoading(false);
    }

    void loadSwitcherProjects().catch((error: unknown) => {
      if (ignore) return;
      setSwitcherProjects([]);
      setSwitcherError(error instanceof Error ? error.message : "加载 Langfuse 项目失败。");
      setSwitcherLoading(false);
    });

    return () => {
      ignore = true;
    };
  }, []);

  const switcherLabel = selectedProject?.name ?? "切换项目";
  const visibleSwitcherProjects = useMemo(
    () => switcherProjects.filter((project) => project.status === "active"),
    [switcherProjects]
  );

  function selectProject(project: ProjectSummary) {
    setSelectedProject(project);
    setPage("traces");
    setSwitcherOpen(false);
  }

  const pages: Record<PageKey, JSX.Element> = {
    projects: (
      <ProjectList
        onProjectsChange={setSwitcherProjects}
        onSelectProject={(project) => {
          selectProject(project);
        }}
      />
    ),
    traces: <TraceLogs selectedProject={selectedProject} />,
    tasks: <EvaluationTasks />,
    evaluators: <Evaluators />,
    tenants: (
      <section className="placeholder-page">
        <h1>租户管理</h1>
        <p>管理接入评测平台的企业租户、套餐与使用额度。</p>
      </section>
    ),
    users: (
      <section className="placeholder-page">
        <h1>用户管理</h1>
        <p>维护成员、角色与访问权限。</p>
      </section>
    ),
    settings: (
      <section className="placeholder-page">
        <h1>系统设置</h1>
        <p>配置平台级评测策略、Langfuse 连接与安全选项。</p>
      </section>
    )
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Activity size={16} aria-hidden="true" />
          </div>
          <div>
            <div className="brand-title">ObserveIQ</div>
            <div className="brand-subtitle">LLM 可观测性平台</div>
          </div>
        </div>

        <div className="project-switcher">
          <button
            type="button"
            aria-expanded={switcherOpen}
            aria-haspopup="listbox"
            onClick={() => setSwitcherOpen((open) => !open)}
          >
            <span className="switcher-label">
              <LayoutGrid size={16} aria-hidden="true" />
              <span className="switcher-label-text">{switcherLabel}</span>
            </span>
            <ChevronDown size={16} aria-hidden="true" />
          </button>
          {switcherOpen && (
            <div className="project-switcher-menu" role="listbox" aria-label="切换项目">
              {switcherLoading ? (
                <div className="project-switcher-state">正在加载项目...</div>
              ) : switcherError ? (
                <div className="project-switcher-state">{switcherError}</div>
              ) : visibleSwitcherProjects.length > 0 ? (
                visibleSwitcherProjects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    role="option"
                    aria-selected={selectedProject?.id === project.id}
                    onClick={() => selectProject(project)}
                  >
                    <span className="project-switcher-name">{project.name}</span>
                    <span className="project-switcher-meta">
                      {project.traceCount.toLocaleString("zh-CN")} 条 Trace
                    </span>
                  </button>
                ))
              ) : (
                <div className="project-switcher-state">暂无可切换项目</div>
              )}
            </div>
          )}
        </div>

        <nav className="sidebar-nav" aria-label="主导航">
          {navSections.map((section) => (
            <div className="nav-section" key={section.title}>
              <div className="nav-section-title">{section.title}</div>
              {section.items.map((item) => {
                const Icon = item.icon;

                return (
                  <button
                    key={item.key}
                    type="button"
                    aria-current={page === item.key ? "page" : undefined}
                    onClick={() => setPage(item.key)}
                  >
                    <Icon size={16} aria-hidden="true" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-user">
          <div className="user-avatar">陈</div>
          <div className="user-meta">
            <div className="user-name">陈小丽</div>
            <div className="user-role">所有者</div>
          </div>
        </div>
      </aside>
      <section className="content">{pages[page]}</section>
    </main>
  );
}
