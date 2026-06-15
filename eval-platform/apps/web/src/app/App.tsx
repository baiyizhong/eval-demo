import { useState } from "react";
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

type PageKey = "projects" | "traces" | "tasks" | "evaluators" | "tenants" | "users" | "settings";

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

export function App() {
  const [page, setPage] = useState<PageKey>("projects");
  const [selectedProject, setSelectedProject] = useState<ProjectSummary | null>(null);

  const pages: Record<PageKey, JSX.Element> = {
    projects: (
      <ProjectList
        onSelectProject={(project) => {
          setSelectedProject(project);
          setPage("traces");
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
          <button type="button">
            <span className="switcher-label">
              <LayoutGrid size={16} aria-hidden="true" />
              切换项目
            </span>
            <ChevronDown size={16} aria-hidden="true" />
          </button>
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
