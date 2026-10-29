# Local SLM Laboratory

An educational, production-grade benchmarking and experimentation platform for Small Language Models (SLMs). Compare and evaluate three candidate models across three real-world use cases:
1. **Conversational Chatbot** with streaming tokens, multi-turn history, and latency/throughput telemetry.
2. **Retrieval-Augmented Generation (RAG)** over PDF, DOCX, TXT, and Markdown files using local embeddings (`all-MiniLM-L6-v2`) and persistent ChromaDB with mandatory citation audits and explicit abstention.
3. **Natural-Language Database Assistant** performing controlled, parameterized CRUD operations on an isolated SQLite database with Pydantic validation and two-phase manual confirmation for destructive mutations.
4. **Unified Benchmark Engine & Dashboard** providing reproducible evaluations across standardized test suites with Recharts visualizations and RFC-4180 CSV / JSON exports.

---

## Candidate Models & Parameter Disclosures

Marketing tags commonly round parameter counts. In the laboratory, actual published parameter counts are explicitly disclosed:

| Model Tag | Commercial Label | Actual Published Parameters | Architecture Notes | Install Command |
| :--- | :--- | :--- | :--- | :--- |
| `qwen2.5:3b` | 3B Instruct | **~3.09 Billion** | Strong reasoning, structured JSON mode, instruction following | `ollama pull qwen2.5:3b` |
| `llama3.2:3b` | 3B Instruct | **~3.21 Billion** | Meta's lightweight model optimized for edge devices | `ollama pull llama3.2:3b` |
| `qwen3:1.7b` | 1.7B | **~1.70 Billion** | Ultra-compact sub-2B model for high throughput on laptops | `ollama pull qwen3:1.7b` |

> [!NOTE]
> **Scientific Accuracy Note:** Qwen2.5 3B is commercially marketed as a 3B model, although its published parameter count is ~3.09B. If an evaluation rule mandates a strict limit of 3.00B parameters, it can be replaced in `backend/app/services/model_registry.py`.

---

## Hardware Optimization (NVIDIA RTX 4050 6GB VRAM)
- **Sequential Execution Lock:** An asynchronous mutex lock (`_BENCHMARK_GPU_LOCK`) ensures models are evaluated one at a time, completely eliminating CUDA Out-of-Memory (OOM) crashes.
- **Genuine Hardware Telemetry:** Real-time RAM (`psutil`) and NVIDIA GPU VRAM (`nvidia-smi`) without fabricated figures.

---

## Technical Documentation Suite

The `docs/` folder provides comprehensive guides:

- **[Educational Learning Guide](docs/LEARNING_GUIDE.md):** Deep-dive technical mentoring guide covering Python typing, Pydantic V2, asyncio, FastAPI dependency injection, SQLAlchemy 2.0 dual databases, RAG embeddings, and safe database mutations.
- **[REST API Guide](docs/API_GUIDE.md):** Complete OpenAPI endpoint reference with request/response schemas for all routes.
- **[Benchmark Methodology](docs/BENCHMARK_METHODOLOGY.md):** Fixed test set definitions, scoring rubrics, hardware arbitration lock, and performance formulas.
- **[Testing & Verification Guide](docs/TESTING_GUIDE.md):** Instructions for running the 25 backend pytest cases and frontend TypeScript production build.
- **[Code Map](docs/CODE_MAP.md):** File inventory and navigation path across backend and frontend.
- **[Data Flow Architecture](docs/DATA_FLOW.md):** Mermaid sequence diagrams illustrating data movement for Chat, RAG, Database Assistant, and Benchmarks.
- **[Architectural Decisions (ADRs)](docs/DECISIONS.md):** Architectural decision records (ADR-001 through ADR-005).
- **[Execution Flow Guide](docs/FLOW.md):** Step-by-step tracing through the implemented runtime code.

---

## Quickstart (Windows / PowerShell)

### 1. Prerequisites
- **Python 3.10+**
- **Node.js v18+**
- **Ollama**: Download from [ollama.com](https://ollama.com) and ensure `ollama serve` is running.

### 2. Pull the Models
```powershell
ollama pull qwen2.5:3b
ollama pull llama3.2:3b
ollama pull qwen3:1.7b
```

### 3. Backend Setup
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Run all 25 automated tests
pytest tests -v

# Start FastAPI server
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
Interactive Swagger API docs: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

### 4. Frontend Setup
```powershell
cd frontend
npm install
npm run build    # Verify 0 TypeScript errors
npm run dev      # Start Vite dev server
```
Workbench UI: [http://localhost:5173](http://localhost:5173)

---

## Automated Verification

### Backend Pytest Suite (25 Tests Passing)
```powershell
& "backend\.venv\Scripts\pytest"
```
Includes:
- Health and hardware telemetry tests (`test_health.py`)
- Model registry and parameter disclosure tests (`test_model_registry.py`)
- Ollama service integration tests (`test_ollama_service.py`)
- Multi-turn chat persistence tests (`test_chat.py`)
- Semantic chunking & ChromaDB RAG tests (`test_rag.py`)
- Natural-language CRUD and safety guardrail tests (`test_database_assistant.py`)
- Benchmark dataset validation and CSV export tests (`test_benchmarks.py`)

### Frontend TypeScript Verification
```powershell
cd frontend
npm run build
```
Type checks all components with strict mode enabled and compiles production bundles with Vite.
