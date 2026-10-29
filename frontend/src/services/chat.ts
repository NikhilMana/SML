/**
 * Chat API client handling conversation persistence, message sending, and token streaming.
 */

import { request } from "./api";
import { Conversation, Message } from "../types";

export interface ConversationListItem {
  id: string;
  title: string;
  model_tag: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export async function fetchConversations(): Promise<ConversationListItem[]> {
  return request<ConversationListItem[]>("/chat/conversations");
}

export async function fetchConversation(id: string): Promise<Conversation> {
  return request<Conversation>(`/chat/conversations/${encodeURIComponent(id)}`);
}

export async function createConversation(title?: string, model_tag?: string): Promise<Conversation> {
  return request<Conversation>("/chat/conversations", {
    method: "POST",
    body: JSON.stringify({
      title: title || "New Conversation",
      model_tag: model_tag || "qwen2.5:3b",
    }),
  });
}

export async function updateConversation(
  id: string,
  title?: string,
  model_tag?: string,
): Promise<Conversation> {
  return request<Conversation>(`/chat/conversations/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ title, model_tag }),
  });
}

export async function deleteConversation(id: string): Promise<void> {
  await request<void>(`/chat/conversations/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function resetConversation(id: string): Promise<{ message: string; cleared_messages: number }> {
  return request<{ message: string; cleared_messages: number }>(`/chat/conversations/${encodeURIComponent(id)}/reset`, {
    method: "POST",
  });
}

export async function sendChatMessage(
  conversationId: string,
  content: string,
  modelTag?: string,
  temperature?: number,
): Promise<Message> {
  return request<Message>(`/chat/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content,
      model_tag: modelTag,
      temperature: temperature ?? 0.7,
    }),
  });
}

export interface StreamEvent {
  type: "ttft" | "token" | "done" | "saved" | "error";
  ttft_ms?: number;
  token?: string;
  latency_ms?: number;
  tokens_per_second?: number;
  input_tokens?: number;
  output_tokens?: number;
  message_id?: string;
  message?: string;
}

/**
 * Stream response tokens using Fetch API and ReadableStream.
 * Returns an abort controller to support user-initiated cancellation.
 */
export function streamChatMessage(
  conversationId: string,
  content: string,
  modelTag: string,
  temperature: number,
  onEvent: (event: StreamEvent) => void,
  onComplete: () => void,
  onError: (errorMsg: string) => void,
): () => void {
  const controller = new AbortController();

  (async () => {
    try {
      const response = await fetch(`/api/chat/conversations/${encodeURIComponent(conversationId)}/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream",
        },
        body: JSON.stringify({
          content,
          model_tag: modelTag,
          temperature,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("ReadableStream not supported by browser");
      }

      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        // Keep unfinished trailing chunk in buffer
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            try {
              const eventData: StreamEvent = JSON.parse(trimmed.slice(6));
              onEvent(eventData);
            } catch (err) {
              console.warn("Failed to parse SSE line:", trimmed, err);
            }
          }
        }
      }

      onComplete();
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        console.log("Stream aborted by user");
      } else {
        const msg = err instanceof Error ? err.message : "Streaming connection failed";
        onError(msg);
      }
    }
  })();

  return () => {
    controller.abort();
  };
}
