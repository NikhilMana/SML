import React from "react";
import { ModelInfo, SystemTelemetry, GpuTelemetry } from "../../types";
import { RefreshCw, Cpu, HardDrive, AlertTriangle } from "lucide-react";

interface HeaderProps {
  models: ModelInfo[];
  selectedModel: string;
  onSelectModel: (tag: string) => void;
  systemResources?: SystemTelemetry;
  gpuResources?: GpuTelemetry;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  models,
  selectedModel,
  onSelectModel,
  systemResources,
  gpuResources,
  onRefresh,
  isRefreshing,
}) => {
  const currentModelInfo = models.find((m) => m.tag === selectedModel);

  return (
    <header className="h-16 bg-surface/80 backdrop-blur-md border-b border-surface-border sticky top-0 z-20 px-6 flex items-center justify-between">
      {/* Model Selector & Status */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <label htmlFor="model-select" className="text-xs font-mono uppercase text-gray-400">
            Active Model:
          </label>
          <div className="relative">
            <select
              id="model-select"
              value={selectedModel}
              onChange={(e) => onSelectModel(e.target.value)}
              className="bg-surface-card border border-surface-border text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-cyan pr-8 font-mono appearance-none cursor-pointer"
            >
              {models.map((model) => (
                <option key={model.tag} value={model.tag}>
                  {model.display_name} ({model.parameter_count}) {model.is_available_locally ? "✓" : "⚠ Missing"}
                </option>
              ))}
            </select>
            <div className="absolute right-2.5 top-2.5 pointer-events-none text-gray-400 text-xs">▼</div>
          </div>
        </div>

        {/* Local Availability Pill */}
        {currentModelInfo && (
          <div className="flex items-center space-x-1.5">
            {currentModelInfo.is_available_locally ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-accent-emerald/10 text-accent-emerald border border-accent-emerald/20">
                Ready Local
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-accent-amber/10 text-accent-amber border border-accent-amber/20">
                <AlertTriangle className="w-3 h-3 mr-1" /> Not Pulled
              </span>
            )}
            <span className="text-xs text-gray-400 font-mono hidden md:inline">
              {currentModelInfo.published_parameters}
            </span>
          </div>
        )}
      </div>

      {/* Hardware Telemetry & Refresh */}
      <div className="flex items-center space-x-4">
        {/* RAM Telemetry */}
        {systemResources?.ram_used_mb !== undefined && (
          <div className="hidden lg:flex items-center space-x-2 text-xs font-mono bg-surface-card px-2.5 py-1 rounded border border-surface-border text-gray-300">
            <HardDrive className="w-3.5 h-3.5 text-accent-cyan" />
            <span>
              RAM: {Math.round(systemResources.ram_used_mb! / 1024)}GB /{" "}
              {Math.round(systemResources.ram_total_mb! / 1024)}GB ({systemResources.ram_percent}%)
            </span>
          </div>
        )}

        {/* GPU VRAM Telemetry */}
        {gpuResources?.gpu_available ? (
          <div className="hidden lg:flex items-center space-x-2 text-xs font-mono bg-surface-card px-2.5 py-1 rounded border border-surface-border text-gray-300">
            <Cpu className="w-3.5 h-3.5 text-accent-emerald" />
            <span>
              VRAM: {Math.round(gpuResources.vram_used_mb! / 1024)}GB /{" "}
              {Math.round(gpuResources.vram_total_mb! / 1024)}GB
            </span>
          </div>
        ) : (
          <div className="hidden lg:flex items-center space-x-1 text-xs font-mono text-gray-500">
            <span>VRAM: Sequential Inference Mode</span>
          </div>
        )}

        {/* Refresh button */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Refresh model and hardware status"
          className="p-1.5 rounded-lg bg-surface-card hover:bg-surface-border border border-surface-border text-gray-300 hover:text-white transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-accent-cyan" : ""}`} />
        </button>
      </div>
    </header>
  );
};
