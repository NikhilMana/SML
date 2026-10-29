import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Sidebar } from "../components/layout/Sidebar";
import { Header } from "../components/layout/Header";
import { ModelStatusBanner } from "../components/layout/ModelStatusBanner";
import { DashboardPage } from "../pages/DashboardPage";
import { ChatPage } from "../pages/ChatPage";
import { RAGPage } from "../pages/RAGPage";
import { DatabaseAssistantPage } from "../pages/DatabaseAssistantPage";
import { BenchmarksPage } from "../pages/BenchmarksPage";
import { SettingsPage } from "../pages/SettingsPage";
import { fetchHealth, fetchModels } from "../services/models";
import { HealthResponse, ModelInfo } from "../types";

export const App: React.FC = () => {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("qwen2.5:3b");
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [initialLoading, setInitialLoading] = useState<boolean>(true);

  const loadSystemData = async () => {
    setIsRefreshing(true);
    try {
      const [healthData, modelsData] = await Promise.all([
        fetchHealth().catch(() => null),
        fetchModels().catch(() => ({ models: [], default_model: "qwen2.5:3b", ollama_running: false, ollama_version: null })),
      ]);

      if (healthData) setHealth(healthData);
      if (modelsData && modelsData.models.length > 0) {
        setModels(modelsData.models);
        // Retain current selection if valid, otherwise pick default
        if (!modelsData.models.some((m) => m.tag === selectedModel)) {
          setSelectedModel(modelsData.default_model || modelsData.models[0].tag);
        }
      }
    } catch (err) {
      console.error("Failed to load system diagnostics:", err);
    } finally {
      setIsRefreshing(false);
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    loadSystemData();
    // Auto-refresh telemetry every 30 seconds
    const interval = setInterval(loadSystemData, 30000);
    return () => clearInterval(interval);
  }, []);

  const isOllamaOnline = health?.ollama.is_running ?? false;

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-background text-gray-100 flex">
        {/* Persistent Left Sidebar */}
        <Sidebar ollamaOnline={isOllamaOnline} />

        {/* Main Content Area */}
        <div className="flex-1 ml-64 flex flex-col min-w-0">
          {/* Header */}
          <Header
            models={models}
            selectedModel={selectedModel}
            onSelectModel={setSelectedModel}
            systemResources={health?.resources.system}
            gpuResources={health?.resources.gpu}
            onRefresh={loadSystemData}
            isRefreshing={isRefreshing}
          />

          {/* Model Status Banner */}
          <ModelStatusBanner
            ollamaOnline={isOllamaOnline}
            models={models}
            selectedModel={selectedModel}
          />

          {/* Page Body */}
          <main className="flex-1 p-6 md:p-8 overflow-y-auto">
            {initialLoading ? (
              <div className="flex items-center justify-center h-64 space-x-3 text-gray-400 font-mono text-sm">
                <div className="w-5 h-5 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" />
                <span>Connecting to Local SLM Laboratory backend...</span>
              </div>
            ) : (
              <Routes>
                <Route
                  path="/"
                  element={
                    <DashboardPage
                      health={health}
                      models={models}
                      selectedModel={selectedModel}
                      onSelectModel={setSelectedModel}
                    />
                  }
                />
                <Route
                  path="/chat"
                  element={<ChatPage selectedModel={selectedModel} models={models} />}
                />
                <Route
                  path="/rag"
                  element={<RAGPage selectedModel={selectedModel} models={models} />}
                />
                <Route
                  path="/database"
                  element={<DatabaseAssistantPage selectedModel={selectedModel} models={models} />}
                />
                <Route
                  path="/benchmarks"
                  element={<BenchmarksPage selectedModel={selectedModel} models={models} />}
                />
                <Route
                  path="/settings"
                  element={
                    <SettingsPage
                      health={health}
                      models={models}
                      selectedModel={selectedModel}
                      onRefresh={loadSystemData}
                      isRefreshing={isRefreshing}
                    />
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            )}
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
};

export default App;
