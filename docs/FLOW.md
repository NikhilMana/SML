# Execution Flow Documentation

This document describes the actual runtime execution paths through Local SLM Laboratory.

```mermaid
graph TD
    Client["React Workbench (Vite / Port 5173)"]
    API["FastAPI Backend (Uvicorn / Port 8000)"]
    ChatService["Chat Service (services/chat_service.py)"]
    ChatRepo["Chat Repository (db/repositories/chat_repository.py)"]
    Ollama["Local Ollama Daemon (Port 11434)"]
    AppDB["SQLite App DB (storage/app_data.db)"]

    Client -->|POST /api/chat/conversations/:id/stream| API
    API -->|stream_message| ChatService
    ChatService -->|1. add_message(role=user)| ChatRepo
    ChatRepo -->|Persist user turn| AppDB
    ChatService -->|2. POST /api/chat (stream=true)| Ollama
    Ollama -->|3. Yield token chunks| ChatService
    ChatService -->|4. SSE data: {token, ttft}| Client
    Ollama -->|5. done event with eval metrics| ChatService
    ChatService -->|6. add_message(role=assistant)| ChatRepo
    ChatRepo -->|Persist assistant turn & telemetry| AppDB
    ChatService -->|7. SSE data: {saved, message_id}| Client
```

## Flow 1: Preflight Health & Model Discovery

1. **Trigger:** The React workbench loads or the user clicks the "Refresh" button.
2. **Request:** Frontend calls `GET /api/health` and `GET /api/models`.
3. **Backend Processing:**
   - `app/api/routes/health.py` queries `ollama_service.get_health()`.
   - `ollama_service` performs an async HTTP GET to `http://127.0.0.1:11434/api/version`.
   - If connected, it queries `/api/tags` to list installed models and calls `model_registry.update_availability(models_data)`.
   - `resource_monitor.snapshot()` collects real-time RAM from `psutil` and queries GPU VRAM via `nvidia-smi` without fabricating values.
   - Storage verification checks that `./storage/chroma_db` and `./storage/uploads` exist and are writable.
4. **Response:** A structured `HealthResponse` and `ModelsResponse` return to the browser.
5. **UI Rendering:**
   - If Ollama is offline, `ModelStatusBanner` displays instructions to run `ollama serve`.
   - If candidate models are not yet pulled, exact CLI commands (e.g. `ollama pull qwen2.5:3b`) are rendered with single-click copy buttons.
   - The active model dropdown updates with installed checkmarks (`✓`) or warning tags (`⚠ Missing`).

---

## Flow 2: Multi-Turn Chat Conversation & Streaming Execution

1. **Trigger:** User types a message in `ChatPage` and presses Enter or clicks Send.
2. **Request:** Client issues `POST /api/chat/conversations/{id}/stream` with JSON `{ "content": "...", "model_tag": "qwen2.5:3b", "temperature": 0.7 }`.
3. **Backend Processing:**
   - `chat_service.stream_message()` first invokes `chat_repository.add_message(role="user", ...)` to commit the user query to `conversations` and `messages` tables.
   - Context is assembled from recent conversation turns (up to 12 turns) plus the system instruction.
   - `ollama_service.stream_chat()` opens an async HTTP streaming connection to Ollama's `POST /api/chat` with `stream: true`.
   - When the first token arrives, the server emits an SSE event `{"type": "ttft", "ttft_ms": ...}`.
   - For every subsequent token chunk, it yields `{"type": "token", "token": "..."}`.
   - When Ollama reports `done: true`, hardware evaluation duration and token counts are calculated:
     `tps = eval_count / (eval_duration_ns / 1e9)`.
     An event `{"type": "done", "latency_ms": ..., "tokens_per_second": ...}` is emitted.
   - The full accumulated text is saved to SQLite via `chat_repository.add_message(role="assistant", ...)` alongside its exact latency and throughput telemetry.
   - Finally, a `{"type": "saved", "message_id": "..."}` event closes the stream.
