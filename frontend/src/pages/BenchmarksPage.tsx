import React, { useState, useEffect } from "react";
import {
  BarChart3,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Zap,
  Layers,
  FileSpreadsheet,
  FileCode,
  X,
  Eye,
  Cpu,
  Trash2,
  Sparkles,
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
import { ModelInfo } from "../types";
import {
  benchmarksApi,
  BenchmarkRunItem,
  BenchmarkRunDetails,
  ComparisonSummaryResponse,
} from "../services/benchmarks";
import { BenchmarkAnalysisModal } from "../components/benchmarks/BenchmarkAnalysisModal";

interface BenchmarksPageProps {
  selectedModel: string;
  models: ModelInfo[];
}

export const BenchmarksPage: React.FC<BenchmarksPageProps> = ({
  selectedModel: _activeModelTag,
  models,
}) => {
  const [runs, setRuns] = useState<BenchmarkRunItem[]>([]);
  const [summaryData, setSummaryData] = useState<ComparisonSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isStartingRun, setIsStartingRun] = useState(false);

  // New run modal state
  const [showRunModal, setShowRunModal] = useState(false);
  const [selectedModelTags, setSelectedModelTags] = useState<string[]>([
    "qwen2.5:3b",
    "llama3.2:3b",
    "qwen3:1.7b",
  ]);
  const [selectedSuite, setSelectedSuite] = useState<string>("all");
  const [customRunName, setCustomRunName] = useState<string>("");

  // Benchmark Analysis & Inspector modal state
  const [selectedRunDetails, setSelectedRunDetails] = useState<BenchmarkRunDetails | null>(null);
  const [analysisModalTab, setAnalysisModalTab] = useState<"analysis" | "comparison" | "tasks" | "json">("analysis");
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);

  // Active running tracker
  const [activeRunningRun, setActiveRunningRun] = useState<BenchmarkRunItem | null>(null);

  useEffect(() => {
    loadAllData();
  }, []);

  // Poll active run if running
  useEffect(() => {
    if (!activeRunningRun) return;
    const interval = setInterval(async () => {
      try {
        const updated = await benchmarksApi.getRunDetails(activeRunningRun.id);
        if (updated.status === "completed" || updated.status === "failed") {
          setActiveRunningRun(null);
          loadAllData();
        } else {
          setActiveRunningRun(updated);
        }
      } catch (err) {
        console.error("Polling run failed:", err);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [activeRunningRun]);

  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const [runsList, summary] = await Promise.all([
        benchmarksApi.getRuns(20),
        benchmarksApi.getComparisonSummary(),
      ]);
      setRuns(runsList);
      setSummaryData(summary);

      const currentlyRunning = runsList.find((r) => r.status === "running");
      if (currentlyRunning) {
        setActiveRunningRun(currentlyRunning);
      }
    } catch (err) {
      console.error("Failed to load benchmark data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartRun = async () => {
    if (selectedModelTags.length === 0) {
      alert("Please select at least one model to evaluate.");
      return;
    }

    setIsStartingRun(true);
    try {
      const res = await benchmarksApi.startRun(
        selectedModelTags,
        selectedSuite,
        customRunName.trim() || undefined
      );
      setShowRunModal(false);
      setCustomRunName("");

      // Trigger initial poll
      const details = await benchmarksApi.getRunDetails(res.run_id);
      setActiveRunningRun(details);
      loadAllData();
    } catch (err: any) {
      console.error("Failed to start benchmark run:", err);
      alert(`Error starting run: ${err.message || err}`);
    } finally {
      setIsStartingRun(false);
    }
  };

  const handleOpenAnalysis = async (
    runId: string,
    tab: "analysis" | "comparison" | "tasks" | "json" = "analysis"
  ) => {
    try {
      const details = await benchmarksApi.getRunDetails(runId);
      setSelectedRunDetails(details);
      setAnalysisModalTab(tab);
      setIsAnalysisModalOpen(true);
    } catch (err) {
      console.error("Failed to load run details:", err);
    }
  };

  const handleDeleteRun = async (runId: string) => {
    if (!window.confirm("Delete this benchmark run and its results?")) return;
    try {
      await benchmarksApi.deleteRun(runId);
      loadAllData();
    } catch (err) {
      console.error("Failed to delete run:", err);
    }
  };

  const toggleModelSelection = (tag: string) => {
    if (selectedModelTags.includes(tag)) {
      if (selectedModelTags.length === 1) return; // Prevent deselecting all
      setSelectedModelTags(selectedModelTags.filter((t) => t !== tag));
    } else {
      setSelectedModelTags([...selectedModelTags, tag]);
    }
  };

  // Prepare chart datasets from summary
  const scoreChartData = summaryData?.models
    ? Object.entries(summaryData.models).map(([tag, stats]) => {
        const meta = models.find((m) => m.tag === tag);
        return {
          model: meta ? meta.display_name : tag,
          tag,
          "Overall Score": stats.overall_score,
          "Chatbot Score": stats.chat_score,
          "RAG Groundedness": stats.rag_score,
          "Database Safety": stats.database_score,
        };
      })
    : [];

  const throughputChartData = summaryData?.models
    ? Object.entries(summaryData.models).map(([tag, stats]) => {
        const meta = models.find((m) => m.tag === tag);
        return {
          model: meta ? meta.display_name : tag,
          tag,
          "Tokens / Sec": stats.average_tokens_per_sec,
          "Avg Latency (ms)": stats.average_latency_ms,
        };
      })
    : [];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-surface-border pb-5">
        <div>
          <div className="flex items-center space-x-2 text-accent-cyan text-xs font-mono uppercase tracking-wider">
            <span>Unified Benchmark Engine</span>
            <span>•</span>
            <span>Comparative Evaluation & Telemetry</span>
          </div>
          <h1 className="text-2xl font-bold text-white mt-1 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-accent-cyan" />
            SLM Benchmark & Comparison Dashboard
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Empirical comparison of Small Language Models across Chat, RAG, and Database CRUD under identical hardware conditions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadAllData}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-surface hover:bg-surface-border border border-surface-border text-gray-300 hover:text-white rounded-lg transition-colors"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => setShowRunModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-accent-cyan hover:bg-accent-cyan/90 text-background rounded-lg transition-colors shadow-lg shadow-accent-cyan/10"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>New Benchmark Run</span>
          </button>
        </div>
      </div>

      {/* Hardware Protection Policy Banner */}
      <div className="p-4 bg-surface border border-surface-border rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent-purple/20 text-accent-purple flex items-center justify-center shrink-0 mt-0.5">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              Hardware Policy: Strict Sequential Execution (RTX 4050 6GB VRAM)
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              To prevent GPU memory exhaustion, models are evaluated one at a time. Parameter disclosures:{" "}
              <strong className="text-gray-200">Qwen 2.5 3B</strong> (~3.09B actual),{" "}
              <strong className="text-gray-200">Llama 3.2 3B</strong> (~3.21B actual), and{" "}
              <strong className="text-gray-200">Qwen3 1.7B</strong> (~1.70B actual).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-mono px-2 py-1 rounded bg-background border border-surface-border text-accent-cyan">
            GPU Lock: Active
          </span>
          <span className="text-[11px] font-mono px-2 py-1 rounded bg-background border border-surface-border text-emerald-400">
            Precision: FP16 / Q4_K_M
          </span>
        </div>
      </div>

      {/* Active Run Live Tracker Banner */}
      {activeRunningRun && (
        <div className="p-4 bg-accent-cyan/10 border border-accent-cyan/30 rounded-xl space-y-3 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-accent-cyan font-bold font-mono">
              <span className="w-2.5 h-2.5 rounded-full bg-accent-cyan animate-ping" />
              <span>Benchmark Run in Progress: {activeRunningRun.run_name}</span>
            </div>
            <span className="text-xs font-mono text-gray-300">
              {activeRunningRun.completed_cases} / {activeRunningRun.total_cases} tasks evaluated
            </span>
          </div>

          <div className="w-full bg-background rounded-full h-2.5 overflow-hidden border border-surface-border">
            <div
              className="bg-accent-cyan h-2.5 rounded-full transition-all duration-500"
              style={{
                width: `${
                  activeRunningRun.total_cases > 0
                    ? Math.round((activeRunningRun.completed_cases / activeRunningRun.total_cases) * 100)
                    : 10
                }%`,
              }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-gray-400 font-mono">
            <span>Evaluating models sequentially... please do not close the server.</span>
            <span>
              {activeRunningRun.total_cases > 0
                ? `${Math.round((activeRunningRun.completed_cases / activeRunningRun.total_cases) * 100)}%`
                : "Initializing"}
            </span>
          </div>
        </div>
      )}

      {/* Main Comparative Visualizations */}
      {scoreChartData.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Chart 1: Grouped Bar Chart of Application Accuracy */}
          <div className="lg:col-span-7 bg-surface border border-surface-border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-surface-border pb-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-accent-cyan" />
                <span>Application Accuracy & Capability Scores (%)</span>
              </h3>
              <span className="text-[10px] font-mono text-gray-400">Scale: 0 - 100%</span>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scoreChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                  <XAxis dataKey="model" stroke="#888888" fontSize={11} tickLine={false} />
                  <YAxis stroke="#888888" fontSize={11} domain={[0, 100]} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#18181b",
                      borderColor: "#27272a",
                      borderRadius: "8px",
                      fontSize: "12px",
                      color: "#fff",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
                  <Bar dataKey="Overall Score" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Chatbot Score" fill="#a855f7" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="RAG Groundedness" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Database Safety" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Throughput (Tokens/Sec) and Latency */}
          <div className="lg:col-span-5 bg-surface border border-surface-border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-surface-border pb-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-400" />
                <span>Inference Throughput (Tokens/sec)</span>
              </h3>
              <span className="text-[10px] font-mono text-gray-400">Higher is Faster</span>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={throughputChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                  <XAxis dataKey="model" stroke="#888888" fontSize={11} tickLine={false} />
                  <YAxis stroke="#888888" fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#18181b",
                      borderColor: "#27272a",
                      borderRadius: "8px",
                      fontSize: "12px",
                      color: "#fff",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
                  <Bar dataKey="Tokens / Sec" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-surface border border-surface-border rounded-xl p-12 text-center space-y-4">
          <BarChart3 className="w-10 h-10 text-gray-600 mx-auto" />
          <h2 className="text-base font-bold text-white">No Benchmark Data Available Yet</h2>
          <p className="text-xs text-gray-400 max-w-md mx-auto">
            Run your first sequential benchmark evaluation across the registered models to generate comparative charts, throughput curves, and groundedness ratings.
          </p>
          <button
            onClick={() => setShowRunModal(true)}
            className="px-4 py-2 bg-accent-cyan text-background font-bold text-xs rounded-lg transition-colors hover:bg-accent-cyan/90 inline-flex items-center gap-2"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Launch Initial Benchmark Run</span>
          </button>
        </div>
      )}

      {/* Comparative Scorecard Table */}
      {summaryData?.models && Object.keys(summaryData.models).length > 0 && (
        <div className="bg-surface border border-surface-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-surface-border pb-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-accent-purple" />
              <span>Comparative Performance Scorecard</span>
            </h3>
            <span className="text-[11px] text-gray-400 font-mono">Based on latest completed evaluations</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-surface-border/50 text-gray-300">
                <tr>
                  <th className="p-3">Model</th>
                  <th className="p-3">Parameters</th>
                  <th className="p-3">Overall Score</th>
                  <th className="p-3">Chat Accuracy</th>
                  <th className="p-3">RAG Grounded</th>
                  <th className="p-3">DB Safety</th>
                  <th className="p-3">Tokens / Sec</th>
                  <th className="p-3">Avg Latency</th>
                  <th className="p-3">Evaluated Tasks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border/40 text-gray-300">
                {Object.entries(summaryData.models).map(([tag, stats]) => {
                  const meta = models.find((m) => m.tag === tag);
                  return (
                    <tr key={tag} className="hover:bg-surface-border/20 transition-colors">
                      <td className="p-3">
                        <strong className="text-white block">{meta ? meta.display_name : tag}</strong>
                        <span className="text-[10px] text-gray-500">{tag}</span>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-accent-purple/20 text-accent-purple border border-accent-purple/30 text-[10px]">
                          {meta?.published_parameters || "~3B"}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="text-sm font-bold text-accent-cyan">{stats.overall_score}%</span>
                      </td>
                      <td className="p-3 text-purple-300">{stats.chat_score}%</td>
                      <td className="p-3 text-emerald-300">{stats.rag_score}%</td>
                      <td className="p-3 text-amber-300">{stats.database_score}%</td>
                      <td className="p-3 text-emerald-400 font-bold">{stats.average_tokens_per_sec} tok/s</td>
                      <td className="p-3 text-gray-300">{stats.average_latency_ms} ms</td>
                      <td className="p-3 text-gray-400">{stats.total_evaluated_tasks}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Historical Runs Table */}
      <div className="bg-surface border border-surface-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-surface-border pb-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-accent-cyan" />
            <span>Benchmark Run History</span>
          </h3>
          <span className="text-[11px] text-gray-400 font-mono">Total Runs: {runs.length}</span>
        </div>

        {runs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-surface-border/50 text-gray-300">
                <tr>
                  <th className="p-3">Run Label</th>
                  <th className="p-3">Suite</th>
                  <th className="p-3">Models Evaluated</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Tasks</th>
                  <th className="p-3">Started At</th>
                  <th className="p-3 text-right">Actions & Export</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border/40 text-gray-300">
                {runs.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-border/20 transition-colors">
                    <td className="p-3 text-white font-medium">{r.run_name}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded bg-surface-border text-gray-300 uppercase text-[10px]">
                        {r.suite_name}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {r.model_tags.map((t) => (
                          <span key={t} className="px-1.5 py-0.5 bg-background rounded text-[10px] text-accent-cyan border border-surface-border">
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-3">
                      {r.status === "completed" ? (
                        <span className="text-emerald-400 flex items-center gap-1 text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Completed
                        </span>
                      ) : r.status === "running" ? (
                        <span className="text-accent-cyan flex items-center gap-1 text-[11px] animate-pulse">
                          <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                          Running
                        </span>
                      ) : (
                        <span className="text-rose-400 text-[11px]">{r.status}</span>
                      )}
                    </td>
                    <td className="p-3 text-gray-300">
                      {r.completed_cases} / {r.total_cases}
                    </td>
                    <td className="p-3 text-gray-500 text-[11px]">
                      {new Date(r.started_at).toLocaleString()}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenAnalysis(r.id, "analysis")}
                          className="px-2.5 py-1 bg-gradient-to-r from-accent-purple/20 to-accent-cyan/20 hover:from-accent-purple/30 hover:to-accent-cyan/30 text-white rounded text-[11px] font-semibold flex items-center gap-1 border border-accent-purple/40 transition-all shadow-sm"
                          title="View Deep Analytical Review & Scorecard"
                        >
                          <Sparkles className="w-3 h-3 text-accent-cyan" />
                          <span>Analysis</span>
                        </button>

                        <button
                          onClick={() => handleOpenAnalysis(r.id, "tasks")}
                          className="px-2 py-1 bg-surface hover:bg-surface-border text-gray-300 hover:text-white rounded text-[11px] flex items-center gap-1 border border-surface-border transition-colors"
                          title="Inspect test task details"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Inspect</span>
                        </button>

                        <a
                          href={benchmarksApi.getExportUrl(r.id, "pdf")}
                          download
                          className="px-2 py-1 bg-surface hover:bg-surface-border text-rose-400 hover:text-rose-300 rounded text-[11px] flex items-center gap-1 border border-surface-border transition-colors"
                          title="Export PDF Analysis Report"
                        >
                          <FileText className="w-3 h-3" />
                          <span>PDF</span>
                        </a>

                        <a
                          href={benchmarksApi.getExportUrl(r.id, "csv")}
                          download
                          className="px-2 py-1 bg-surface hover:bg-surface-border text-emerald-400 hover:text-emerald-300 rounded text-[11px] flex items-center gap-1 border border-surface-border transition-colors"
                          title="Export CSV"
                        >
                          <FileSpreadsheet className="w-3 h-3" />
                          <span>CSV</span>
                        </a>

                        <button
                          onClick={() => handleOpenAnalysis(r.id, "json")}
                          className="px-2 py-1 bg-surface hover:bg-surface-border text-accent-cyan hover:text-cyan-300 rounded text-[11px] flex items-center gap-1 border border-surface-border transition-colors"
                          title="Inspect Raw JSON"
                        >
                          <FileCode className="w-3 h-3" />
                          <span>JSON</span>
                        </button>

                        <button
                          onClick={() => handleDeleteRun(r.id)}
                          className="px-2 py-1 bg-surface hover:bg-rose-950/40 text-gray-400 hover:text-rose-400 rounded text-[11px] flex items-center gap-1 border border-surface-border transition-colors"
                          title="Delete benchmark run"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-gray-500 text-center py-6">No historical runs recorded yet.</p>
        )}
      </div>

      {/* MODAL: Launch New Benchmark Run */}
      {showRunModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-surface-border rounded-2xl max-w-lg w-full p-6 space-y-5 animate-fadeIn shadow-2xl">
            <div className="flex items-center justify-between border-b border-surface-border pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Play className="w-4 h-4 text-accent-cyan fill-current" />
                <span>Configure Benchmark Run</span>
              </h3>
              <button onClick={() => setShowRunModal(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Models selection */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-300 block">
                  Select Models to Evaluate:
                </label>
                <div className="space-y-1.5">
                  {models.map((m) => {
                    const isChecked = selectedModelTags.includes(m.tag);
                    return (
                      <div
                        key={m.tag}
                        onClick={() => toggleModelSelection(m.tag)}
                        className={`p-3 rounded-lg border text-xs cursor-pointer flex items-center justify-between transition-colors ${
                          isChecked
                            ? "bg-accent-cyan/15 border-accent-cyan text-white"
                            : "bg-background border-surface-border text-gray-400 hover:bg-surface-border/30"
                        }`}
                      >
                        <div>
                          <strong className="block">{m.display_name}</strong>
                          <span className="text-[11px] font-mono text-gray-400">{m.tag}</span>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface border border-surface-border text-accent-purple">
                          {m.published_parameters}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Suite selector */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-300 block">Select Evaluation Suite:</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "all", label: "All 3 Suites (Full Lab)" },
                    { id: "chat", label: "Chatbot Only (8 tasks)" },
                    { id: "rag", label: "RAG Only (4 tasks)" },
                    { id: "database", label: "Database Only (8 tasks)" },
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedSuite(s.id)}
                      className={`p-2.5 rounded-lg border text-xs text-left transition-colors ${
                        selectedSuite === s.id
                          ? "bg-accent-purple/20 border-accent-purple text-white font-bold"
                          : "bg-background border-surface-border text-gray-400 hover:bg-surface-border/40"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom run name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-300 block">
                  Optional Run Label:
                </label>
                <input
                  type="text"
                  value={customRunName}
                  onChange={(e) => setCustomRunName(e.target.value)}
                  placeholder="e.g. 'RTX 4050 FP16 Comparison'"
                  className="w-full bg-background border border-surface-border rounded-lg p-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-accent-cyan font-mono"
                />
              </div>

              {/* Hardware caution */}
              <div className="p-3 bg-amber-950/40 border border-amber-800/50 rounded-lg text-xs text-amber-200/90 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p>
                  Sequential execution will run each model back-to-back inside the GPU lock to protect 6GB VRAM.
                  Estimated runtime: 1-3 minutes.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-surface-border">
              <button
                onClick={() => setShowRunModal(false)}
                className="px-4 py-2 bg-surface hover:bg-surface-border text-gray-300 text-xs rounded-lg transition-colors border border-surface-border"
              >
                Cancel
              </button>
              <button
                onClick={handleStartRun}
                disabled={isStartingRun || selectedModelTags.length === 0}
                className="px-5 py-2 bg-accent-cyan hover:bg-accent-cyan/90 disabled:opacity-50 text-background font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{isStartingRun ? "Starting..." : "Start Evaluation"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COMPREHENSIVE BENCHMARK ANALYSIS & TASK INSPECTOR MODAL */}
      <BenchmarkAnalysisModal
        run={selectedRunDetails}
        isOpen={isAnalysisModalOpen}
        onClose={() => setIsAnalysisModalOpen(false)}
        initialTab={analysisModalTab}
      />
    </div>
  );
};
export default BenchmarksPage;
