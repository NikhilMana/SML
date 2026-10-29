import React from "react";
import { HealthResponse, ModelInfo } from "../types";
import { CheckCircle2, AlertTriangle, Cpu, RefreshCw } from "lucide-react";

interface SettingsPageProps {
  health: HealthResponse | null;
  models: ModelInfo[];
  selectedModel: string;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  health,
  models,
  onRefresh,
  isRefreshing,
}) => {
  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">System Settings & Preflight Checks</h1>
        <p className="text-sm text-gray-400 mt-1">
          Verify runtime dependencies, local model storage, and Ollama configuration.
        </p>
      </div>

      {/* Preflight Diagnostics Box */}
      <div className="bg-surface border border-surface-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-surface-border pb-3">
          <h2 className="text-base font-semibold text-white">Diagnostics Checklist</h2>
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center space-x-1.5 text-xs text-accent-cyan hover:underline"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>Re-run Checks</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
          <div className="flex items-center justify-between p-3 rounded bg-surface-card border border-surface-border">
            <span className="text-gray-300">Ollama HTTP Daemon:</span>
            <span className={health?.ollama.is_running ? "text-accent-emerald flex items-center" : "text-accent-rose flex items-center"}>
              {health?.ollama.is_running ? <CheckCircle2 className="w-4 h-4 mr-1" /> : <AlertTriangle className="w-4 h-4 mr-1" />}
              {health?.ollama.is_running ? "ONLINE (11434)" : "OFFLINE"}
            </span>
          </div>

          <div className="flex items-center justify-between p-3 rounded bg-surface-card border border-surface-border">
            <span className="text-gray-300">ChromaDB Directory:</span>
            <span className={health?.storage.chroma_dir ? "text-accent-emerald flex items-center" : "text-accent-rose flex items-center"}>
              {health?.storage.chroma_dir ? <CheckCircle2 className="w-4 h-4 mr-1" /> : <AlertTriangle className="w-4 h-4 mr-1" />}
              {health?.storage.chroma_dir ? "MOUNTED" : "MISSING"}
            </span>
          </div>

          <div className="flex items-center justify-between p-3 rounded bg-surface-card border border-surface-border">
            <span className="text-gray-300">Storage Directory Writable:</span>
            <span className={health?.storage.writable ? "text-accent-emerald flex items-center" : "text-accent-rose flex items-center"}>
              {health?.storage.writable ? <CheckCircle2 className="w-4 h-4 mr-1" /> : <AlertTriangle className="w-4 h-4 mr-1" />}
              {health?.storage.writable ? "WRITABLE" : "READ ONLY"}
            </span>
          </div>

          <div className="flex items-center justify-between p-3 rounded bg-surface-card border border-surface-border">
            <span className="text-gray-300">Hardware Allocation:</span>
            <span className="text-accent-cyan flex items-center">
              <Cpu className="w-4 h-4 mr-1" />
              Sequential Inference
            </span>
          </div>
        </div>
      </div>

      {/* Model Installation Commands Reference */}
      <div className="bg-surface border border-surface-border rounded-xl p-5 space-y-4">
        <h2 className="text-base font-semibold text-white">Manual Model Installation Commands</h2>
        <p className="text-xs text-gray-400">
          Run these in PowerShell or Windows Command Prompt to download models onto your machine:
        </p>

        <div className="space-y-3">
          {models.map((model) => (
            <div key={model.tag} className="bg-black/50 p-3 rounded-lg border border-surface-border">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-xs font-bold text-white">{model.display_name}</span>
                <span className="text-[11px] font-mono text-accent-cyan">{model.published_parameters}</span>
              </div>
              <div className="flex items-center justify-between text-xs font-mono text-gray-300 bg-surface-card/60 px-2.5 py-1.5 rounded">
                <code>{model.install_command}</code>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
