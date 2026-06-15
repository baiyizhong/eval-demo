import { useEffect, useState } from "react";
import { Activity, Clock, Database } from "lucide-react";

import { apiGet } from "../../lib/api";

interface SelectedProject {
  id: string;
  name: string;
}

interface TraceItem {
  id: string | null;
  name: string | null;
  timestamp: string | null;
  user_id: string | null;
  session_id: string | null;
  input: unknown;
  output: unknown;
}

export function TraceLogs({ selectedProject }: { selectedProject: SelectedProject | null }) {
  const [traces, setTraces] = useState<TraceItem[]>([]);
  const [loading, setLoading] = useState(Boolean(selectedProject));
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedProject) {
      setTraces([]);
      setLoading(false);
      setLoadError(null);
      return;
    }

    const project = selectedProject;
    let ignore = false;

    async function loadTraces() {
      setLoading(true);
      setLoadError(null);
      const envelope = await apiGet<TraceItem[]>(`/api/projects/${project.id}/traces?limit=50&page=1`);
      if (ignore) return;

      if (envelope.error) {
        setTraces([]);
        setLoadError(envelope.error.message);
      } else {
        setTraces(envelope.data ?? []);
      }
      setLoading(false);
    }

    void loadTraces().catch((error: unknown) => {
      if (ignore) return;
      setTraces([]);
      setLoadError(error instanceof Error ? error.message : "加载 Trace 失败。");
      setLoading(false);
    });

    return () => {
      ignore = true;
    };
  }, [selectedProject]);

  if (!selectedProject) {
    return (
      <div className="trace-page">
        <header className="page-header">
          <div>
            <h1>Trace 日志</h1>
            <p>请先选择一个项目，再查看 Langfuse Trace 日志并创建评测任务。</p>
          </div>
        </header>
        <div className="empty-state">
          <div className="empty-icon">
            <Database size={24} aria-hidden="true" />
          </div>
          <p>请先选择一个项目</p>
        </div>
      </div>
    );
  }

  return (
    <div className="trace-page">
      <header className="page-header">
        <div>
          <h1>Trace 日志</h1>
          <p>{selectedProject.name} 的 Langfuse Trace 数据</p>
        </div>
      </header>

      <div className="trace-toolbar">
        <div className="trace-summary">
          <Activity size={16} aria-hidden="true" />
          <span>{selectedProject.name}</span>
        </div>
        <div className="trace-summary muted">
          <Clock size={16} aria-hidden="true" />
          <span>{loading ? "正在从 Langfuse API 加载 Trace..." : `${traces.length} 条 Trace`}</span>
        </div>
      </div>

      <div className="trace-table-wrap">
        <table className="trace-table">
          <thead>
            <tr>
              <th>Trace ID</th>
              <th>名称</th>
              <th>用户</th>
              <th>会话</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            {traces.map((trace) => (
              <tr key={trace.id ?? `${trace.name}-${trace.timestamp}`}>
                <td>{trace.id ?? "-"}</td>
                <td>{trace.name ?? "-"}</td>
                <td>{trace.user_id ?? "-"}</td>
                <td>{trace.session_id ?? "-"}</td>
                <td>{formatTimestamp(trace.timestamp)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {loading && (
          <div className="table-state">
            <Activity size={20} aria-hidden="true" />
            <span>正在从 Langfuse API 加载 Trace...</span>
          </div>
        )}

        {!loading && loadError && (
          <div className="table-state">
            <Database size={20} aria-hidden="true" />
            <span>Trace 加载失败：{loadError}</span>
          </div>
        )}

        {!loading && !loadError && traces.length === 0 && (
          <div className="table-state">
            <Database size={20} aria-hidden="true" />
            <span>该 Langfuse 项目暂无 Trace 数据</span>
          </div>
        )}
      </div>
    </div>
  );
}

function formatTimestamp(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN");
}
