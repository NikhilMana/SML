import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import {
  FileText,
  Upload,
  Trash2,
  Search,
  Eye,
  Clock,
  Activity,
  AlertCircle,
  CheckCircle2,
  Cpu,
  Layers,
  X,
  FileCheck,
} from "lucide-react";
import { ModelInfo } from "../types";
import {
  fetchDocuments,
  fetchDocumentDetails,
  uploadDocument,
  deleteDocument,
  searchPassages,
  queryRAG,
  DocumentItem,
  DocumentWithChunks,
  RAGSearchResult,
  RAGQueryResponse,
} from "../services/rag";

interface RAGPageProps {
  selectedModel: string;
  models: ModelInfo[];
}

export const RAGPage: React.FC<RAGPageProps> = ({ selectedModel: globalModel, models }) => {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedModelTag, setSelectedModelTag] = useState<string>(globalModel);
  const [queryText, setQueryText] = useState<string>("");
  const [topK, setTopK] = useState<number>(3);
  const [filterDocId, setFilterDocId] = useState<string>("");
  const [isSearchOnly, setIsSearchOnly] = useState<boolean>(false);

  // Ingestion settings
  const [chunkSize, setChunkSize] = useState<number>(500);
  const [chunkOverlap, setChunkOverlap] = useState<number>(50);

  // Loading & Execution states
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Results
  const [ragResult, setRagResult] = useState<RAGQueryResponse | null>(null);
  const [searchResults, setSearchResults] = useState<RAGSearchResult[]>([]);

  // Chunk Inspection Modal
  const [inspectingDoc, setInspectingDoc] = useState<DocumentWithChunks | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadDocs = async () => {
    try {
      const list = await fetchDocuments();
      setDocuments(list);
    } catch (err) {
      console.error("Failed to load documents:", err);
    }
  };

  useEffect(() => {
    loadDocs();
  }, []);

  useEffect(() => {
    setSelectedModelTag(globalModel);
  }, [globalModel]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setErrorBanner(null);
    setSuccessBanner(null);

    try {
      const uploaded = await uploadDocument(file, chunkSize, chunkOverlap);
      setSuccessBanner(`Indexed "${uploaded.filename}" into ChromaDB (${uploaded.chunk_count} chunks).`);
      await loadDocs();
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: any) {
      setErrorBanner(err.message || "Failed to process document.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteDocument = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}" and remove all vector embeddings from ChromaDB?`)) return;

    try {
      await deleteDocument(id);
      setSuccessBanner(`Deleted "${name}" and purged its vector embeddings.`);
      await loadDocs();
      if (inspectingDoc?.id === id) setInspectingDoc(null);
    } catch (err: any) {
      setErrorBanner(err.message || "Failed to delete document.");
    }
  };

  const handleInspectDocument = async (id: string) => {
    try {
      const details = await fetchDocumentDetails(id);
      setInspectingDoc(details);
    } catch (err: any) {
      setErrorBanner(err.message || "Failed to fetch document chunks.");
    }
  };

  const handleExecuteRAG = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = queryText.trim();
    if (!q || isExecuting) return;

    setIsExecuting(true);
    setErrorBanner(null);
    setRagResult(null);
    setSearchResults([]);

    try {
      if (isSearchOnly) {
        const results = await searchPassages(q, topK, filterDocId);
        setSearchResults(results);
      } else {
        const response = await queryRAG(q, selectedModelTag, topK, 0.3, filterDocId);
        setRagResult(response);
      }
    } catch (err: any) {
      setErrorBanner(err.message || "RAG execution encountered an error.");
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-surface-border pb-4">
        <div>
          <div className="flex items-center space-x-2 text-accent-emerald text-xs font-mono font-semibold uppercase tracking-wider">
            <span>Application Two</span>
            <span>•</span>
            <span>Document Grounded Ingestion & Search</span>
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight mt-1">
            Local Retrieval-Augmented Generation (RAG)
          </h1>
          <p className="text-xs text-gray-400 mt-1 max-w-2xl">
            Extract text from PDF, DOCX, TXT, or Markdown, index into local persistent ChromaDB using{" "}
            <code className="text-accent-cyan font-mono">all-MiniLM-L6-v2</code> (384-dim), and query any SLM with citations.
          </p>
        </div>

        {/* Global Controls */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 text-xs bg-surface-card border border-surface-border px-3 py-1.5 rounded-lg">
            <Cpu className="w-3.5 h-3.5 text-accent-cyan" />
            <span className="text-gray-400 font-mono">Model:</span>
            <select
              value={selectedModelTag}
              onChange={(e) => setSelectedModelTag(e.target.value)}
              className="bg-transparent text-white font-mono text-xs focus:outline-none cursor-pointer"
            >
              {models.map((m) => (
                <option key={m.tag} value={m.tag} className="bg-surface-card text-white">
                  {m.display_name} {m.is_available_locally ? "✓" : "⚠"}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Status Alerts */}
      {errorBanner && (
        <div className="bg-accent-rose/15 border border-accent-rose/30 px-4 py-3 rounded-xl flex items-center justify-between text-xs text-accent-rose">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorBanner}</span>
          </div>
          <button onClick={() => setErrorBanner(null)} className="text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successBanner && (
        <div className="bg-accent-emerald/15 border border-accent-emerald/30 px-4 py-3 rounded-xl flex items-center justify-between text-xs text-accent-emerald">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{successBanner}</span>
          </div>
          <button onClick={() => setSuccessBanner(null)} className="text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Grid: Document Manager (Left) & Q&A / Inspector (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Knowledge Base & Upload (4 Cols) */}
        <div className="lg:col-span-4 space-y-4">
          {/* Upload Card */}
          <div className="bg-surface border border-surface-border rounded-xl p-4 space-y-3 shadow-sm">
            <h2 className="text-xs font-bold font-mono uppercase tracking-wider text-gray-300 flex items-center space-x-2">
              <Upload className="w-3.5 h-3.5 text-accent-cyan" />
              <span>Ingest Document</span>
            </h2>

            {/* Drop Zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-surface-border hover:border-accent-cyan/60 rounded-xl p-5 text-center cursor-pointer transition-colors bg-surface-card/40 hover:bg-surface-card/70"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,.md"
                onChange={handleFileUpload}
                disabled={isUploading}
                className="hidden"
              />
              <FileCheck className="w-8 h-8 text-accent-cyan mx-auto mb-2 opacity-80" />
              <div className="text-xs font-medium text-white">Click to upload document</div>
              <div className="text-[10px] text-gray-500 font-mono mt-1">PDF, DOCX, TXT, or MD (Max 25MB)</div>
            </div>

            {/* Chunk Parameters */}
            <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] font-mono text-gray-400">
              <div>
                <label className="block mb-1">Chunk Size (chars):</label>
                <input
                  type="number"
                  value={chunkSize}
                  onChange={(e) => setChunkSize(parseInt(e.target.value) || 500)}
                  min={100}
                  max={2000}
                  className="w-full bg-surface-card border border-surface-border rounded px-2 py-1 text-white text-xs"
                />
              </div>
              <div>
                <label className="block mb-1">Overlap (chars):</label>
                <input
                  type="number"
                  value={chunkOverlap}
                  onChange={(e) => setChunkOverlap(parseInt(e.target.value) || 50)}
                  min={0}
                  max={500}
                  className="w-full bg-surface-card border border-surface-border rounded px-2 py-1 text-white text-xs"
                />
              </div>
            </div>

            {isUploading && (
              <div className="flex items-center justify-center space-x-2 text-xs text-accent-cyan font-mono pt-2">
                <div className="w-3.5 h-3.5 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" />
                <span>Chunking & generating embeddings...</span>
              </div>
            )}
          </div>

          {/* Indexed Documents List */}
          <div className="bg-surface border border-surface-border rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold font-mono uppercase tracking-wider text-gray-300 flex items-center space-x-2">
                <Layers className="w-3.5 h-3.5 text-accent-emerald" />
                <span>Indexed Library ({documents.length})</span>
              </h2>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {documents.length === 0 ? (
                <div className="text-center py-6 text-xs text-gray-500 font-mono">
                  No documents indexed yet. Upload one above!
                </div>
              ) : (
                documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-2.5 rounded-lg bg-surface-card/60 border border-surface-border hover:border-gray-600 transition-colors flex items-center justify-between text-xs"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="font-medium text-white truncate">{doc.filename}</div>
                      <div className="text-[10px] text-gray-400 font-mono flex items-center space-x-2 mt-0.5">
                        <span className="uppercase text-accent-cyan">{doc.file_type}</span>
                        <span>•</span>
                        <span>{Math.round(doc.file_size_bytes / 1024)} KB</span>
                        <span>•</span>
                        <span>{doc.chunk_count} chunks</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1 flex-shrink-0">
                      <button
                        onClick={() => handleInspectDocument(doc.id)}
                        className="p-1.5 rounded hover:bg-surface-border text-gray-400 hover:text-accent-cyan transition-colors"
                        title="Inspect Chunks"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteDocument(doc.id, doc.filename)}
                        className="p-1.5 rounded hover:bg-surface-border text-gray-400 hover:text-accent-rose transition-colors"
                        title="Delete Document"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Q&A Engine & Retrieval Inspector (8 Cols) */}
        <div className="lg:col-span-8 space-y-4">
          {/* Query Bar */}
          <div className="bg-surface border border-surface-border rounded-xl p-4 shadow-sm space-y-3">
            <form onSubmit={handleExecuteRAG} className="space-y-3">
              <div className="relative">
                <input
                  type="text"
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  placeholder="Ask a question grounded in your uploaded documents..."
                  className="w-full bg-surface-card border border-surface-border text-white text-sm rounded-xl px-4 py-3 pr-24 focus:outline-none focus:ring-1 focus:ring-accent-cyan font-sans placeholder-gray-500"
                />
                <button
                  type="submit"
                  disabled={!queryText.trim() || isExecuting}
                  className="absolute right-2 top-2 h-8 px-3 rounded-lg bg-primary-600 hover:bg-primary-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>{isSearchOnly ? "Search" : "Ask RAG"}</span>
                </button>
              </div>

              {/* Advanced Query Settings */}
              <div className="flex flex-wrap items-center justify-between text-xs font-mono text-gray-400 gap-3 pt-1">
                <div className="flex items-center space-x-4">
                  {/* Top-K Selector */}
                  <div className="flex items-center space-x-1.5">
                    <span>Top-K:</span>
                    <select
                      value={topK}
                      onChange={(e) => setTopK(parseInt(e.target.value))}
                      className="bg-surface-card border border-surface-border text-white rounded px-2 py-0.5 text-xs focus:outline-none"
                    >
                      {[1, 2, 3, 5, 8, 10].map((k) => (
                        <option key={k} value={k}>
                          {k} passages
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Document Filter */}
                  <div className="flex items-center space-x-1.5">
                    <span>Filter:</span>
                    <select
                      value={filterDocId}
                      onChange={(e) => setFilterDocId(e.target.value)}
                      className="bg-surface-card border border-surface-border text-white rounded px-2 py-0.5 text-xs focus:outline-none max-w-xs truncate"
                    >
                      <option value="">All Documents</option>
                      {documents.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.filename}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Mode Toggle */}
                <div className="flex items-center space-x-2">
                  <span className={!isSearchOnly ? "text-accent-cyan font-bold" : "text-gray-500"}>Grounded Q&A</span>
                  <button
                    type="button"
                    onClick={() => setIsSearchOnly(!isSearchOnly)}
                    className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
                      isSearchOnly ? "bg-accent-emerald" : "bg-surface-border"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform ${
                        isSearchOnly ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                  <span className={isSearchOnly ? "text-accent-emerald font-bold" : "text-gray-500"}>Vector Only</span>
                </div>
              </div>
            </form>
          </div>

          {/* Loading Indicator */}
          {isExecuting && (
            <div className="bg-surface border border-surface-border rounded-xl p-8 text-center space-y-3">
              <div className="w-6 h-6 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin mx-auto" />
              <div className="text-xs text-gray-300 font-mono">
                {isSearchOnly
                  ? "Querying ChromaDB vector embeddings..."
                  : `Retrieving top-${topK} passages and prompting ${selectedModelTag}...`}
              </div>
            </div>
          )}

          {/* Grounded Answer Card */}
          {ragResult && !isExecuting && (
            <div className="bg-surface border border-surface-border rounded-xl p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-surface-border pb-3">
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-accent-cyan" />
                  <h2 className="text-sm font-bold text-white">Grounded Answer</h2>
                </div>
                {ragResult.insufficient_evidence ? (
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-accent-amber/20 text-accent-amber border border-accent-amber/30">
                    Abstained (Insufficient Evidence)
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-accent-emerald/20 text-accent-emerald border border-accent-emerald/30">
                    Grounded ({ragResult.citations.length} Citations)
                  </span>
                )}
              </div>

              {/* Answer Content */}
              <div className="markdown-body prose prose-invert max-w-none text-xs md:text-sm text-gray-200 leading-relaxed">
                <ReactMarkdown>{ragResult.answer}</ReactMarkdown>
              </div>

              {/* Citations List */}
              {ragResult.citations.length > 0 && (
                <div className="pt-2 border-t border-surface-border/60">
                  <div className="text-[11px] font-mono text-gray-400 mb-1.5">Cited Sources:</div>
                  <div className="flex flex-wrap gap-2">
                    {ragResult.citations.map((c, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 rounded bg-surface-card border border-surface-border text-[11px] font-mono text-accent-cyan flex items-center space-x-1"
                      >
                        <span>{c.filename}</span>
                        {c.page_number && <span className="text-gray-400">p.{c.page_number}</span>}
                        <span className="text-accent-emerald">({Math.round(c.relevance_score * 100)}%)</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Performance Telemetry */}
              <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-surface-border text-[11px] font-mono text-gray-400">
                <span className="text-accent-cyan">{ragResult.model_tag}</span>
                {ragResult.latency_ms && (
                  <span className="flex items-center space-x-1">
                    <Clock className="w-3 h-3" />
                    <span>{Math.round(ragResult.latency_ms)}ms</span>
                  </span>
                )}
                {ragResult.tokens_per_second && (
                  <span className="flex items-center space-x-1 text-accent-amber">
                    <Activity className="w-3 h-3" />
                    <span>{ragResult.tokens_per_second} tok/s</span>
                  </span>
                )}
                {ragResult.output_tokens && <span>{ragResult.output_tokens} tokens</span>}
              </div>
            </div>
          )}

          {/* Retrieved Passages Inspector */}
          {((ragResult && ragResult.retrieved_passages.length > 0) || searchResults.length > 0) && !isExecuting && (
            <div className="bg-surface border border-surface-border rounded-xl p-5 space-y-3 shadow-sm">
              <div className="flex items-center justify-between border-b border-surface-border pb-2.5">
                <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-gray-300 flex items-center space-x-2">
                  <Search className="w-3.5 h-3.5 text-accent-cyan" />
                  <span>
                    Retrieved Context Inspector ({(ragResult ? ragResult.retrieved_passages : searchResults).length}{" "}
                    Passages)
                  </span>
                </h3>
              </div>

              <div className="space-y-3">
                {(ragResult ? ragResult.retrieved_passages : searchResults).map((passage, idx) => (
                  <div
                    key={passage.chunk_id || idx}
                    className="p-3.5 rounded-lg bg-surface-card border border-surface-border text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <div className="flex items-center space-x-2 text-white">
                        <span className="text-accent-cyan font-bold">Passage #{idx + 1}</span>
                        <span>•</span>
                        <span className="truncate max-w-xs">{passage.filename}</span>
                        {passage.page_number && <span className="text-gray-400">p.{passage.page_number}</span>}
                      </div>

                      {/* Relevance Bar */}
                      <div className="flex items-center space-x-2">
                        <div className="w-16 bg-background rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-accent-emerald h-1.5 rounded-full"
                            style={{ width: `${Math.round(passage.relevance_score * 100)}%` }}
                          />
                        </div>
                        <span className="text-accent-emerald font-bold">
                          {Math.round(passage.relevance_score * 100)}%
                        </span>
                      </div>
                    </div>

                    <div className="text-gray-300 leading-relaxed font-sans bg-background/50 p-2.5 rounded border border-surface-border/50">
                      {passage.content}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Document Chunks Inspector Modal */}
      {inspectingDoc && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-surface-border rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-surface-border flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-white">{inspectingDoc.filename}</h3>
                <div className="text-xs text-gray-400 font-mono mt-0.5">
                  {inspectingDoc.chunk_count} Chunks • {Math.round(inspectingDoc.file_size_bytes / 1024)} KB
                </div>
              </div>
              <button
                onClick={() => setInspectingDoc(null)}
                className="p-1 rounded-lg hover:bg-surface-card text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {inspectingDoc.chunks.map((chunk, idx) => (
                <div key={chunk.id} className="p-3 rounded-lg bg-surface-card border border-surface-border text-xs space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-mono text-gray-400">
                    <span className="text-accent-cyan">Chunk #{idx + 1}</span>
                    {chunk.page_number && <span>Page {chunk.page_number}</span>}
                    <span>{chunk.char_length} chars</span>
                  </div>
                  <div className="text-gray-200 font-sans leading-relaxed">{chunk.content}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
