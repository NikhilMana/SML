import React from "react";
import { ModelInfo } from "../../types";
import { AlertCircle, Terminal, CheckCircle2, Copy } from "lucide-react";

interface ModelStatusBannerProps {
  ollamaOnline: boolean;
  models: ModelInfo[];
  selectedModel: string;
}

export const ModelStatusBanner: React.FC<ModelStatusBannerProps> = ({
  ollamaOnline,
  models,
  selectedModel,
}) => {
  const [copiedTag, setCopiedTag] = React.useState<string | null>(null);

  const handleCopy = (text: string, tag: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTag(tag);
    setTimeout(() => setCopiedTag(null), 2000);
  };

  const currentModel = models.find((m) => m.tag === selectedModel);

  if (!ollamaOnline) {
    return (
      <div className="bg-accent-rose/10 border-b border-accent-rose/30 px-6 py-3 flex items-start sm:items-center justify-between text-xs sm:text-sm text-accent-rose">
        <div className="flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>
            <strong>Ollama Daemon is Offline:</strong> Local models cannot be run until Ollama is started.
            Run <code className="bg-black/40 px-1.5 py-0.5 rounded font-mono text-white">ollama serve</code> in a terminal.
          </span>
        </div>
      </div>
    );
  }

  if (currentModel && !currentModel.is_available_locally) {
    return (
      <div className="bg-accent-amber/10 border-b border-accent-amber/30 px-6 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between text-xs sm:text-sm text-accent-amber gap-2">
        <div className="flex items-center space-x-2">
          <Terminal className="w-4 h-4 flex-shrink-0" />
          <span>
            Selected model <strong>{currentModel.display_name}</strong> is not pulled yet. Download it locally:
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <code className="bg-black/50 px-2 py-1 rounded font-mono text-white text-xs border border-accent-amber/30">
            {currentModel.install_command}
          </code>
          <button
            onClick={() => handleCopy(currentModel.install_command, currentModel.tag)}
            className="p-1 rounded bg-accent-amber/20 hover:bg-accent-amber/30 text-white transition-colors"
            title="Copy command"
          >
            {copiedTag === currentModel.tag ? <CheckCircle2 className="w-3.5 h-3.5 text-accent-emerald" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    );
  }

  return null;
};
