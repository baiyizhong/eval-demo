import { useState } from "react";

import { EvaluationTasks } from "./pages/EvaluationTasks";
import { Evaluators } from "./pages/Evaluators";
import { ProjectList } from "./pages/ProjectList";
import { TraceLogs } from "./pages/TraceLogs";

type PageKey = "projects" | "traces" | "tasks" | "evaluators";

const navItems: Array<{ key: PageKey; label: string }> = [
  { key: "projects", label: "项目" },
  { key: "traces", label: "Trace" },
  { key: "tasks", label: "评测任务" },
  { key: "evaluators", label: "评估器" }
];

const pages: Record<PageKey, JSX.Element> = {
  projects: <ProjectList />,
  traces: <TraceLogs />,
  tasks: <EvaluationTasks />,
  evaluators: <Evaluators />
};

export function App() {
  const [page, setPage] = useState<PageKey>("projects");

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">Eval Platform</div>
        <nav>
          {navItems.map((item) => (
            <button
              key={item.key}
              aria-current={page === item.key ? "page" : undefined}
              onClick={() => setPage(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <section className="content">{pages[page]}</section>
    </main>
  );
}
