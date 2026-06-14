export function App() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">Eval Platform</div>
        <nav>
          <a href="#projects">项目</a>
          <a href="#traces">Trace</a>
          <a href="#tasks">评测任务</a>
          <a href="#evaluators">评估器</a>
        </nav>
      </aside>
      <section className="content">
        <h1>评测平台</h1>
        <p>连接 Docker 启动的 Langfuse，通过 Python worker 执行评测并写回 Scores。</p>
      </section>
    </main>
  );
}
