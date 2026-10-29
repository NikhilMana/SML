# Local SLM Laboratory: Testing & Verification Guide

This guide details how to execute unit, integration, and evaluation test suites across the backend and frontend.

---

## 1. Prerequisites
- **Python Environment:** Python 3.10+ virtual environment activated (`backend/.venv`).
- **Node.js Environment:** Node 18+ with frontend dependencies installed (`frontend/node_modules`).
- **Ollama Daemon:** Running locally (`http://127.0.0.1:11434`) with at least one model pulled (`ollama pull qwen2.5:3b`).

---

## 2. Backend Automated Testing with Pytest

The backend test suite is powered by `pytest` with `pytest-asyncio` and `TestClient` (Starlette/FastAPI).

### 2.1 Run the Full Test Suite
From the `backend/` directory:
```powershell
& "c:\Coding\tai technology\SML\backend\.venv\Scripts\pytest"
```
Or if virtual environment is active:
```powershell
pytest -v
```

### 2.2 Run Specific Test Suites
```powershell
# Application 1: Chatbot & Multi-Turn History
pytest tests/test_chat.py -v

# Application 2: Document RAG & ChromaDB Vector Ingestion
pytest tests/test_rag.py -v

# Application 3: Natural-Language Database Assistant & Safety Guardrails
pytest tests/test_database_assistant.py -v

# Application 4: Unified Benchmark Engine & Datasets
pytest tests/test_benchmarks.py -v

# Core Infrastructure: Health, Telemetry, and Model Registry
pytest tests/test_health.py tests/test_model_registry.py tests/test_ollama_service.py -v
```

### 2.3 Current Backend Test Inventory (25 Passing Tests)
- `tests/test_health.py`: Health endpoint status, database connectivity verification, hardware telemetry format.
- `tests/test_model_registry.py`: Registry loading, model metadata validation, actual parameter disclosure checks, default model assignment.
- `tests/test_ollama_service.py`: Service connectivity detection, fallback handling.
- `tests/test_chat.py`: Multi-turn conversation lifecycle, SQLite persistence, history truncation.
- `tests/test_rag.py`: Semantic chunking boundaries, document ingestion validation, ChromaDB similarity retrieval, grounded Q&A formatting.
- `tests/test_database_assistant.py`: Allowlisted entity and column enforcement, empty-filter destructive mutation rejection, two-phase confirmation token lifecycle, parameterized SQLAlchemy CRUD operations.
- `tests/test_benchmarks.py`: Standardized dataset integrity, empty-model request rejection, runs listing, RFC-4180 CSV export.

---

## 3. Frontend Build Verification & Type Checking

The frontend is built using Vite, React 18, and TypeScript in strict mode.

### 3.1 Type Checking & Production Build
From the `frontend/` directory:
```powershell
npm run build
```
This runs `tsc` (TypeScript compiler in strict mode) followed by `vite build`. It must complete with **0 errors**.

### 3.2 Running the Development Server
```powershell
npm run dev
```
Accessible at: `http://localhost:5173`.

---

## 4. End-to-End Live Verification Checklist

1. **Model Synchronization:** Navigate to the top navigation header. Verify that active model shows `qwen2.5:3b`, parameters show `~3.09B`, and GPU VRAM telemetry updates dynamically.
2. **Chatbot Streaming:** Open `/chat`. Send a message. Verify that tokens stream smoothly, markdown code blocks highlight, and telemetry pills (Latency, TTFT, TPS) display after completion.
3. **RAG Pipeline Ingestion:** Open `/rag`. Ingest a sample markdown or text document. Search for a keyword. Verify that chunks return with similarity scores and page numbers.
4. **Database Assistant Mutation:** Open `/database`. Enter `"Show all customers in Bengaluru"`. Verify that safe SELECT executes immediately. Enter `"Update stock of product 1 to 25"`. Verify that the two-phase confirmation modal appears with a preview table before commit.
5. **Benchmark Execution:** Open `/benchmarks`. Launch a benchmark run. Verify that progress updates, GPU lock prevents concurrent runs, and charts render upon completion.
