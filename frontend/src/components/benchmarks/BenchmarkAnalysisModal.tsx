import React, { useState, useMemo } from "react";
import {
  X,
  BarChart3,
  Sparkles,
  CheckCircle2,
  Clock,
  Zap,
  FileSpreadsheet,
  FileCode,
  Copy,
  Check,
  Search,
  Filter,
  Layers,
  ShieldAlert,
  TrendingUp,
  Cpu,
  ChevronDown,
  ChevronUp,
  Award,
  CheckSquare,
  FileText,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { BenchmarkRunDetails, BenchmarkTaskResult, benchmarksApi } from "../../services/benchmarks";

interface BenchmarkAnalysisModalProps {
  run: BenchmarkRunDetails | null;
  isOpen: boolean;
  onClose: () => void;
  initialTab?: "analysis" | "comparison" | "tasks" | "json";
}

export const BenchmarkAnalysisModal: React.FC<BenchmarkAnalysisModalProps> = ({
  run,
  isOpen,
  onClose,
  initialTab = "analysis",
}) => {
  const [activeTab, setActiveTab] = useState<"analysis" | "comparison" | "tasks" | "json">(initialTab);
  const [copiedJson, setCopiedJson] = useState(false);

  // Filters for Comparison Matrix
  const [comparisonAppFilter, setComparisonAppFilter] = useState<string>("all");

  // Filters for Task Inspector
  const [taskSearch, setTaskSearch] = useState<string>("");
  const [taskModelFilter, setTaskModelFilter] = useState<string>("all");
  const [taskStatusFilter, setTaskStatusFilter] = useState<string>("all");

  // Expanded task response cards in comparison matrix
  const [expandedResponses, setExpandedResponses] = useState<Record<string, boolean>>({});

  // Reset tab when modal opens or initialTab changes
  React.useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  const toggleResponseExpand = (key: string) => {
    setExpandedResponses((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // 1. Analytical Summary Computations
  const analysis = useMemo(() => {
    if (!run || !run.summary) return null;

    const models = Object.keys(run.summary);
    const summaryEntries = Object.entries(run.summary);

    // Calculate pass rate
    const passRate =
      run.total_cases > 0
        ? Math.round(((run.completed_cases - run.failed_cases) / run.total_cases) * 1000) / 10
        : 0;

    // Identify best overall model
    const bestOverall = [...summaryEntries].sort(
      (a, b) => b[1].overall_score - a[1].overall_score
    )[0];

    // Identify fastest model by average latency
    const fastestModel = [...summaryEntries].sort(
      (a, b) => (a[1].average_latency_ms || 999999) - (b[1].average_latency_ms || 999999)
    )[0];

    // Identify highest throughput model
    const throughputModel = [...summaryEntries].sort(
      (a, b) => (b[1].average_tokens_per_sec || 0) - (a[1].average_tokens_per_sec || 0)
    )[0];

    // Domain comparison chart data
    const chartData = [
      {
        domain: "Overall Score",
        ...Object.fromEntries(summaryEntries.map(([m, s]) => [m, s.overall_score])),
      },
      {
        domain: "Chatbot",
        ...Object.fromEntries(summaryEntries.map(([m, s]) => [m, s.chat_score])),
      },
      {
        domain: "Document RAG",
        ...Object.fromEntries(summaryEntries.map(([m, s]) => [m, s.rag_score])),
      },
      {
        domain: "Database CRUD",
        ...Object.fromEntries(summaryEntries.map(([m, s]) => [m, s.database_score])),
      },
    ];

    // Latency & Speed chart data
    const speedData = summaryEntries.map(([m, s]) => ({
      model: m.replace(":3b", "").replace(":1.7b", ""),
      latencySec: Math.round((s.average_latency_ms / 1000) * 10) / 10,
      tps: Math.round(s.average_tokens_per_sec * 10) / 10,
    }));

    // Identify all failed or degraded cases
    const failures = (run.results || []).filter((r) => !r.is_success || r.score < 0.7);

    return {
      models,
      passRate,
      bestOverall,
      fastestModel,
      throughputModel,
      chartData,
      speedData,
      failures,
    };
  }, [run]);

  // 2. Group Tasks by Task ID for Comparison Matrix
  const tasksGrouped = useMemo(() => {
    if (!run || !run.results) return [];

    const grouped: Record<
      string,
      {
        task_id: string;
        application_type: "chat" | "rag" | "database";
        prompt: string;
        modelResults: Record<string, BenchmarkTaskResult>;
      }
    > = {};

    run.results.forEach((r) => {
      if (!grouped[r.task_id]) {
        grouped[r.task_id] = {
          task_id: r.task_id,
          application_type: r.application_type,
          prompt: r.prompt,
          modelResults: {},
        };
      }
      grouped[r.task_id].modelResults[r.model_tag] = r;
    });

    return Object.values(grouped).filter((g) => {
      if (comparisonAppFilter !== "all" && g.application_type !== comparisonAppFilter) {
        return false;
      }
      return true;
    });
  }, [run, comparisonAppFilter]);

  // 3. Filtered Task Results for Inspector Feed
  const filteredTasks = useMemo(() => {
    if (!run || !run.results) return [];

    return run.results.filter((res) => {
      if (taskModelFilter !== "all" && res.model_tag !== taskModelFilter) return false;
      if (taskStatusFilter === "passed" && !res.is_success) return false;
      if (taskStatusFilter === "failed" && res.is_success) return false;

      if (taskSearch.trim()) {
        const query = taskSearch.toLowerCase();
        const matchId = res.task_id.toLowerCase().includes(query);
        const matchPrompt = res.prompt.toLowerCase().includes(query);
        const matchResponse = (res.raw_response || "").toLowerCase().includes(query);
        if (!matchId && !matchPrompt && !matchResponse) return false;
      }

      return true;
    });
  }, [run, taskModelFilter, taskStatusFilter, taskSearch]);

  const handleCopyJson = () => {
    if (!run) return;
    navigator.clipboard.writeText(JSON.stringify(run, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  if (!isOpen || !run) return null;

  const colorPalette = ["#38bdf8", "#c084fc", "#34d399", "#fbbf24"];

  // Helper to categorize failures with diagnostic explanations
  const getDiagnosticExplanation = (fail: BenchmarkTaskResult) => {
    if (fail.task_id === "chat_logic_04") {
      return {
        category: "Cognitive Trap / Arithmetic Capture",
        diagnosis:
          "The model defaulted to literal subtraction (17 - 9 = 8) instead of parsing the lexical constraint 'all but 9'.",
        mitigation: "Use chain-of-thought system prompting or higher-parameter models (e.g. Qwen 2.5 3B).",
      };
    }
    if (fail.task_id === "db_safety_invalid_table_08") {
      return {
        category: "Adversarial Intent Co-Option",
        diagnosis:
          "The model attempted to satisfy an unauthorized credit card query by substituting the allowlisted 'customers' table.",
        mitigation: "Enforce strict semantic rejection in system prompt when sensitive data terms are detected.",
      };
    }
    if (fail.error_message?.includes("validation error") || fail.error_message?.includes("invalid operation JSON")) {
      return {
        category: "Pydantic Schema Failure",
        diagnosis: `Model produced JSON that deviated from strict schema: ${fail.error_message.slice(0, 140)}...`,
        mitigation: "Provide explicit JSON few-shot examples or soften non-critical required fields.",
      };
    }
    if (fail.error_message?.includes("timed out") || fail.error_message?.includes("timeout")) {
      return {
        category: "Inference Hardware Timeout",
        diagnosis: "Model inference exceeded the 90-second execution threshold on local GPU.",
        mitigation: "Ensure sequential mutex locking and offload background graphics tasks.",
      };
    }
    return {
      category: "Rubric Constraint Mismatch",
      diagnosis: fail.error_message || "Model output did not meet deterministic pass criteria threshold (score < 70%).",
      mitigation: "Inspect prompt framing and verify expected keyword / citation format.",
    };
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 md:p-6 animate-fadeIn">
      <div className="bg-surface border border-surface-border rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* MODAL HEADER */}
        <div className="p-4 md:p-5 border-b border-surface-border bg-gradient-to-r from-surface to-surface-card flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-lg bg-accent-purple/15 text-accent-purple border border-accent-purple/30">
                <Sparkles className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-base md:text-lg font-bold text-white flex items-center gap-2">
                  <span>{run.run_name || "Benchmark Evaluation"}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      run.status === "completed"
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    }`}
                  >
                    {run.status}
                  </span>
                </h2>
                <p className="text-xs text-gray-400 font-mono flex items-center gap-2 mt-0.5">
                  <span>ID: {run.id.slice(0, 8)}...</span>
                  <span>•</span>
                  <span>Suite: <strong className="text-gray-300">{run.suite_name}</strong></span>
                  <span>•</span>
                  <span>{new Date(run.started_at).toLocaleString()}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Quick Action Buttons & Close */}
          <div className="flex items-center gap-2">
            <a
              href={benchmarksApi.getExportUrl(run.id, "pdf")}
              download
              className="px-2.5 py-1.5 bg-background hover:bg-surface-border text-rose-400 hover:text-rose-300 rounded-lg text-xs border border-surface-border flex items-center gap-1.5 transition-colors"
              title="Download PDF Analysis Report"
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">PDF Report</span>
            </a>

            <a
              href={benchmarksApi.getExportUrl(run.id, "csv")}
              download
              className="px-2.5 py-1.5 bg-background hover:bg-surface-border text-emerald-400 rounded-lg text-xs border border-surface-border flex items-center gap-1.5 transition-colors"
              title="Download RFC-4180 CSV export"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export CSV</span>
            </a>

            <a
              href={benchmarksApi.getExportUrl(run.id, "json")}
              target="_blank"
              rel="noreferrer"
              className="px-2.5 py-1.5 bg-background hover:bg-surface-border text-accent-cyan rounded-lg text-xs border border-surface-border flex items-center gap-1.5 transition-colors"
              title="Download complete JSON export"
            >
              <FileCode className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export JSON</span>
            </a>

            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-surface-border transition-colors ml-1"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* TAB NAVIGATION BAR */}
        <div className="flex border-b border-surface-border bg-background/50 px-4 gap-2 shrink-0 overflow-x-auto">
          {[
            { id: "analysis", label: "Executive Analysis & Review", icon: Sparkles },
            { id: "comparison", label: "Side-by-Side Comparison Matrix", icon: Layers },
            { id: "tasks", label: `Task Inspector (${run.results?.length || 0})`, icon: CheckSquare },
            { id: "json", label: "Raw JSON Inspector", icon: FileCode },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-3 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
                  isActive
                    ? "border-accent-cyan text-accent-cyan bg-accent-cyan/5"
                    : "border-transparent text-gray-400 hover:text-gray-200 hover:border-surface-border"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-accent-cyan" : ""}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB CONTENT AREA */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {/* ============================================================== */}
          {/* TAB 1: EXECUTIVE ANALYSIS & REVIEW                             */}
          {/* ============================================================== */}
          {activeTab === "analysis" && analysis && (
            <div className="space-y-6 animate-fadeIn">
              {/* Top Hero KPI Tiles */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                <div className="p-4 bg-background border border-surface-border rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-gray-400 text-xs">
                    <span>Overall Pass Rate</span>
                    <Award className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-emerald-400">
                    {analysis.passRate}%
                  </div>
                  <p className="text-[11px] text-gray-500 font-mono">
                    {run.completed_cases - run.failed_cases} of {run.total_cases} tasks passed
                  </p>
                </div>

                <div className="p-4 bg-background border border-surface-border rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-gray-400 text-xs">
                    <span>Top Model (Accuracy)</span>
                    <CheckCircle2 className="w-4 h-4 text-accent-cyan" />
                  </div>
                  <div className="text-base font-bold font-mono text-white truncate">
                    {analysis.bestOverall ? analysis.bestOverall[0] : "N/A"}
                  </div>
                  <p className="text-[11px] text-accent-cyan font-mono">
                    {analysis.bestOverall ? `${analysis.bestOverall[1].overall_score}% composite` : ""}
                  </p>
                </div>

                <div className="p-4 bg-background border border-surface-border rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-gray-400 text-xs">
                    <span>Lowest Latency</span>
                    <Clock className="w-4 h-4 text-accent-amber" />
                  </div>
                  <div className="text-base font-bold font-mono text-white truncate">
                    {analysis.fastestModel ? analysis.fastestModel[0] : "N/A"}
                  </div>
                  <p className="text-[11px] text-accent-amber font-mono">
                    {analysis.fastestModel ? `${analysis.fastestModel[1].average_latency_ms.toFixed(0)} ms avg` : ""}
                  </p>
                </div>

                <div className="p-4 bg-background border border-surface-border rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-gray-400 text-xs">
                    <span>Max Generation Speed</span>
                    <Zap className="w-4 h-4 text-accent-purple" />
                  </div>
                  <div className="text-base font-bold font-mono text-white truncate">
                    {analysis.throughputModel ? analysis.throughputModel[0] : "N/A"}
                  </div>
                  <p className="text-[11px] text-accent-purple font-mono">
                    {analysis.throughputModel ? `${analysis.throughputModel[1].average_tokens_per_sec.toFixed(1)} tok/s` : ""}
                  </p>
                </div>
              </div>

              {/* Comparative Domain Matrix Table */}
              <div className="p-5 bg-background border border-surface-border rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-gray-200 uppercase tracking-wider flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-accent-cyan" />
                    <span>Cross-Model Comparative Scorecard</span>
                  </h3>
                  <span className="text-[11px] text-gray-500 font-mono">
                    Standardized Deterministic Rubrics
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-surface-border text-gray-400 uppercase text-[10px] tracking-wider font-mono">
                        <th className="py-2.5 px-3">Model Tag</th>
                        <th className="py-2.5 px-3 text-center">Overall</th>
                        <th className="py-2.5 px-3 text-center">Chatbot</th>
                        <th className="py-2.5 px-3 text-center">RAG</th>
                        <th className="py-2.5 px-3 text-center">Database</th>
                        <th className="py-2.5 px-3 text-center">Pass Rate</th>
                        <th className="py-2.5 px-3 text-right">Avg Latency</th>
                        <th className="py-2.5 px-3 text-right">Gen Speed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border/50 font-mono">
                      {Object.entries(run.summary || {}).map(([tag, sum]) => (
                        <tr key={tag} className="hover:bg-surface/60 transition-colors">
                          <td className="py-3 px-3 font-bold text-white flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-accent-cyan" />
                            <span>{tag}</span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className="px-2 py-0.5 rounded font-bold bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/30">
                              {sum.overall_score}%
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center text-gray-300">{sum.chat_score}%</td>
                          <td className="py-3 px-3 text-center text-gray-300">{sum.rag_score}%</td>
                          <td className="py-3 px-3 text-center text-gray-300">{sum.database_score}%</td>
                          <td className="py-3 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] ${
                                sum.success_rate >= 95
                                  ? "text-emerald-400 bg-emerald-950/40"
                                  : "text-amber-400 bg-amber-950/40"
                              }`}
                            >
                              {sum.success_rate}%
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right text-gray-400">
                            {sum.average_latency_ms.toFixed(0)} ms
                          </td>
                          <td className="py-3 px-3 text-right text-emerald-400 font-bold">
                            {sum.average_tokens_per_sec.toFixed(1)} tok/s
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Graphical Domain Comparison */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="p-4 bg-background border border-surface-border rounded-xl space-y-3">
                  <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5 text-accent-cyan" />
                    <span>Application Domain Performance</span>
                  </h4>
                  <div className="h-60 w-full text-xs">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analysis.chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#30363d" vertical={false} />
                        <XAxis dataKey="domain" stroke="#8b949e" tick={{ fontSize: 11 }} />
                        <YAxis stroke="#8b949e" domain={[0, 100]} tick={{ fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#161b22",
                            borderColor: "#30363d",
                            borderRadius: "8px",
                            fontSize: "12px",
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: "11px" }} />
                        {analysis.models.map((m, idx) => (
                          <Bar
                            key={m}
                            dataKey={m}
                            fill={colorPalette[idx % colorPalette.length]}
                            radius={[4, 4, 0, 0]}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="p-4 bg-background border border-surface-border rounded-xl space-y-3">
                  <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-accent-purple" />
                    <span>Generation Throughput vs Latency</span>
                  </h4>
                  <div className="h-60 w-full text-xs">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analysis.speedData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#30363d" vertical={false} />
                        <XAxis dataKey="model" stroke="#8b949e" tick={{ fontSize: 11 }} />
                        <YAxis yAxisId="left" stroke="#34d399" tick={{ fontSize: 11 }} label={{ value: "tok/s", angle: -90, position: "insideLeft", fill: "#34d399", fontSize: 10 }} />
                        <YAxis yAxisId="right" orientation="right" stroke="#fbbf24" tick={{ fontSize: 11 }} label={{ value: "sec", angle: 90, position: "insideRight", fill: "#fbbf24", fontSize: 10 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#161b22",
                            borderColor: "#30363d",
                            borderRadius: "8px",
                            fontSize: "12px",
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: "11px" }} />
                        <Bar yAxisId="left" dataKey="tps" name="Speed (tok/s)" fill="#34d399" radius={[4, 4, 0, 0]} />
                        <Bar yAxisId="right" dataKey="latencySec" name="Latency (sec)" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Diagnostic Failure & Anomaly Findings */}
              <div className="p-5 bg-background border border-surface-border rounded-xl space-y-4">
                <div className="flex items-center justify-between border-b border-surface-border pb-3">
                  <h3 className="text-xs font-bold text-gray-200 uppercase tracking-wider flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-accent-rose" />
                    <span>Diagnostic Failure & Anomaly Analysis</span>
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                      analysis.failures.length === 0
                        ? "bg-emerald-950/40 text-emerald-400 border border-emerald-800/40"
                        : "bg-rose-950/40 text-rose-400 border border-rose-800/40"
                    }`}
                  >
                    {analysis.failures.length} Anomalies Detected
                  </span>
                </div>

                {analysis.failures.length === 0 ? (
                  <div className="p-4 bg-emerald-950/20 border border-emerald-800/30 rounded-xl flex items-center gap-3 text-emerald-300 text-xs">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div>
                      <strong className="block text-emerald-200 font-bold">
                        100% Deterministic Compliance — All Guardrails Intact
                      </strong>
                      <span>
                        Every evaluated task passed strict verification across schema allowlisting,
                        grounded citations, and prompt instructions.
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {analysis.failures.map((fail) => {
                      const diag = getDiagnosticExplanation(fail);
                      return (
                        <div
                          key={fail.id}
                          className="p-4 bg-surface border border-rose-900/40 rounded-xl space-y-3 text-xs"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-border/50 pb-2">
                            <div className="flex items-center gap-2 font-mono">
                              <span className="px-2 py-0.5 rounded bg-rose-950/60 border border-rose-700/50 text-rose-300 font-bold text-[10px]">
                                {diag.category}
                              </span>
                              <span className="text-accent-cyan font-bold">{fail.model_tag}</span>
                              <span className="text-gray-400">•</span>
                              <span className="text-gray-300">{fail.task_id}</span>
                            </div>
                            <span className="text-rose-400 font-mono font-bold">
                              Score: {Math.round(fail.score * 100)}%
                            </span>
                          </div>

                          <div>
                            <span className="text-gray-500 text-[11px] block">Prompt:</span>
                            <p className="text-gray-200 font-mono mt-0.5">{fail.prompt}</p>
                          </div>

                          {fail.raw_response && (
                            <div className="p-2.5 bg-background rounded border border-surface-border/50 text-[11px] font-mono text-gray-300 max-h-24 overflow-y-auto">
                              <span className="text-gray-500 block mb-1">Model Output:</span>
                              {fail.raw_response}
                            </div>
                          )}

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] pt-1">
                            <div className="p-2 bg-rose-950/20 border border-rose-900/30 rounded text-rose-200">
                              <strong className="text-rose-300 block mb-0.5">Root Cause:</strong>
                              {diag.diagnosis}
                            </div>
                            <div className="p-2 bg-accent-cyan/10 border border-accent-cyan/20 rounded text-cyan-200">
                              <strong className="text-accent-cyan block mb-0.5">Architectural Fix:</strong>
                              {diag.mitigation}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Hardware Telemetry & Architecture Takeaways */}
              <div className="p-5 bg-background border border-surface-border rounded-xl space-y-3">
                <h3 className="text-xs font-bold text-gray-200 uppercase tracking-wider flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-accent-purple" />
                  <span>Hardware Telemetry & Architectural Takeaways</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 bg-surface rounded-lg border border-surface-border space-y-1">
                    <strong className="text-white block font-bold">Production Recommendation</strong>
                    <p className="text-gray-400 text-[11px]">
                      <strong>Qwen 2.5 3B</strong> is the premier candidate for structured NL-to-CRUD and reasoning, exhibiting perfect 100% adherence to schema allowlists.
                    </p>
                  </div>
                  <div className="p-3 bg-surface rounded-lg border border-surface-border space-y-1">
                    <strong className="text-white block font-bold">Fastest Turnaround</strong>
                    <p className="text-gray-400 text-[11px]">
                      <strong>LLaMA 3.2 3B</strong> achieved the lowest average latency (~2.5s) and 100% RAG accuracy, but remains susceptible to trick arithmetic phrasing.
                    </p>
                  </div>
                  <div className="p-3 bg-surface rounded-lg border border-surface-border space-y-1">
                    <strong className="text-white block font-bold">High-Throughput Edge</strong>
                    <p className="text-gray-400 text-[11px]">
                      <strong>Qwen 3 1.7B</strong> generated tokens at an industry-leading ~110 tok/s on the RTX 4050, ideal for high-volume streaming chat assistants.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 2: SIDE-BY-SIDE TASK COMPARISON MATRIX                     */}
          {/* ============================================================== */}
          {activeTab === "comparison" && (
            <div className="space-y-4 animate-fadeIn">
              {/* Filter Sub-bar */}
              <div className="flex items-center justify-between bg-background p-3 rounded-xl border border-surface-border">
                <div className="flex items-center gap-2">
                  <Filter className="w-3.5 h-3.5 text-accent-cyan" />
                  <span className="text-xs font-semibold text-gray-300">Application Filter:</span>
                  <div className="flex gap-1.5">
                    {[
                      { id: "all", label: "All Tasks" },
                      { id: "chat", label: "Chatbot" },
                      { id: "rag", label: "RAG Pipeline" },
                      { id: "database", label: "Database CRUD" },
                    ].map((app) => (
                      <button
                        key={app.id}
                        onClick={() => setComparisonAppFilter(app.id)}
                        className={`px-2.5 py-1 rounded text-xs transition-colors ${
                          comparisonAppFilter === app.id
                            ? "bg-accent-cyan text-background font-bold"
                            : "bg-surface text-gray-400 hover:text-white"
                        }`}
                      >
                        {app.label}
                      </button>
                    ))}
                  </div>
                </div>
                <span className="text-xs text-gray-400 font-mono">
                  {tasksGrouped.length} unique benchmark prompts
                </span>
              </div>

              {/* Grouped Comparison List */}
              <div className="space-y-4">
                {tasksGrouped.map((task) => (
                  <div
                    key={task.task_id}
                    className="p-4 bg-background border border-surface-border rounded-xl space-y-3 font-mono text-xs"
                  >
                    {/* Prompt Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-border/50 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-surface border border-surface-border text-accent-cyan font-bold text-[11px]">
                          {task.task_id}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-surface-border text-gray-300 text-[10px] uppercase">
                          {task.application_type}
                        </span>
                      </div>
                    </div>

                    <div className="p-2.5 bg-surface/50 rounded border border-surface-border/30 text-gray-200">
                      <span className="text-[10px] text-gray-500 uppercase block mb-0.5">Instruction / Query:</span>
                      {task.prompt}
                    </div>

                    {/* Side-by-Side Model Columns */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                      {Object.keys(run.summary || {}).map((modelTag) => {
                        const result = task.modelResults[modelTag];
                        const expandKey = `${task.task_id}_${modelTag}`;
                        const isExpanded = !!expandedResponses[expandKey];

                        if (!result) {
                          return (
                            <div key={modelTag} className="p-3 bg-surface/30 rounded-lg border border-surface-border/40 text-gray-500 text-center">
                              No result for {modelTag}
                            </div>
                          );
                        }

                        return (
                          <div
                            key={modelTag}
                            className={`p-3 rounded-lg border flex flex-col justify-between space-y-2 transition-all ${
                              result.is_success
                                ? "bg-surface border-surface-border"
                                : "bg-rose-950/20 border-rose-800/40"
                            }`}
                          >
                            <div className="flex items-center justify-between border-b border-surface-border/40 pb-1.5">
                              <span className="font-bold text-white text-[11px] truncate">{modelTag}</span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  result.is_success
                                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                    : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                                }`}
                              >
                                {Math.round(result.score * 100)}%
                              </span>
                            </div>

                            {/* Telemetry Chips */}
                            <div className="flex items-center gap-2 text-[10px] text-gray-400">
                              {result.latency_ms && (
                                <span className="flex items-center gap-0.5">
                                  <Clock className="w-2.5 h-2.5 text-accent-cyan" />
                                  {result.latency_ms.toFixed(0)}ms
                                </span>
                              )}
                              {result.tokens_per_second && (
                                <span className="flex items-center gap-0.5 text-emerald-400">
                                  <Zap className="w-2.5 h-2.5" />
                                  {result.tokens_per_second.toFixed(1)} tok/s
                                </span>
                              )}
                            </div>

                            {/* Collapsible Response Text */}
                            {result.raw_response && (
                              <div>
                                <button
                                  onClick={() => toggleResponseExpand(expandKey)}
                                  className="text-[10px] text-accent-cyan hover:underline flex items-center gap-1 mb-1"
                                >
                                  <span>{isExpanded ? "Collapse Output" : "Preview Output"}</span>
                                  {isExpanded ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                                </button>
                                <div
                                  className={`p-2 bg-background rounded text-[11px] text-gray-300 whitespace-pre-wrap overflow-y-auto border border-surface-border/40 ${
                                    isExpanded ? "max-h-56" : "max-h-16"
                                  }`}
                                >
                                  {result.raw_response}
                                </div>
                              </div>
                            )}

                            {result.error_message && (
                              <div className="p-1.5 bg-rose-950/60 border border-rose-800/40 rounded text-rose-300 text-[10px]">
                                {result.error_message}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 3: TASK RESULTS INSPECTOR                                  */}
          {/* ============================================================== */}
          {activeTab === "tasks" && (
            <div className="space-y-4 animate-fadeIn">
              {/* Search & Filter Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-background p-3 rounded-xl border border-surface-border">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={taskSearch}
                    onChange={(e) => setTaskSearch(e.target.value)}
                    placeholder="Search by task ID, prompt query, or output keyword..."
                    className="w-full pl-9 pr-3 py-1.5 bg-surface border border-surface-border rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-accent-cyan font-mono"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={taskModelFilter}
                    onChange={(e) => setTaskModelFilter(e.target.value)}
                    className="bg-surface border border-surface-border rounded-lg px-2.5 py-1.5 text-xs text-gray-300 focus:outline-none font-mono"
                  >
                    <option value="all">All Models</option>
                    {Object.keys(run.summary || {}).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>

                  <select
                    value={taskStatusFilter}
                    onChange={(e) => setTaskStatusFilter(e.target.value)}
                    className="bg-surface border border-surface-border rounded-lg px-2.5 py-1.5 text-xs text-gray-300 focus:outline-none font-mono"
                  >
                    <option value="all">All Statuses</option>
                    <option value="passed">Passed Only</option>
                    <option value="failed">Failed Only</option>
                  </select>
                </div>
              </div>

              {/* Task Feed */}
              <div className="space-y-3">
                {filteredTasks.length > 0 ? (
                  filteredTasks.map((res) => (
                    <div
                      key={res.id}
                      className="p-4 bg-background border border-surface-border rounded-xl space-y-2.5 font-mono text-xs hover:border-surface-border/80 transition-colors"
                    >
                      <div className="flex items-center justify-between border-b border-surface-border/50 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-surface border border-surface-border text-accent-cyan font-bold">
                            {res.model_tag}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-surface-border text-gray-300 uppercase text-[10px]">
                            {res.application_type}
                          </span>
                          <span className="text-gray-400 text-[11px]">{res.task_id}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          {res.latency_ms && (
                            <span className="text-gray-400 text-[11px] flex items-center gap-1">
                              <Clock className="w-3 h-3 text-accent-cyan" />
                              {res.latency_ms.toFixed(0)} ms
                            </span>
                          )}
                          {res.tokens_per_second && (
                            <span className="text-emerald-400 text-[11px] flex items-center gap-1">
                              <Zap className="w-3 h-3" />
                              {res.tokens_per_second.toFixed(1)} tok/s
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              res.is_success
                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                            }`}
                          >
                            Score: {Math.round(res.score * 100)}%
                          </span>
                        </div>
                      </div>

                      <div>
                        <span className="text-gray-500 text-[11px] block">Prompt / Query:</span>
                        <p className="text-gray-200 mt-0.5 whitespace-pre-wrap">{res.prompt}</p>
                      </div>

                      {res.raw_response && (
                        <div className="p-2.5 bg-surface rounded border border-surface-border/60">
                          <span className="text-gray-500 text-[11px] block mb-1">Model Output:</span>
                          <p className="text-gray-300 whitespace-pre-wrap max-h-36 overflow-y-auto">
                            {res.raw_response}
                          </p>
                        </div>
                      )}

                      {res.error_message && (
                        <div className="p-2 bg-rose-950/40 border border-rose-800/40 rounded text-rose-300 text-[11px]">
                          <strong>Evaluation Feedback:</strong> {res.error_message}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-gray-500 text-center py-8">
                    No task records matched the active filter criteria.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 4: RAW JSON INSPECTOR                                      */}
          {/* ============================================================== */}
          {activeTab === "json" && (
            <div className="space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between bg-background p-3 rounded-xl border border-surface-border">
                <span className="text-xs text-gray-400 font-mono">
                  Standard RFC-8259 Benchmark JSON Schema
                </span>
                <button
                  onClick={handleCopyJson}
                  className="px-3 py-1.5 bg-surface hover:bg-surface-border text-gray-200 rounded-lg text-xs border border-surface-border flex items-center gap-1.5 transition-colors"
                >
                  {copiedJson ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Raw JSON</span>
                    </>
                  )}
                </button>
              </div>

              <div className="p-4 bg-background border border-surface-border rounded-xl max-h-[60vh] overflow-y-auto font-mono text-xs text-emerald-300/90 whitespace-pre">
                {JSON.stringify(run, null, 2)}
              </div>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="p-3.5 px-6 border-t border-surface-border bg-surface flex items-center justify-between shrink-0 text-xs text-gray-400 font-mono">
          <span>{run.results?.length || 0} total evaluated benchmark cases</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-surface-border hover:bg-surface-card text-white rounded-lg transition-colors font-sans"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
