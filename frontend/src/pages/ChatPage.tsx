import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import {
  MessageSquare,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Send,
  Square,
  RotateCcw,
  Clock,
  Zap,
  Activity,
  Copy,
  AlertCircle,
  Cpu,
  Sliders,
} from "lucide-react";
import { ModelInfo, Conversation, Message } from "../types";
import {
  fetchConversations,
  fetchConversation,
  createConversation,
  updateConversation,
  deleteConversation,
  resetConversation,
  streamChatMessage,
  StreamEvent,
  ConversationListItem,
} from "../services/chat";

interface ChatPageProps {
  selectedModel: string;
  models: ModelInfo[];
}

export const ChatPage: React.FC<ChatPageProps> = ({ selectedModel: globalModel, models }) => {
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [inputPrompt, setInputPrompt] = useState<string>("");
  const [temperature, setTemperature] = useState<number>(0.7);
  const [localModelTag, setLocalModelTag] = useState<string>(globalModel);

  // Streaming and loading states
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [streamingMetrics, setStreamingMetrics] = useState<{ ttft_ms?: number; tokens_per_second?: number; latency_ms?: number }>({});
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  // Inline editing state for conversation titles
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editTitleInput, setEditTitleInput] = useState<string>("");

  const abortStreamRef = useRef<(() => void) | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeConversation?.messages, streamingContent]);

  // Load conversations list on mount
  const loadConversations = async (selectFirst: boolean = false) => {
    try {
      const list = await fetchConversations();
      setConversations(list);
      if (selectFirst && list.length > 0 && !activeConvId) {
        selectConversation(list[0].id);
      }
    } catch (err) {
      console.error("Failed to load conversations:", err);
    }
  };

  useEffect(() => {
    loadConversations(true);
  }, []);

  // When global model changes, sync local model tag if not explicitly set
  useEffect(() => {
    setLocalModelTag(globalModel);
  }, [globalModel]);

  const selectConversation = async (id: string) => {
    setErrorBanner(null);
    try {
      const conv = await fetchConversation(id);
      setActiveConversation(conv);
      setActiveConvId(conv.id);
      setLocalModelTag(conv.model_tag || globalModel);
    } catch (err) {
      console.error("Failed to fetch conversation:", err);
    }
  };

  const handleCreateNewChat = async () => {
    setErrorBanner(null);
    try {
      const newConv = await createConversation("New Conversation", localModelTag);
      await loadConversations(false);
      await selectConversation(newConv.id);
    } catch (err) {
      setErrorBanner("Failed to create new conversation session.");
    }
  };

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this conversation?")) return;

    try {
      await deleteConversation(id);
      const remaining = conversations.filter((c) => c.id !== id);
      setConversations(remaining);

      if (activeConvId === id) {
        if (remaining.length > 0) {
          selectConversation(remaining[0].id);
        } else {
          setActiveConversation(null);
          setActiveConvId(null);
        }
      }
    } catch (err) {
      setErrorBanner("Failed to delete conversation.");
    }
  };

  const handleStartRename = (conv: ConversationListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingConvId(conv.id);
    setEditTitleInput(conv.title);
  };

  const handleSaveRename = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editTitleInput.trim()) return;
    try {
      await updateConversation(id, editTitleInput.trim());
      setEditingConvId(null);
      await loadConversations(false);
      if (activeConversation?.id === id) {
        setActiveConversation((prev) => (prev ? { ...prev, title: editTitleInput.trim() } : null));
      }
    } catch (err) {
      console.error("Failed to rename conversation:", err);
    }
  };

  const handleResetHistory = async () => {
    if (!activeConvId) return;
    if (!window.confirm("Clear all messages in this conversation?")) return;

    try {
      await resetConversation(activeConvId);
      await selectConversation(activeConvId);
      await loadConversations(false);
    } catch (err) {
      setErrorBanner("Failed to reset conversation history.");
    }
  };

  const handleCopyMessage = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const promptText = inputPrompt.trim();
    if (!promptText || isStreaming) return;

    // Ensure we have an active conversation, or create one
    let targetConvId = activeConvId;
    if (!targetConvId) {
      try {
        const newConv = await createConversation(promptText.slice(0, 30), localModelTag);
        targetConvId = newConv.id;
        setActiveConvId(newConv.id);
        setActiveConversation(newConv);
      } catch (err) {
        setErrorBanner("Failed to initialize conversation.");
        return;
      }
    }

    // Optimistically add user turn to UI
    const optimisticUserMsg: Message = {
      id: "temp-" + Date.now(),
      conversation_id: targetConvId,
      role: "user",
      content: promptText,
      created_at: new Date().toISOString(),
    };

    setActiveConversation((prev) =>
      prev ? { ...prev, messages: [...prev.messages, optimisticUserMsg] } : null
    );

    setInputPrompt("");
    setIsStreaming(true);
    setStreamingContent("");
    setStreamingMetrics({});
    setErrorBanner(null);

    // Trigger SSE streaming
    const abort = streamChatMessage(
      targetConvId,
      promptText,
      localModelTag,
      temperature,
      (event: StreamEvent) => {
        if (event.type === "ttft") {
          setStreamingMetrics((prev) => ({ ...prev, ttft_ms: event.ttft_ms }));
        } else if (event.type === "token") {
          setStreamingContent((prev) => prev + (event.token || ""));
        } else if (event.type === "done") {
          setStreamingMetrics((prev) => ({
            ...prev,
            latency_ms: event.latency_ms,
            tokens_per_second: event.tokens_per_second,
          }));
        } else if (event.type === "error") {
          setErrorBanner(event.message || "Streaming inference error encountered.");
          setIsStreaming(false);
        }
      },
      async () => {
        setIsStreaming(false);
        setStreamingContent("");
        abortStreamRef.current = null;
        if (targetConvId) {
          await selectConversation(targetConvId);
          await loadConversations(false);
        }
      },
      (errorMsg: string) => {
        setIsStreaming(false);
        setErrorBanner(errorMsg);
        abortStreamRef.current = null;
      }
    );

    abortStreamRef.current = abort;
  };

  const handleStopStreaming = () => {
    if (abortStreamRef.current) {
      abortStreamRef.current();
      abortStreamRef.current = null;
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const samplePrompts = [
    "What is the difference between an SLM and a full-size LLM?",
    "Explain how multi-head attention works in simple terms.",
    "Write a Python function to compute the Fibonacci sequence with memoization.",
    "List three trade-offs of running AI models entirely on-device.",
  ];

  return (
    <div className="flex h-[calc(100vh-8.5rem)] -m-6 md:-m-8 bg-background overflow-hidden border-t border-surface-border">
      {/* 1. Conversations Sidebar */}
      <div className="w-72 bg-surface/90 border-r border-surface-border flex flex-col h-full select-none">
        {/* New Chat Button */}
        <div className="p-3 border-b border-surface-border">
          <button
            onClick={handleCreateNewChat}
            className="w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>New Conversation</span>
          </button>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.length === 0 ? (
            <div className="text-center py-8 text-xs text-gray-500">
              No conversations yet. Start a new chat!
            </div>
          ) : (
            conversations.map((conv) => {
              const isActive = conv.id === activeConvId;
              const isEditing = editingConvId === conv.id;

              return (
                <div
                  key={conv.id}
                  onClick={() => !isEditing && selectConversation(conv.id)}
                  className={`group relative flex items-center justify-between p-2.5 rounded-lg text-xs cursor-pointer transition-colors ${
                    isActive
                      ? "bg-surface-card text-white border border-primary-500/30"
                      : "text-gray-300 hover:bg-surface-card/50 hover:text-white"
                  }`}
                >
                  <div className="flex items-center space-x-2 min-w-0 flex-1">
                    <MessageSquare className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? "text-accent-cyan" : "text-gray-500"}`} />
                    {isEditing ? (
                      <input
                        type="text"
                        value={editTitleInput}
                        onChange={(e) => setEditTitleInput(e.target.value)}
                        className="bg-background border border-accent-cyan text-white text-xs px-1.5 py-0.5 rounded focus:outline-none w-full"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <div className="truncate">
                        <div className="font-medium truncate">{conv.title}</div>
                        <div className="text-[10px] text-gray-400 font-mono flex items-center space-x-1.5 mt-0.5">
                          <span>{conv.model_tag}</span>
                          <span>•</span>
                          <span>{conv.message_count} msgs</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions (Rename / Delete) */}
                  <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                    {isEditing ? (
                      <>
                        <button
                          onClick={(e) => handleSaveRename(conv.id, e)}
                          className="p-1 hover:text-accent-emerald text-gray-400"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingConvId(null);
                          }}
                          className="p-1 hover:text-accent-rose text-gray-400"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={(e) => handleStartRename(conv, e)}
                          className="p-1 hover:text-accent-cyan text-gray-400"
                          title="Rename"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteConversation(conv.id, e)}
                          className="p-1 hover:text-accent-rose text-gray-400"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 2. Main Chat Thread */}
      <div className="flex-1 flex flex-col h-full bg-background min-w-0">
        {/* Chat Header */}
        <div className="h-14 border-b border-surface-border px-5 flex items-center justify-between bg-surface/50">
          <div className="flex items-center space-x-3 min-w-0">
            <h2 className="font-bold text-sm text-white truncate">
              {activeConversation ? activeConversation.title : "New Conversation"}
            </h2>
            {activeConversation && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-card border border-surface-border text-gray-400">
                {activeConversation.messages.length} messages
              </span>
            )}
          </div>

          <div className="flex items-center space-x-3">
            {/* Conversation Model Switcher */}
            <div className="flex items-center space-x-1.5 text-xs">
              <Cpu className="w-3.5 h-3.5 text-accent-cyan" />
              <select
                value={localModelTag}
                onChange={(e) => setLocalModelTag(e.target.value)}
                className="bg-surface-card border border-surface-border text-white text-xs rounded px-2 py-1 font-mono focus:outline-none focus:ring-1 focus:ring-accent-cyan"
              >
                {models.map((m) => (
                  <option key={m.tag} value={m.tag}>
                    {m.display_name} {m.is_available_locally ? "✓" : "⚠"}
                  </option>
                ))}
              </select>
            </div>

            {/* Temperature Slider */}
            <div className="hidden sm:flex items-center space-x-1.5 text-xs text-gray-400 font-mono">
              <Sliders className="w-3.5 h-3.5" />
              <span>T:</span>
              <input
                type="range"
                min="0.0"
                max="1.5"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-16 h-1 bg-surface-border rounded-lg cursor-pointer accent-accent-cyan"
                title={`Temperature: ${temperature}`}
              />
              <span className="text-white w-6">{temperature}</span>
            </div>

            {/* Clear history button */}
            {activeConversation && activeConversation.messages.length > 0 && (
              <button
                onClick={handleResetHistory}
                className="flex items-center space-x-1 px-2.5 py-1 rounded bg-surface-card hover:bg-surface-border border border-surface-border text-xs text-gray-300 hover:text-white transition-colors"
                title="Clear messages in conversation"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Error Alert Banner */}
        {errorBanner && (
          <div className="bg-accent-rose/15 border-b border-accent-rose/30 px-5 py-2.5 flex items-center justify-between text-xs text-accent-rose">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorBanner}</span>
            </div>
            <button onClick={() => setErrorBanner(null)} className="text-gray-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">
          {!activeConversation || activeConversation.messages.length === 0 ? (
            <div className="max-w-2xl mx-auto py-12 text-center space-y-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-primary-600/30 to-accent-cyan/20 border border-primary-500/30 flex items-center justify-center mx-auto text-accent-cyan shadow-lg shadow-primary-500/10">
                <MessageSquare className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Local SLM Interactive Chat</h3>
                <p className="text-xs text-gray-400 mt-1.5 max-w-md mx-auto">
                  Running on <span className="font-mono text-accent-cyan">{localModelTag}</span> with zero cloud transmission. Ask questions or try a sample benchmark prompt:
                </p>
              </div>

              {/* Sample Prompts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left pt-2">
                {samplePrompts.map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setInputPrompt(prompt);
                    }}
                    className="p-3 rounded-lg bg-surface hover:bg-surface-card border border-surface-border text-xs text-gray-300 hover:text-white transition-all text-left"
                  >
                    "{prompt}"
                  </button>
                ))}
              </div>
            </div>
          ) : (
            activeConversation.messages.map((msg) => {
              const isUser = msg.role === "user";

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-3xl rounded-xl p-4 text-xs md:text-sm leading-relaxed ${
                      isUser
                        ? "bg-primary-600 text-white rounded-br-none shadow-sm"
                        : "bg-surface border border-surface-border text-gray-200 rounded-bl-none shadow-sm"
                    }`}
                  >
                    {isUser ? (
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    ) : (
                      <div className="markdown-body prose prose-invert max-w-none text-xs md:text-sm">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    )}
                  </div>

                  {/* Telemetry Footer for Assistant Responses */}
                  {!isUser && (
                    <div className="flex flex-wrap items-center gap-2 mt-1.5 px-1 text-[11px] font-mono text-gray-400">
                      {msg.model_tag && (
                        <span className="px-1.5 py-0.5 rounded bg-surface-card border border-surface-border text-accent-cyan">
                          {msg.model_tag}
                        </span>
                      )}
                      {msg.latency_ms !== null && msg.latency_ms !== undefined && (
                        <span className="flex items-center space-x-1" title="Total response latency">
                          <Clock className="w-3 h-3 text-gray-400" />
                          <span>{Math.round(msg.latency_ms)}ms</span>
                        </span>
                      )}
                      {msg.ttft_ms !== null && msg.ttft_ms !== undefined && (
                        <span className="flex items-center space-x-1 text-accent-emerald" title="Time to first token">
                          <Zap className="w-3 h-3" />
                          <span>TTFT {Math.round(msg.ttft_ms)}ms</span>
                        </span>
                      )}
                      {msg.tokens_per_second !== null && msg.tokens_per_second !== undefined && (
                        <span className="flex items-center space-x-1 text-accent-amber" title="Tokens per second">
                          <Activity className="w-3 h-3" />
                          <span>{msg.tokens_per_second} tok/s</span>
                        </span>
                      )}
                      {msg.output_tokens !== null && msg.output_tokens !== undefined && (
                        <span className="text-gray-400">
                          {msg.output_tokens} tok
                        </span>
                      )}
                      <button
                        onClick={() => handleCopyMessage(msg.content, msg.id)}
                        className="hover:text-white transition-colors ml-1 p-0.5"
                        title="Copy text"
                      >
                        {copiedMsgId === msg.id ? (
                          <Check className="w-3 h-3 text-accent-emerald" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Active Streaming Token Bubble */}
          {isStreaming && (
            <div className="flex flex-col items-start">
              <div className="max-w-3xl rounded-xl p-4 text-xs md:text-sm bg-surface border border-accent-cyan/40 text-gray-200 rounded-bl-none shadow-sm">
                <div className="markdown-body prose prose-invert max-w-none text-xs md:text-sm">
                  <ReactMarkdown>{streamingContent || "Generating response..."}</ReactMarkdown>
                </div>
                <span className="inline-block w-1.5 h-3.5 bg-accent-cyan animate-pulse ml-1 align-middle" />
              </div>

              {/* Streaming metrics ticker */}
              <div className="flex items-center space-x-3 mt-1.5 px-1 text-[11px] font-mono text-gray-400">
                <span className="text-accent-cyan animate-pulse">Streaming from {localModelTag}</span>
                {streamingMetrics.ttft_ms && (
                  <span className="flex items-center space-x-1 text-accent-emerald">
                    <Zap className="w-3 h-3" />
                    <span>TTFT {Math.round(streamingMetrics.ttft_ms)}ms</span>
                  </span>
                )}
                {streamingMetrics.tokens_per_second && (
                  <span className="flex items-center space-x-1 text-accent-amber">
                    <Activity className="w-3 h-3" />
                    <span>{streamingMetrics.tokens_per_second} tok/s</span>
                  </span>
                )}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-surface-border bg-surface/50">
          <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Ask ${localModelTag}... (Press Enter to send, Shift+Enter for new line)`}
                rows={2}
                disabled={isStreaming}
                className="w-full bg-surface-card border border-surface-border text-white text-xs md:text-sm rounded-xl px-4 py-3 pr-10 focus:outline-none focus:ring-1 focus:ring-accent-cyan resize-none placeholder-gray-500 font-sans"
              />
            </div>

            {isStreaming ? (
              <button
                type="button"
                onClick={handleStopStreaming}
                className="h-11 px-4 rounded-xl bg-accent-rose hover:bg-rose-600 text-white flex items-center justify-center space-x-1.5 text-xs font-semibold shadow-md transition-colors flex-shrink-0"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span className="hidden sm:inline">Stop</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!inputPrompt.trim()}
                className="h-11 px-4 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center space-x-1.5 text-xs font-semibold shadow-md transition-colors flex-shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Send</span>
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};
