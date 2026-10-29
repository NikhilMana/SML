# Local SLM Laboratory: Complete REST API Guide

Base URL: `http://localhost:8000/api`

---

## 1. System Health & Hardware Telemetry

### 1.1 Health Check
- **Endpoint:** `GET /health`
- **Description:** Verifies service availability, Ollama status, and database initialization.
- **Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "app_database": "connected",
  "demo_database": "connected",
  "ollama_connected": true,
  "ollama_version": "0.18.2"
}
```

### 1.2 System & GPU Telemetry
- **Endpoint:** `GET /health/telemetry`
- **Description:** Real-time RAM and NVIDIA GPU VRAM metrics.
- **Response:**
```json
{
  "system": {
    "ram_total_mb": 16384,
    "ram_used_mb": 8420,
    "ram_percent": 51.4,
    "cpu_percent": 12.3
  },
  "gpu": {
    "gpu_available": true,
    "device_name": "NVIDIA GeForce RTX 4050 Laptop GPU",
    "vram_total_mb": 6144,
    "vram_used_mb": 2450,
    "vram_percent": 39.8,
    "temperature_c": 56
  }
}
```

---

## 2. Model Registry

### 2.1 List Registered Models
- **Endpoint:** `GET /models`
- **Description:** Returns the 3 registered Small Language Models with published parameter counts and local availability.
- **Response:**
```json
{
  "models": [
    {
      "tag": "qwen2.5:3b",
      "display_name": "Qwen 2.5 3B Instruct",
      "parameter_count": "3B",
      "published_parameters": "~3.09B",
      "architecture_note": "36 layers, 16 GQA heads, 32k context",
      "context_window": 32768,
      "recommended_temperature": 0.3,
      "capabilities": ["General Chat", "Code", "RAG Grounded Q&A", "Structured DB CRUD"],
      "is_available_locally": true
    },
    {
      "tag": "llama3.2:3b",
      "display_name": "Llama 3.2 3B Instruct",
      "parameter_count": "3B",
      "published_parameters": "~3.21B",
      "context_window": 131072,
      "is_available_locally": true
    },
    {
      "tag": "qwen3:1.7b",
      "display_name": "Qwen3 1.7B",
      "parameter_count": "1.7B",
      "published_parameters": "~1.70B",
      "is_available_locally": true
    }
  ],
  "default_model": "qwen2.5:3b",
  "ollama_running": true
}
```

---

## 3. Application 1: Conversational Chatbot

### 3.1 List Conversations
- **Endpoint:** `GET /chat/conversations`
- **Response:** List of persistent conversation sessions stored in SQLite.

### 3.2 Create Conversation
- **Endpoint:** `POST /chat/conversations`
- **Body:**
```json
{
  "title": "Python Architecture Discussion",
  "model_tag": "qwen2.5:3b"
}
```

### 3.3 Send Message (Synchronous)
- **Endpoint:** `POST /chat/messages`
- **Body:**
```json
{
  "conversation_id": "550e8400-e29b-41d4-a716-446655440000",
  "content": "Explain grouped query attention.",
  "model_tag": "qwen2.5:3b",
  "temperature": 0.3
}
```

### 3.4 Stream Message (Server-Sent Events)
- **Endpoint:** `POST /chat/stream`
- **Body:** Same as `/chat/messages`
- **Response Format:** `text/event-stream` returning incremental token chunks:
```text
data: {"token": "Grouped", "is_final": false}
data: {"token": " Query", "is_final": false}
data: {"token": " Attention...", "is_final": false}
data: [DONE]
```

---

## 4. Application 2: Document RAG Pipeline

### 4.1 Ingest Document
- **Endpoint:** `POST /rag/documents`
- **Format:** `multipart/form-data` with `file` (PDF, DOCX, TXT, MD up to 25MB).
- **Response:**
```json
{
  "id": "doc-uuid",
  "filename": "slm_technical_specifications.md",
  "file_size_bytes": 4594,
  "file_type": "md",
  "status": "indexed",
  "chunk_count": 8
}
```

### 4.2 Semantic Vector Search
- **Endpoint:** `POST /rag/search`
- **Body:**
```json
{
  "query": "What is the exact parameter count of Qwen 2.5 3B?",
  "top_k": 3
}
```
- **Response:** Matching chunks with cosine similarity relevance scores.

### 4.3 Grounded Q&A Query
- **Endpoint:** `POST /rag/query`
- **Body:**
```json
{
  "query": "What is the parameter count of Qwen 2.5 3B?",
  "model_tag": "qwen2.5:3b",
  "top_k": 3,
  "temperature": 0.1
}
```
- **Response:** Grounded answer with citations (`[Document: ..., Page: ...]`) or explicit abstention.

---

## 5. Application 3: Natural-Language Database Assistant

### 5.1 Inspect Database Schema
- **Endpoint:** `GET /database/schema`
- **Description:** Returns table schemas, column types, primary keys, nullability, row counts, and sample records from `demo_ecommerce.db`.

### 5.2 Interpret Natural-Language Instruction
- **Endpoint:** `POST /database/interpret`
- **Body:**
```json
{
  "prompt": "Update the stock of product with ID 1 to 25 items",
  "model_tag": "qwen2.5:3b"
}
```
- **Response:**
```json
{
  "user_prompt": "Update the stock of product with ID 1 to 25 items",
  "model_tag": "qwen2.5:3b",
  "proposal": {
    "operation_type": "UPDATE",
    "target_entity": "products",
    "filters": {"id": 1},
    "data": {"stock": 25},
    "explanation": "Update stock for product 1"
  },
  "is_valid": true,
  "safety_check_passed": true,
  "requires_confirmation": true,
  "confirmation_id": "069b12be-0fc1-460c-8ef8-e047ceb7dc87",
  "affected_records_preview": [
    {"id": 1, "name": "Quantum Pro Mechanical Keyboard", "stock": 45}
  ],
  "risk_assessment": "Destructive UPDATE operation requires explicit two-phase confirmation",
  "latency_ms": 320.4
}
```

### 5.3 Execute Safe Operation (SELECT, INSERT)
- **Endpoint:** `POST /database/execute`
- **Body:**
```json
{
  "proposal": { ... },
  "user_prompt": "Show customers in Bengaluru",
  "model_tag": "qwen2.5:3b"
}
```

### 5.4 Confirm Destructive Mutation (UPDATE, DELETE)
- **Endpoint:** `POST /database/confirm`
- **Body:**
```json
{
  "confirmation_id": "069b12be-0fc1-460c-8ef8-e047ceb7dc87"
}
```
- **Response:** Committed execution result with updated records and parameterized SQL description.

### 5.5 Reset Demo Database
- **Endpoint:** `POST /database/reset-demo`
- **Description:** Drops and re-populates the isolated eCommerce demo database back to default synthetic records.

---

## 6. Unified Benchmark Engine

### 6.1 Trigger Benchmark Run
- **Endpoint:** `POST /benchmarks/run`
- **Body:**
```json
{
  "model_tags": ["qwen2.5:3b", "llama3.2:3b", "qwen3:1.7b"],
  "suite_name": "all",
  "run_name": "Initial Baseline Evaluation"
}
```
- **Response:** `{"run_id": "...", "status": "running"}`

### 6.2 List Benchmark Runs
- **Endpoint:** `GET /benchmarks/runs?limit=20`

### 6.3 Get Run Details
- **Endpoint:** `GET /benchmarks/runs/{run_id}`
- **Response:** Full run telemetry, summary metrics, and task-by-task execution records.

### 6.4 Comparative Summary
- **Endpoint:** `GET /benchmarks/summary`
- **Response:** Cross-model summary of latest completed scores, throughput (tokens/sec), and latencies.

### 6.5 Export Benchmark Data
- **Endpoint:** `GET /benchmarks/export/{run_id}?format=json` or `?format=csv`
- **Response:** JSON payload or RFC-4180 compliant CSV attachment.