4. **UI Updates:**
   - The client renders the optimistic user bubble immediately.
   - As tokens arrive, `ReactMarkdown` parses and displays the formatted text in real time with a pulsating cursor.
   - Once complete, the message displays the active model tag badge, total latency, TTFT, throughput (tok/s), and a copy button.

---

## Flow 3: Document RAG Ingestion and Grounded Q&A

1. **Document Ingestion:**
   - User drops a document (PDF, DOCX, TXT, MD) into `RAGPage`.
   - `POST /api/rag/documents` uploads the file to `storage/documents/`.
   - `DocumentService` reads the file (using PyMuPDF for PDFs, python-docx for DOCX, or UTF-8 decoding for TXT/MD).
   - `ChunkingService` segments the document into semantic chunks (500 chars with 100-char overlap) while preserving sentence boundaries.
   - `EmbeddingService` converts each chunk into a 384-dimensional vector using local `all-MiniLM-L6-v2`.
   - Vectors and metadata (filename, page number, chunk index) are upserted into persistent ChromaDB (`storage/chromadb/`).
   - SQLite stores document and chunk records in `app_data.db`.

2. **Grounded Query & Answering:**
   - User inputs a question in the RAG search bar.
   - `POST /api/rag/query` embeds the query vector and performs cosine similarity search in ChromaDB to retrieve top-$k$ passages.
   - The passages are injected into an augmented system prompt instructing the SLM to cite sources using `[Document: ..., Page: ...]` and output `"INSUFFICIENT EVIDENCE"` if unanswerable.
   - The model generates the answer. The UI renders the response with interactive citation pills that highlight matching source text in the retrieved passage modal.

---

## Flow 4: Natural-Language Relational Database Assistant

1. **Interpretation & Plan Proposal:**
   - User types an instruction (e.g. `"Update stock of product 1 to 25"`).
   - `POST /api/database/interpret` invokes `DatabaseAssistantService`.
   - The service prompts the SLM in JSON mode to convert the query into a structured `CRUDOperationProposal`.
   - `OperationValidator` checks the proposal against `SCHEMA_ALLOWLIST`. Any request targeting unallowlisted tables or attempting bulk operations without filters is rejected immediately.

2. **Two-Phase Confirmation for Destructive Mutations:**
   - If the operation is `UPDATE` or `DELETE`, the validator flags `requires_confirmation = True`.
   - `DemoRepository` previews the matching records from `demo_ecommerce.db`.
   - A single-use server confirmation token (UUID) is generated with a 5-minute TTL and cached.
   - The UI presents a warning card and tabular preview of affected records, along with a "Confirm & Commit Mutation" button.
   - Once the user clicks confirm, `POST /api/database/confirm` validates and consumes the token.
   - `DemoRepository` executes the parameterized SQLAlchemy query and commits the transaction.
   - An immutable audit entry is written to `database_assistant_logs` in `app_data.db`.

---

## Flow 5: Unified Sequential Benchmark Execution

1. **Trigger:** User launches a benchmark run from `BenchmarksPage`.
2. **GPU Arbitration:**
   - `BenchmarkService` acquires `_BENCHMARK_GPU_LOCK` to ensure no other model evaluates concurrently on the 6GB GPU.
   - `BenchmarkRun` is created in SQLite with status `"running"`.
3. **Execution Loop:**
   - Evaluates models sequentially (`qwen2.5:3b` -> `llama3.2:3b` -> `qwen3:1.7b`).
   - For each model, it runs test cases across selected suites (`Chatbot`, `RAG`, `Database`).
   - Measures exact latency ($ms$), throughput ($tok/s$), and peak VRAM.
   - Grades outputs programmatically with deterministic evaluators (`chat_evaluator`, `rag_evaluator`, `database_evaluator`).
   - Inserts each result into `benchmark_results` table and updates run progress.
4. **Finalization & Visualization:**
   - Computes overall and category scores, releases the GPU lock, and updates run status to `"completed"`.
   - The frontend comparative dashboard refreshes, rendering grouped Recharts bar charts, latency curves, throughput rankings, and CSV/JSON export options.

