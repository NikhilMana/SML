# Local SLM Laboratory: Data Flow & Subsystem Architecture

This document diagrams how data travels through each subsystem of the laboratory, from user input to model inference and persistent storage.

---

## 1. Subsystem 1: Conversational Chatbot Flow

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Frontend as Frontend (ChatPage)
    participant Route as FastAPI (/chat/stream)
    participant ChatService as ChatService
    participant Repo as ChatRepository
    participant SQLite as app_data.db
    participant Ollama as Ollama API (RTX 4050)

    User->>Frontend: Enters message & submits
    Frontend->>Route: POST /api/chat/stream {conv_id, prompt, model, temp}
    Route->>ChatService: stream_message()
    ChatService->>Repo: save_message(role="user", content=prompt)
    Repo->>SQLite: INSERT INTO chat_messages
    ChatService->>Repo: get_conversation_history(conv_id, limit=20)
    Repo->>SQLite: SELECT FROM chat_messages ORDER BY created_at
    SQLite-->>Repo: [Turn history messages]
    ChatService->>Ollama: POST /api/chat {model, messages, stream: true}
    
    loop Stream Tokens
        Ollama-->>ChatService: Token chunk
        ChatService-->>Route: SSE data chunk
        Route-->>Frontend: text/event-stream chunk
        Frontend-->>User: Renders incremental token
    end

    ChatService->>Repo: save_message(role="assistant", full_content, telemetry)
    Repo->>SQLite: INSERT INTO chat_messages
    Route-->>Frontend: data: [DONE]
```

---

## 2. Subsystem 2: Document RAG Ingestion & Grounded Retrieval

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Frontend as Frontend (RAGPage)
    participant Route as FastAPI (/rag)
    participant RAGService as RAGService
    participant DocParser as DocumentService (PyMuPDF)
    participant Chunker as ChunkingService
    participant Embedder as EmbeddingService (all-MiniLM-L6-v2)
    participant Chroma as ChromaDB Persistent
    participant SQLite as app_data.db

    User->>Frontend: Uploads PDF / DOCX / MD
    Frontend->>Route: POST /api/rag/documents (multipart)
    Route->>RAGService: ingest_document(file)
    RAGService->>DocParser: extract_text_and_pages()
    DocParser-->>RAGService: Extracted text + page indices
    RAGService->>Chunker: chunk_text(size=500, overlap=100)
    Chunker-->>RAGService: [Text chunks with sentence boundaries]
    RAGService->>Embedder: generate_embeddings([chunks])
    Embedder-->>RAGService: [384-dimensional dense vectors]
    RAGService->>Chroma: upsert(collection="local_slm_rag", ids, vectors, metadata)
    RAGService->>SQLite: INSERT INTO documents & document_chunks
    Route-->>Frontend: {document_id, chunk_count, status: "indexed"}
```

---

## 3. Subsystem 3: Controlled Database Assistant & Two-Phase Mutation

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Frontend as Frontend (DBPage)
    participant Route as FastAPI (/database)
    participant DBAssistant as DatabaseAssistantService
    participant Ollama as Ollama API (JSON Mode)
    participant Validator as OperationValidator
    participant DemoRepo as DemoRepository
    participant DemoDB as demo_ecommerce.db
    participant AppDB as app_data.db

    User->>Frontend: "Update stock for product 1 to 25"
    Frontend->>Route: POST /api/database/interpret
    Route->>DBAssistant: interpret_prompt(prompt, model)
    DBAssistant->>Ollama: chat_completion(json_format=True)
    Ollama-->>DBAssistant: {"operation_type": "UPDATE", "target_entity": "products", "filters": {"id": 1}, "data": {"stock": 25}}
    DBAssistant->>Validator: validate_proposal(proposal)
    Validator-->>DBAssistant: (is_safe=True, requires_confirm=True)
    DBAssistant->>DemoRepo: preview_affected_records()
    DemoRepo->>DemoDB: SELECT * FROM products WHERE id=1
    DemoDB-->>DemoRepo: [Product #1 snapshot]
    DBAssistant->>Validator: issue_confirmation(proposal, preview)
    Validator-->>DBAssistant: confirmation_token (UUID, 5-min TTL)
    DBAssistant-->>Route: InterpretationResponse + Preview + Token
    Route-->>Frontend: Renders preview table & "Confirm Mutation" button

    User->>Frontend: Clicks "Confirm & Commit Mutation"
    Frontend->>Route: POST /api/database/confirm {confirmation_token}
    Route->>DBAssistant: confirm_and_execute(token)
    DBAssistant->>Validator: retrieve_and_consume_confirmation(token)
    Validator-->>DBAssistant: Valid proposal (consumed)
    DBAssistant->>DemoRepo: execute_update(proposal)
    DemoRepo->>DemoDB: Parameterized UPDATE products SET stock=:stock WHERE id=:id
    DemoDB-->>DemoRepo: 1 row updated
    DBAssistant->>AppDB: INSERT INTO database_assistant_logs
    Route-->>Frontend: ExecutionResult (affected_rows=1, updated_data)
```

---

## 4. Subsystem 4: Sequential Benchmark Engine

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Frontend as Frontend (BenchmarksPage)
    participant Route as FastAPI (/benchmarks/run)
    participant BenchService as BenchmarkService
    participant GPULock as _BENCHMARK_GPU_LOCK
    participant Evaluator as Deterministic Evaluators
    participant Ollama as Ollama API
    participant AppDB as app_data.db

    User->>Frontend: Triggers benchmark for [qwen2.5:3b, llama3.2:3b, qwen3:1.7b]
    Frontend->>Route: POST /api/benchmarks/run
    Route->>BenchService: create_run()
    BenchService->>AppDB: INSERT INTO benchmark_runs (status="running")
    Route-->>Frontend: {run_id, status: "running"}

    Note over BenchService,GPULock: Enters Asynchronous GPU Mutex Lock
    BenchService->>GPULock: acquire()
    loop Model by Model (Sequential Execution)
        Note over BenchService: Evaluate Model i
        loop Tasks in Suites (Chat, RAG, DB)
            BenchService->>Ollama: Run inference & record latency/TPS
            Ollama-->>BenchService: Raw output
            BenchService->>Evaluator: evaluate(task, output)
            Evaluator-->>BenchService: Score (0.0 - 1.0) + sub-metrics
            BenchService->>AppDB: INSERT INTO benchmark_results
        end
    end
    BenchService->>AppDB: UPDATE benchmark_runs SET status="completed", summary_json=...
    BenchService->>GPULock: release()
    Frontend->>Route: GET /api/benchmarks/summary
    Route-->>Frontend: Aggregated comparative charts and metrics
```
