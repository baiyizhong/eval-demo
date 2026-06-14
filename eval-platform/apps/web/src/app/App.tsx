import { useState } from "react";

import { EvaluationTasks } from "./pages/EvaluationTasks";
import { Evaluators } from "./pages/Evaluators";
import { ProjectList } from "./pages/ProjectList";
import { TraceLogs } from "./pages/TraceLogs";

type PageKey = "projects" | "traces" | "tasks" | "evaluators";

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
          <button onClick={() => setPage("projects")}>项目</button>
          <button onClick={() => setPage("traces")}>Trace</button>
          <button onClick={() => setPage("tasks")}>评测任务</button>
          <button onClick={() => setPage("evaluators")}>评估器</button>
        </nav>
      </aside>
      <section className="content">{pages[page]}</section>
    </main>
  );
}
