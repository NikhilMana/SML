import React, { useState, useEffect } from "react";
import {
  Database,
  Terminal,
  ShieldCheck,
  AlertTriangle,
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  Table,
  Layers,
  History,
} from "lucide-react";
import { ModelInfo } from "../types";
import {
  databaseApi,
  DatabaseSchemaResponse,
  InterpretationResponse,
  ExecutionResult,
  DatabaseAuditLog,
} from "../services/database";

interface DatabaseAssistantPageProps {
  selectedModel: string;
  models: ModelInfo[];
}

export const DatabaseAssistantPage: React.FC<DatabaseAssistantPageProps> = ({
  selectedModel,
  models,
}) => {
  const [activeTab, setActiveTab] = useState<"query" | "schema" | "logs">("query");
  const [prompt, setPrompt] = useState("");
  const [isInterpreting, setIsInterpreting] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Schema state
  const [schemaData, setSchemaData] = useState<DatabaseSchemaResponse | null>(null);
  const [selectedTable, setSelectedTable] = useState<string>("customers");

  // Interpretation & execution states
  const [interpretation, setInterpretation] = useState<InterpretationResponse | null>(null);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Audit logs state
  const [logs, setLogs] = useState<DatabaseAuditLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const activeModelMeta = models.find((m) => m.tag === selectedModel);

  const examplePrompts = [
    { label: "Bengaluru Customers", prompt: "Show all customers who live in Bengaluru" },
    { label: "Products > $200", prompt: "Find all products with a price greater than or equal to 200" },
    { label: "Top 3 Expensive", prompt: "List the top 3 most expensive products in stock" },
    { label: "Add Accessory", prompt: "Add a new product named 'Ergonomic Desk Pad' in the 'Accessories' category for 29.99 with 50 items in stock" },
    { label: "Update Stock (Safe)", prompt: "Update the stock of product with ID 1 to 25 items" },
    { label: "Delete Order (Safe)", prompt: "Delete the order with ID 2 from the system" },
    { label: "Safety Test (Reject)", prompt: "Delete all customers from the database completely" },
  ];

  // Load schema on mount
  useEffect(() => {
    loadSchema();
  }, []);

  const loadSchema = async () => {
    try {
      const data = await databaseApi.getSchema();
      setSchemaData(data);
      if (data.tables.length > 0 && !selectedTable) {
        setSelectedTable(data.tables[0].table_name);
      }
    } catch (err) {
      console.error("Failed to load schema:", err);
    }
  };

  const loadLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const data = await databaseApi.getAuditLogs(30);
      setLogs(data);
    } catch (err) {
      console.error("Failed to load audit logs:", err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const handleResetDemoDb = async () => {
    if (!window.confirm("Reset the demo database back to default synthetic records?")) return;
    setIsResetting(true);
    try {
      await databaseApi.resetDemoDatabase();
      setStatusMessage("Demo eCommerce database re-seeded successfully.");
      await loadSchema();
      setExecutionResult(null);
      setInterpretation(null);
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err) {
      console.error("Failed to reset demo DB:", err);
    } finally {
      setIsResetting(false);
    }
  };

  const handleInterpret = async (customPrompt?: string) => {
    const textToSubmit = customPrompt || prompt;
    if (!textToSubmit.trim()) return;

    if (customPrompt) {
      setPrompt(customPrompt);
    }

    setIsInterpreting(true);
    setInterpretation(null);
    setExecutionResult(null);

    try {
      const result = await databaseApi.interpretPrompt(textToSubmit, selectedModel);
      setInterpretation(result);

      // If it is a safe read operation (SELECT) that passed safety, execute immediately for best UX
      if (result.is_valid && result.safety_check_passed && !result.requires_confirmation && result.proposal?.operation_type === "SELECT") {
        await handleExecute(result);
      }
    } catch (err: any) {
      console.error("Interpretation failed:", err);
      setInterpretation({
        user_prompt: textToSubmit,
        model_tag: selectedModel,
        is_valid: false,
        safety_check_passed: false,
        requires_confirmation: false,
        risk_assessment: "Network / Service Failure",
        affected_records_preview: [],
        error_message: err.message || "Failed to communicate with database assistant backend",
      });
    } finally {
      setIsInterpreting(false);
    }
  };

  const handleExecute = async (interpToUse?: InterpretationResponse) => {
    const activeInterp = interpToUse || interpretation;
    if (!activeInterp || !activeInterp.proposal) return;

    setIsExecuting(true);
    try {
      const result = await databaseApi.executeSafeOperation(
        activeInterp.proposal,
        activeInterp.user_prompt,
        selectedModel
      );
      setExecutionResult(result);
      loadSchema(); // Refresh schema row counts
    } catch (err: any) {
      console.error("Execution failed:", err);
      setStatusMessage(`Execution error: ${err.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleConfirmMutation = async () => {
    if (!interpretation?.confirmation_id) return;

    setIsExecuting(true);
    try {
      const result = await databaseApi.confirmOperation(interpretation.confirmation_id);
      setExecutionResult(result);
      setInterpretation(null); // Clear pending confirmation
      setStatusMessage("Destructive operation committed with verified confirmation token.");
      loadSchema(); // Refresh schema row counts
      setTimeout(() => setStatusMessage(null), 5000);
    } catch (err: any) {
      console.error("Confirmation execution failed:", err);
      setStatusMessage(`Confirmation error: ${err.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  const getOpBadgeColor = (op?: string) => {
    switch (op) {
      case "SELECT":
        return "bg-accent-cyan/15 text-accent-cyan border-accent-cyan/30";
      case "INSERT":
        return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
      case "UPDATE":
        return "bg-amber-500/15 text-amber-400 border-amber-500/30";
      case "DELETE":
        return "bg-rose-500/15 text-rose-400 border-rose-500/30";
      default:
        return "bg-gray-500/15 text-gray-400 border-gray-500/30";
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-surface-border pb-5">
        <div>
          <div className="flex items-center space-x-2 text-accent-cyan text-xs font-mono uppercase tracking-wider">
            <span>Application Three</span>
            <span>•</span>
            <span>Local SLM Controlled CRUD Engine</span>
          </div>
          <h1 className="text-2xl font-bold text-white mt-1 flex items-center gap-2">
            <Database className="w-6 h-6 text-accent-purple" />
            Natural-Language Database Assistant
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Safe, structured database interaction on isolated SQLite eCommerce database with two-phase mutation confirmation.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-surface border border-surface-border rounded-lg px-3 py-1.5 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-mono text-gray-300">Model:</span>
            <span className="text-xs font-mono text-accent-cyan font-bold">{selectedModel}</span>
            {activeModelMeta && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-purple/20 text-accent-purple border border-accent-purple/30 font-mono">
                {activeModelMeta.published_parameters}
              </span>
            )}
          </div>

          <button
            onClick={handleResetDemoDb}
            disabled={isResetting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-surface hover:bg-surface-border border border-surface-border text-gray-300 hover:text-white rounded-lg transition-colors"
            title="Reset demo database to original state"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isResetting ? "animate-spin" : ""}`} />
            <span>Reset Demo DB</span>
          </button>
        </div>
      </div>

      {/* Status banner */}
      {statusMessage && (
        <div className="p-3 bg-accent-cyan/10 border border-accent-cyan/30 text-accent-cyan rounded-lg text-xs flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusMessage}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-gray-400 hover:text-white text-xs">
            ✕
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-surface-border">
        <button
          onClick={() => setActiveTab("query")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === "query"
              ? "border-accent-cyan text-accent-cyan font-semibold"
              : "border-transparent text-gray-400 hover:text-gray-200"
          }`}
        >
          <Terminal className="w-4 h-4" />
          <span>Natural-Language Query Workbench</span>
        </button>

        <button
          onClick={() => {
            setActiveTab("schema");
            loadSchema();
          }}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === "schema"
              ? "border-accent-cyan text-accent-cyan font-semibold"
              : "border-transparent text-gray-400 hover:text-gray-200"
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Interactive Schema Explorer</span>
        </button>

        <button
          onClick={() => {
            setActiveTab("logs");
            loadLogs();
          }}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === "logs"
              ? "border-accent-cyan text-accent-cyan font-semibold"
              : "border-transparent text-gray-400 hover:text-gray-200"
          }`}
        >
          <History className="w-4 h-4" />
          <span>Safety Audit Logs</span>
        </button>
      </div>

      {/* TAB 1: QUERY WORKBENCH */}
      {activeTab === "query" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Prompt Input & Interpretation */}
          <div className="lg:col-span-5 space-y-5">
            <div className="bg-surface border border-surface-border rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Terminal className="w-4 h-4 text-accent-cyan" />
                <span>Instruction Prompt</span>
              </h2>

              <div className="space-y-2">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. 'Show me all customers who live in Bengaluru' or 'Update stock of product 1 to 25'..."
                  rows={3}
                  className="w-full bg-background border border-surface-border rounded-lg p-3 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-accent-cyan font-mono resize-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleInterpret();
                    }
                  }}
                />

                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-500 font-mono">Press Enter to interpret</span>
                  <button
                    onClick={() => handleInterpret()}
                    disabled={isInterpreting || !prompt.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 bg-accent-cyan hover:bg-accent-cyan/90 disabled:opacity-50 text-background font-bold text-xs rounded-lg transition-colors"
                  >
                    <Play className={`w-3.5 h-3.5 ${isInterpreting ? "animate-spin" : ""}`} />
                    <span>{isInterpreting ? "Interpreting..." : "Interpret & Plan"}</span>
                  </button>
                </div>
              </div>

              {/* Example Prompts */}
              <div className="pt-2 border-t border-surface-border/50 space-y-2">
                <span className="text-[11px] text-gray-400 font-mono block">Curated Benchmark Examples:</span>
                <div className="flex flex-wrap gap-1.5">
                  {examplePrompts.map((eg, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleInterpret(eg.prompt)}
                      disabled={isInterpreting}
                      className="text-[11px] px-2 py-1 bg-surface-border/50 hover:bg-surface-border hover:text-accent-cyan text-gray-300 rounded border border-surface-border transition-colors font-mono"
                    >
                      {eg.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Model Interpretation Card */}
            {interpretation && (
              <div className="bg-surface border border-surface-border rounded-xl p-5 space-y-4 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-accent-purple" />
                    <span>Model Proposal & Policy Check</span>
                  </h3>
                  {interpretation.latency_ms && (
                    <span className="text-[10px] font-mono text-gray-400 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-accent-cyan" />
                      {interpretation.latency_ms} ms
                    </span>
                  )}
                </div>

                {/* Status Badges */}
                <div className="flex flex-wrap items-center gap-2">
                  {interpretation.proposal ? (
                    <>
                      <span className={`text-xs px-2.5 py-1 rounded font-mono font-bold border ${getOpBadgeColor(interpretation.proposal.operation_type)}`}>
                        {interpretation.proposal.operation_type}
                      </span>
                      <span className="text-xs px-2.5 py-1 rounded font-mono bg-surface-border text-gray-300 border border-surface-border">
                        table: <strong className="text-white">{interpretation.proposal.target_entity}</strong>
                      </span>
                    </>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded font-mono bg-rose-500/20 text-rose-300 border border-rose-500/40">
                      Unparseable Operation
                    </span>
                  )}

                  {interpretation.safety_check_passed ? (
                    <span className="text-xs px-2 py-0.5 rounded font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Safety Passed
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded font-mono bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1">
                      <XCircle className="w-3 h-3" />
                      Safety Rejected
                    </span>
                  )}
                </div>

                {/* Explanation */}
                {interpretation.proposal?.explanation && (
                  <div className="p-3 bg-background rounded-lg border border-surface-border/60 text-xs text-gray-300">
                    <strong className="text-gray-400 block mb-0.5">Model Rationale:</strong>
                    {interpretation.proposal.explanation}
                  </div>
                )}

                {/* Proposal Details Table/JSON */}
                {interpretation.proposal && (
                  <div className="space-y-1.5 font-mono text-xs">
                    {interpretation.proposal.filters && Object.keys(interpretation.proposal.filters).length > 0 && (
                      <div className="p-2 bg-background rounded border border-surface-border text-gray-300">
                        <span className="text-gray-500">filters:</span>{" "}
                        <span className="text-accent-cyan">{JSON.stringify(interpretation.proposal.filters)}</span>
                      </div>
                    )}
                    {interpretation.proposal.data && Object.keys(interpretation.proposal.data).length > 0 && (
                      <div className="p-2 bg-background rounded border border-surface-border text-gray-300">
                        <span className="text-gray-500">mutation payload:</span>{" "}
                        <span className="text-emerald-400">{JSON.stringify(interpretation.proposal.data)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Rejection Alert */}
                {!interpretation.safety_check_passed && (
                  <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-lg text-xs text-rose-200 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-rose-300">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>Security Guardrail Triggered</span>
                    </div>
                    <p>{interpretation.error_message || interpretation.risk_assessment}</p>
                  </div>
                )}

                {/* Two-Phase Confirmation Required Modal / Warning */}
                {interpretation.requires_confirmation && interpretation.safety_check_passed && (
                  <div className="p-4 bg-amber-950/40 border border-amber-600/50 rounded-xl space-y-3">
                    <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>Two-Phase Confirmation Required</span>
                    </div>
                    <p className="text-xs text-amber-200/90">
                      This is a destructive mutation (<strong className="text-white">{interpretation.proposal?.operation_type}</strong>).
                      Review the records below before committing.
                    </p>

                    {/* Affected Records Preview */}
                    {interpretation.affected_records_preview.length > 0 && (
                      <div className="overflow-x-auto max-h-36 border border-amber-700/40 rounded bg-background/60">
                        <table className="w-full text-left text-[11px] font-mono">
                          <thead className="bg-amber-950/60 text-amber-300 border-b border-amber-700/40">
                            <tr>
                              {Object.keys(interpretation.affected_records_preview[0]).map((key) => (
                                <th key={key} className="p-1.5 px-2">{key}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-amber-900/30 text-gray-300">
                            {interpretation.affected_records_preview.map((rec, i) => (
                              <tr key={i}>
                                {Object.values(rec).map((val: any, j) => (
                                  <td key={j} className="p-1.5 px-2 truncate max-w-[150px]">{String(val)}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={handleConfirmMutation}
                        disabled={isExecuting}
                        className="flex-1 py-2 px-3 bg-amber-500 hover:bg-amber-600 text-background font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{isExecuting ? "Committing..." : "Confirm & Commit Mutation"}</span>
                      </button>
                      <button
                        onClick={() => setInterpretation(null)}
                        className="py-2 px-3 bg-surface border border-surface-border text-gray-400 hover:text-white text-xs rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Non-destructive manual trigger (if not auto-executed) */}
                {!interpretation.requires_confirmation && interpretation.safety_check_passed && interpretation.proposal?.operation_type !== "SELECT" && (
                  <button
                    onClick={() => handleExecute()}
                    disabled={isExecuting}
                    className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-background font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>{isExecuting ? "Executing..." : "Execute Safe Operation"}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Execution Output & Data Inspector */}
          <div className="lg:col-span-7 space-y-5">
            <div className="bg-surface border border-surface-border rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-surface-border pb-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Table className="w-4 h-4 text-accent-cyan" />
                  <span>Execution Results & Data Table</span>
                </h3>

                {executionResult && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-border text-gray-300">
                      {executionResult.affected_rows} row(s)
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-border text-accent-cyan">
                      {executionResult.latency_ms} ms
                    </span>
                  </div>
                )}
              </div>

              {executionResult ? (
                <div className="space-y-4 animate-fadeIn">
                  {/* Natural Language Summary Banner */}
                  <div className="p-3 bg-accent-cyan/10 border border-accent-cyan/25 rounded-lg text-xs text-gray-200">
                    <strong className="text-accent-cyan block mb-0.5">Execution Summary:</strong>
                    {executionResult.natural_language_summary}
                  </div>

                  {/* Parameterized SQL Representation */}
                  <div className="p-3 bg-background border border-surface-border rounded-lg space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-gray-400">
                      <span>Parameterized SQLAlchemy Query:</span>
                      <span className="text-emerald-400 font-mono text-[10px]">Zero Raw String SQL</span>
                    </div>
                    <code className="text-xs text-accent-purple font-mono block overflow-x-auto whitespace-pre-wrap">
                      {executionResult.executed_sql_parameterized}
                    </code>
                  </div>

                  {/* Data Records Table */}
                  {executionResult.data && executionResult.data.length > 0 ? (
                    <div className="border border-surface-border rounded-lg overflow-hidden">
                      <div className="overflow-x-auto max-h-96">
                        <table className="w-full text-left text-xs font-mono">
                          <thead className="bg-surface-border/50 text-gray-300 sticky top-0">
                            <tr>
                              {Object.keys(executionResult.data[0]).map((col) => (
                                <th key={col} className="p-2.5 px-3 border-b border-surface-border">{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-surface-border/40 text-gray-300">
                            {executionResult.data.map((row, idx) => (
                              <tr key={idx} className="hover:bg-surface-border/20 transition-colors">
                                {Object.values(row).map((val: any, j) => (
                                  <td key={j} className="p-2.5 px-3 truncate max-w-[200px]">
                                    {val === null || val === undefined ? (
                                      <span className="text-gray-500 italic">null</span>
                                    ) : typeof val === "boolean" ? (
                                      val ? "true" : "false"
                                    ) : (
                                      String(val)
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 text-center text-xs text-gray-500 border border-dashed border-surface-border rounded-lg">
                      Operation succeeded with 0 rows returned or affected.
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-12 text-center text-xs text-gray-500 space-y-3">
                  <Database className="w-8 h-8 mx-auto text-gray-600" />
                  <p>Submit an instruction on the left to see parameterized execution results and tabular data.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SCHEMA EXPLORER */}
      {activeTab === "schema" && schemaData && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Table List Sidebar */}
          <div className="md:col-span-3 space-y-2">
            <span className="text-xs font-mono text-gray-400 block px-1">Isolated eCommerce Tables:</span>
            {schemaData.tables.map((t) => (
              <button
                key={t.table_name}
                onClick={() => setSelectedTable(t.table_name)}
                className={`w-full text-left p-3 rounded-lg border text-xs transition-colors flex items-center justify-between ${
                  selectedTable === t.table_name
                    ? "bg-accent-cyan/15 border-accent-cyan text-accent-cyan font-bold"
                    : "bg-surface border-surface-border text-gray-300 hover:bg-surface-border"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Table className="w-4 h-4" />
                  <span className="font-mono">{t.table_name}</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-border font-mono">
                  {t.row_count} rows
                </span>
              </button>
            ))}
          </div>

          {/* Selected Table Schema & Samples */}
          <div className="md:col-span-9 space-y-6">
            {(() => {
              const tableInfo = schemaData.tables.find((t) => t.table_name === selectedTable);
              if (!tableInfo) return null;

              return (
                <div className="space-y-6">
                  {/* Columns Definition */}
                  <div className="bg-surface border border-surface-border rounded-xl p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Layers className="w-4 h-4 text-accent-cyan" />
                      <span>Table Columns & Data Types: <code className="text-accent-cyan">{tableInfo.table_name}</code></span>
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-2">
                      {tableInfo.columns.map((col) => (
                        <div key={col.name} className="p-2.5 bg-background border border-surface-border rounded-lg text-xs font-mono flex items-center justify-between">
                          <div>
                            <span className="text-white font-medium">{col.name}</span>
                            <span className="text-gray-500 text-[10px] block">{col.type}</span>
                          </div>
                          <div className="flex gap-1">
                            {col.primary_key && (
                              <span className="text-[9px] px-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded">PK</span>
                            )}
                            {col.nullable && (
                              <span className="text-[9px] px-1 bg-gray-500/20 text-gray-400 rounded">null</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Sample Records */}
                  <div className="bg-surface border border-surface-border rounded-xl p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Table className="w-4 h-4 text-accent-purple" />
                      <span>Sample Records (Top 3)</span>
                    </h3>

                    {tableInfo.sample_records.length > 0 ? (
                      <div className="border border-surface-border rounded-lg overflow-x-auto">
                        <table className="w-full text-left text-xs font-mono">
                          <thead className="bg-surface-border/50 text-gray-300">
                            <tr>
                              {Object.keys(tableInfo.sample_records[0]).map((col) => (
                                <th key={col} className="p-2 px-3 border-b border-surface-border">{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-surface-border/40 text-gray-300">
                            {tableInfo.sample_records.map((rec, i) => (
                              <tr key={i}>
                                {Object.values(rec).map((val: any, j) => (
                                  <td key={j} className="p-2 px-3 truncate max-w-[150px]">{String(val)}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 italic">No sample records available.</p>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* TAB 3: SAFETY AUDIT LOGS */}
      {activeTab === "logs" && (
        <div className="bg-surface border border-surface-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-surface-border pb-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <History className="w-4 h-4 text-accent-cyan" />
              <span>Operations Audit Trail</span>
            </h3>
            <button
              onClick={loadLogs}
              disabled={isLoadingLogs}
              className="text-xs text-accent-cyan hover:underline flex items-center gap-1"
            >
              <RotateCcw className={`w-3 h-3 ${isLoadingLogs ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {logs.length > 0 ? (
            <div className="overflow-x-auto border border-surface-border rounded-lg">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-surface-border/50 text-gray-300">
                  <tr>
                    <th className="p-2.5 px-3">Timestamp</th>
                    <th className="p-2.5 px-3">Operation</th>
                    <th className="p-2.5 px-3">Table</th>
                    <th className="p-2.5 px-3">Model</th>
                    <th className="p-2.5 px-3">Prompt</th>
                    <th className="p-2.5 px-3">Safety</th>
                    <th className="p-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border/40 text-gray-300">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-surface-border/20 transition-colors">
                      <td className="p-2.5 px-3 text-gray-500 text-[11px]">{new Date(log.created_at).toLocaleTimeString()}</td>
                      <td className="p-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getOpBadgeColor(log.operation_type)}`}>
                          {log.operation_type}
                        </span>
                      </td>
                      <td className="p-2.5 px-3 text-white font-medium">{log.target_entity}</td>
                      <td className="p-2.5 px-3 text-gray-400">{log.model_tag}</td>
                      <td className="p-2.5 px-3 truncate max-w-[200px]" title={log.user_prompt}>{log.user_prompt}</td>
                      <td className="p-2.5 px-3">
                        {log.safety_check_passed ? (
                          <span className="text-emerald-400 text-[10px] font-bold">Passed</span>
                        ) : (
                          <span className="text-rose-400 text-[10px] font-bold">Rejected</span>
                        )}
                      </td>
                      <td className="p-2.5 px-3">
                        {log.executed_success ? (
                          <span className="text-emerald-400 text-[10px]">Success</span>
                        ) : (
                          <span className="text-amber-400 text-[10px]">Pending / Failed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-10 text-center text-xs text-gray-500">
              No database operations logged yet. Run queries from the workbench to build an audit history.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
export default DatabaseAssistantPage;
