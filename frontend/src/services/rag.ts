/**
 * RAG API client for document ingestion, vector similarity search, and grounded Q&A.
 */

import { request } from "./api";

export interface DocumentItem {
  id: string;
  filename: string;
  file_size_bytes: number;
  file_type: string;
  status: string;
  chunk_count: number;
  created_at: string;
}

export interface DocumentChunkItem {
  id: string;
  document_id: string;
  chunk_index: int;
  content: string;
  page_number: int | null;
  char_length: int;
}

export type int = number;

export interface DocumentWithChunks extends DocumentItem {
  chunks: DocumentChunkItem[];
}

export interface RAGSearchResult {
  chunk_id: string;
  content: string;
  relevance_score: number;
  document_id: string;
  filename: string;
  page_number: number | null;
  chunk_index: number;
}

export interface CitationItem {
  citation: string;
  document_id: string;
  filename: string;
  page_number: number | null;
  relevance_score: number;
}

export interface RAGQueryResponse {
  answer: string;
  retrieved_passages: RAGSearchResult[];
  citations: CitationItem[];
  is_grounded: boolean;
  insufficient_evidence: boolean;
  model_tag: string;
  latency_ms?: number;
  ttft_ms?: number;
  tokens_per_second?: number;
  input_tokens?: number;
  output_tokens?: number;
}

export async function fetchDocuments(): Promise<DocumentItem[]> {
  return request<DocumentItem[]>("/rag/documents");
}

export async function fetchDocumentDetails(id: string): Promise<DocumentWithChunks> {
  return request<DocumentWithChunks>(`/rag/documents/${encodeURIComponent(id)}`);
}

export async function uploadDocument(
  file: File,
  chunkSize: number = 500,
  chunkOverlap: number = 50,
): Promise<DocumentItem> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("chunk_size", chunkSize.toString());
  formData.append("chunk_overlap", chunkOverlap.toString());

  return request<DocumentItem>("/rag/documents", {
    method: "POST",
    body: formData,
  });
}

export async function deleteDocument(id: string): Promise<void> {
  await request<void>(`/rag/documents/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function searchPassages(
  query: string,
  topK: number = 3,
  filterDocId?: string,
): Promise<RAGSearchResult[]> {
  return request<RAGSearchResult[]>("/rag/search", {
    method: "POST",
    body: JSON.stringify({
      query,
      top_k: topK,
      filter_document_id: filterDocId || null,
    }),
  });
}

export async function queryRAG(
  query: string,
  modelTag: string,
  topK: number = 3,
  temperature: number = 0.3,
  filterDocId?: string,
): Promise<RAGQueryResponse> {
  return request<RAGQueryResponse>("/rag/query", {
    method: "POST",
    body: JSON.stringify({
      query,
      model_tag: modelTag,
      top_k: topK,
      temperature,
      filter_document_id: filterDocId || null,
    }),
  });
}
