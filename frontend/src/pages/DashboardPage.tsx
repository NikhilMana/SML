import React from "react";
import { Link } from "react-router-dom";
import { HealthResponse, ModelInfo } from "../types";
import {
  Cpu,
  HardDrive,
  MessageSquare,
  FileText,
  Database,
  HelpCircle,
  ArrowRight,
  Copy,
  Check,
} from "lucide-react";

interface DashboardPageProps {
  health: HealthResponse | null;
  models: ModelInfo[];
  selectedModel: string;
  onSelectModel: (tag: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  health,
  models,
  selectedModel,
  onSelectModel,
}) => {
  const [copiedTag, setCopiedTag] = React.useState<string | null>(null);

  const copyToClipboard = (text: string, tag: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTag(tag);
    setTimeout(() => setCopiedTag(null), 2000);
  };

  const isOllamaOnline = health?.ollama.is_running ?? false;
  const availableCount = health?.models.available_count ?? 0;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Hero Header */}
      <div>
        <div className="flex items-center space-x-2 text-accent-cyan text-xs font-mono font-semibold tracking-wider uppercase mb-1">
          <span>Local SLM Laboratory</span>
          <span>•</span>
          <span>Single-System AI Research Workbench</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          System Overview & Diagnostics
        </h1>
        <p className="text-sm text-gray-400 mt-1 max-w-3xl">
          Evaluate, benchmark, and compare three small language models (SLMs) across three production workflows:
          Conversational Chat, Document RAG, and Safe Natural-Language CRUD.
        </p>
      </div>

      {/* Top Telemetry / Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Ollama Status */}
        <div className="bg-surface border border-surface-border rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-gray-400 font-mono mb-2">
            <span>INFERENCE ENGINE</span>
            <span
              className={`w-2 h-2 rounded-full ${
                isOllamaOnline ? "bg-accent-emerald animate-pulse" : "bg-accent-rose"
              }`}
            />
          </div>
          <div className="text-xl font-bold text-white flex items-center space-x-2">
            <span>Ollama</span>
            <span
              className={`text-xs px-2 py-0.5 rounded font-mono font-medium ${
                isOllamaOnline
                  ? "bg-accent-emerald/20 text-accent-emerald"
                  : "bg-accent-rose/20 text-accent-rose"
              }`}
            >
              {isOllamaOnline ? "CONNECTED" : "OFFLINE"}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-2 font-mono">
            {isOllamaOnline
              ? `v${health?.ollama.version || "0.x"} • ${health?.ollama.latency_ms || 0}ms ping`
              : "Run 'ollama serve' in PowerShell"}
          </p>
        </div>

        {/* Model Availability */}
        <div className="bg-surface border border-surface-border rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-gray-400 font-mono mb-2">
            <span>CANDIDATE SLMS</span>
            <Cpu className="w-4 h-4 text-accent-cyan" />
          </div>
          <div className="text-xl font-bold text-white">
            {availableCount} <span className="text-sm font-normal text-gray-400">/ 3 Ready</span>
          </div>
          <p className="text-xs text-gray-400 mt-2 font-mono">
            {availableCount === 3
              ? "All candidate models pulled locally"
              : `${3 - availableCount} model(s) require local download`}
          </p>
        </div>

        {/* RAM Telemetry */}
        <div className="bg-surface border border-surface-border rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-gray-400 font-mono mb-2">
            <span>SYSTEM MEMORY</span>
            <HardDrive className="w-4 h-4 text-accent-emerald" />
          </div>
          <div className="text-xl font-bold text-white">
            {health?.resources.system.ram_percent ?? "--"}%{" "}
            <span className="text-xs font-normal text-gray-400 font-mono">
              ({Math.round((health?.resources.system.ram_used_mb ?? 0) / 1024)}GB /{" "}
              {Math.round((health?.resources.system.ram_total_mb ?? 0) / 1024)}GB)
            </span>
          </div>
          <div className="w-full bg-surface-card rounded-full h-1.5 mt-2.5 overflow-hidden">
            <div
              className="bg-accent-emerald h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${health?.resources.system.ram_percent ?? 0}%` }}
            />
          </div>
        </div>

        {/* GPU / VRAM Telemetry */}
        <div className="bg-surface border border-surface-border rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-gray-400 font-mono mb-2">
            <span>HARDWARE CONSTRAINTS</span>
            <span className="text-accent-amber text-[10px] font-mono">SEQUENTIAL</span>
          </div>
          <div className="text-base font-bold text-white flex items-center space-x-1.5">
            <span>NVIDIA RTX 4050</span>
            <span className="text-xs text-gray-400 font-mono font-normal">(6GB VRAM)</span>
          </div>
          <p className="text-xs text-gray-400 mt-2 font-mono">
            {health?.resources.gpu.gpu_available
              ? `${Math.round((health?.resources.gpu.vram_used_mb ?? 0) / 1024)}GB / ${Math.round(
                  (health?.resources.gpu.vram_total_mb ?? 0) / 1024
                )}GB VRAM in use`
              : "Isolated single-model loading enforced"}
          </p>
        </div>
      </div>

      {/* Scientific Note & Parameter Clarification Alert */}
      <div className="bg-surface-card/60 border border-primary-500/30 rounded-xl p-4 text-xs text-gray-300">
        <div className="flex items-start space-x-3">
          <HelpCircle className="w-5 h-5 text-accent-cyan flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-white">
              Scientific Parameter Distinction: Qwen 2.5 3B vs Strict 3.00B Limits
            </h2>
            <p className="leading-relaxed text-gray-300">
              In small language model benchmarking, precision regarding parameter scaling is essential.{" "}
              <strong>Qwen2.5 3B Instruct</strong> is commercially classified as a "3B" model, but has an actual
              published count of approximately <strong>3.09 Billion parameters</strong>. If an evaluation rule
              mandates a strict upper bound of exactly 3.00B parameters, this model can be seamlessly swapped in the
              registry with a strictly compliant alternative. For our laboratory benchmarks, all three models
              execute sequentially on local hardware with verified reproducibility.
            </p>
          </div>
        </div>
      </div>

      {/* Candidate Models Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Candidate Small Language Models</h2>
          <span className="text-xs font-mono text-gray-400">Shared Model Service & Registry</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {models.map((model) => {
            const isSelected = model.tag === selectedModel;
            return (
              <div
                key={model.tag}
                className={`bg-surface border rounded-xl p-5 flex flex-col justify-between transition-all ${
                  isSelected
                    ? "border-accent-cyan ring-1 ring-accent-cyan shadow-lg shadow-accent-cyan/5"
                    : "border-surface-border hover:border-gray-600"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-white text-base">{model.display_name}</h3>
                      <div className="text-xs text-accent-cyan font-mono mt-0.5">{model.published_parameters}</div>
                    </div>
                    <span
                      className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                        model.is_available_locally
                          ? "bg-accent-emerald/10 text-accent-emerald border-accent-emerald/20"
                          : "bg-accent-amber/10 text-accent-amber border-accent-amber/20"
                      }`}
                    >
                      {model.is_available_locally ? "Installed" : "Missing"}
                    </span>
                  </div>

                  <p className="text-xs text-gray-400 mt-3 leading-relaxed">{model.architecture_note}</p>

                  <div className="mt-4 pt-3 border-t border-surface-border/60 space-y-2 text-xs font-mono text-gray-300">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Context Window:</span>
                      <span>{model.context_window.toLocaleString()} tokens</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Recommended Temp:</span>
                      <span>{model.recommended_temperature}</span>
                    </div>
                    {model.quantization_level && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Quantization:</span>
                        <span>{model.quantization_level}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-surface-border flex flex-col gap-2">
                  <div className="flex items-center justify-between bg-black/40 px-2.5 py-1.5 rounded border border-surface-border text-xs font-mono">
                    <span className="truncate text-gray-300 mr-2">{model.install_command}</span>
                    <button
                      onClick={() => copyToClipboard(model.install_command, model.tag)}
                      className="text-gray-400 hover:text-white transition-colors"
                      title="Copy install command"
                    >
                      {copiedTag === model.tag ? (
                        <Check className="w-3.5 h-3.5 text-accent-emerald" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  <button
                    onClick={() => onSelectModel(model.tag)}
                    className={`w-full py-2 px-3 rounded-lg text-xs font-semibold transition-colors ${
                      isSelected
                        ? "bg-primary-600 text-white cursor-default"
                        : "bg-surface-card hover:bg-surface-border text-gray-200"
                    }`}
                  >
                    {isSelected ? "Active Selected Model" : "Select for Evaluation"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Three Applications Quick-Launch Cards */}
      <div>
        <h2 className="text-lg font-bold text-white mb-4">Three Evaluated Applications</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Chatbot */}
          <Link
            to="/chat"
            className="group bg-surface hover:bg-surface-card/60 border border-surface-border hover:border-primary-500/40 rounded-xl p-5 transition-all shadow-sm"
          >
            <div className="w-10 h-10 rounded-lg bg-primary-600/20 text-accent-cyan flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
              <MessageSquare className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base group-hover:text-accent-cyan transition-colors flex items-center justify-between">
              <span>Local AI Chatbot</span>
              <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            </h3>
            <p className="text-xs text-gray-400 mt-2 leading-relaxed">
              Multi-turn persistent conversations with token streaming, latency tracking, and markdown rendering.
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              <span className="text-[10px] font-mono bg-surface-card px-2 py-0.5 rounded text-gray-300">
                Persistent SQLite
              </span>
              <span className="text-[10px] font-mono bg-surface-card px-2 py-0.5 rounded text-gray-300">
                Streaming TTFT
              </span>
            </div>
          </Link>

          {/* RAG System */}
          <Link
            to="/rag"
            className="group bg-surface hover:bg-surface-card/60 border border-surface-border hover:border-primary-500/40 rounded-xl p-5 transition-all shadow-sm"
          >
            <div className="w-10 h-10 rounded-lg bg-accent-emerald/20 text-accent-emerald flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
              <FileText className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base group-hover:text-accent-emerald transition-colors flex items-center justify-between">
              <span>Document RAG System</span>
              <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            </h3>
            <p className="text-xs text-gray-400 mt-2 leading-relaxed">
              PDF, DOCX, and TXT parsing with ChromaDB vector search, passage citations, and evidence grounding.
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              <span className="text-[10px] font-mono bg-surface-card px-2 py-0.5 rounded text-gray-300">
                ChromaDB Local
              </span>
              <span className="text-[10px] font-mono bg-surface-card px-2 py-0.5 rounded text-gray-300">
                all-MiniLM-L6-v2
              </span>
            </div>
          </Link>

          {/* Database Assistant */}
          <Link
            to="/database"
            className="group bg-surface hover:bg-surface-card/60 border border-surface-border hover:border-primary-500/40 rounded-xl p-5 transition-all shadow-sm"
          >
            <div className="w-10 h-10 rounded-lg bg-accent-purple/20 text-accent-purple flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
              <Database className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base group-hover:text-accent-purple transition-colors flex items-center justify-between">
              <span>Natural-Language Database</span>
              <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            </h3>
            <p className="text-xs text-gray-400 mt-2 leading-relaxed">
              Structured CRUD operations on isolated SQLite tables with schema validation and destructive action confirmations.
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              <span className="text-[10px] font-mono bg-surface-card px-2 py-0.5 rounded text-gray-300">
                SQLAlchemy 2.x
              </span>
              <span className="text-[10px] font-mono bg-surface-card px-2 py-0.5 rounded text-gray-300">
                Two-Phase Safety
              </span>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
};
