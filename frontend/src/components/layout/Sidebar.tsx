import React from "react";
import { NavLink } from "react-router-dom";
import {
  Cpu,
  MessageSquare,
  FileText,
  Database,
  BarChart3,
  Settings,
  Layers,
} from "lucide-react";

interface SidebarProps {
  ollamaOnline: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ ollamaOnline }) => {
  const navItems = [
    { to: "/", label: "Overview & Health", icon: Layers },
    { to: "/chat", label: "Local AI Chatbot", icon: MessageSquare },
    { to: "/rag", label: "Document RAG", icon: FileText },
    { to: "/database", label: "Database Assistant", icon: Database },
    { to: "/benchmarks", label: "Benchmark Engine", icon: BarChart3 },
    { to: "/settings", label: "Settings & Models", icon: Settings },
  ];

  return (
    <aside className="w-64 bg-surface border-r border-surface-border flex flex-col h-screen fixed left-0 top-0 select-none z-30">
      {/* Brand Header */}
      <div className="p-4 border-b border-surface-border flex items-center space-x-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-primary-600 to-accent-cyan flex items-center justify-center shadow-lg shadow-primary-500/10">
          <Cpu className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-sm font-bold tracking-wide text-white">Local SLM Lab</h1>
          <p className="text-xs text-gray-400 font-mono">v1.0.0 • On-Device</p>
        </div>
      </div>

      {/* Navigation links */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Applications
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary-600/20 text-accent-cyan border border-primary-500/30 font-semibold"
                    : "text-gray-300 hover:bg-surface-card hover:text-white"
                }`
              }
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Ollama daemon status footer */}
      <div className="p-3 border-t border-surface-border bg-surface-card/40">
        <div className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-background/50 border border-surface-border">
          <div className="flex items-center space-x-2">
            <span
              className={`w-2 h-2 rounded-full ${
                ollamaOnline ? "bg-accent-emerald animate-pulse" : "bg-accent-rose"
              }`}
            />
            <span className="font-mono text-gray-300">Ollama Daemon</span>
          </div>
          <span className={`text-[11px] font-semibold ${ollamaOnline ? "text-accent-emerald" : "text-accent-rose"}`}>
            {ollamaOnline ? "ONLINE" : "OFFLINE"}
          </span>
        </div>
      </div>
    </aside>
  );
};
