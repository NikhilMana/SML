# Local SLM Laboratory: Code Map & Navigation Guide

This document maps all directories and key files across the repository to help developers and reviewers navigate the codebase efficiently.

---

## 1. Repository Overview

```
SML/
├── backend/                  # FastAPI 0.115+ Python backend
│   ├── app/
│   │   ├── api/              # REST routes and Pydantic schemas
│   │   ├── core/             # Configuration, logging, and exceptions
│   │   ├── db/               # SQLAlchemy models, sessions, and repositories
│   │   ├── evaluation/       # Standardized datasets and deterministic evaluators
│   │   └── services/         # Core business logic and hardware managers
│   └── tests/                # Automated pytest unit and integration tests
├── frontend/                 # React 18, TypeScript, Tailwind CSS, Recharts
│   └── src/
│       ├── components/       # Layout, status bars, and UI widgets
│       ├── pages/            # 4 primary application views
│       ├── services/         # Centralized HTTP API clients
│       └── types/            # Shared TypeScript interfaces
├── docs/                     # Architectural, benchmark, and educational documentation
└── README.md                 # Primary project overview and quickstart
```

---

## 2. Backend Code Inventory

### 2.1 Core & Infrastructure (`backend/app/core/`)
- `config.py`: Centralized environment settings (`pydantic-settings`), directory creation, database paths, and model defaults.
- `logging.py`: Structured console and file logging.
- `exceptions.py`: Custom application exceptions (`SLMLabException`, `ModelNotFoundException`, `UnsafeDatabaseOperationException`) and global FastAPI error handlers.

### 2.2 Database & Storage Layer (`backend/app/db/`)
- `session.py`: Dual database engine setup (`app_engine` for metadata, `demo_engine` for eCommerce CRUD). Lifespan database initializers and FastAPI dependency providers (`get_app_db`, `get_demo_db`).
- `models.py`: SQLAlchemy 2.0 ORM models:
  - `Conversation`, `ChatMessage`: Chatbot history persistence.
  - `Document`, `DocumentChunk`: RAG document library and Chroma chunk references.
  - `BenchmarkRun`, `BenchmarkResult`: Benchmark tracking and task evaluations.
  - `DatabaseAssistantLog`: Audit trail for natural-language database actions.
  - `DemoCustomer`, `DemoProduct`, `DemoOrder`: Isolated synthetic eCommerce tables.
- `seed.py`: Synthetic database seeder populating customers, products, and orders.
- `repositories/`:
  - `chat_repository.py`: Multi-turn chat persistence and history assembly.
  - `document_repository.py`: Document ingestion and chunk metadata storage.
  - `demo_repository.py`: Parameterized SQLAlchemy query builder for safe SELECT, INSERT, UPDATE, and DELETE.

### 2.3 Business Logic Services (`backend/app/services/`)
- `ollama_service.py`: Async HTTP client for Ollama API (`/api/chat`, streaming, connection checks).
- `model_registry.py`: Model specifications, parameter disclosures, and tag synchronization.
- `resource_monitor.py`: Real-time RAM (`psutil`) and NVIDIA GPU VRAM (`nvidia-smi` / `pynvml`) telemetry.
- `chunking_service.py`: Boundary-preserving text chunker with configurable character overlap.
- `embedding_service.py`: Local `sentence-transformers` embedding engine (`all-MiniLM-L6-v2`, 384-dim).
- `retrieval_service.py`: Persistent ChromaDB vector collection manager.
- `rag_service.py`: RAG coordinator for ingestion, similarity retrieval, and grounded Q&A.
- `operation_validator.py`: Table/column allowlist enforcement, destructive mutation protection, and two-phase confirmation token manager.
- `database_assistant_service.py`: Model prompt engineering, JSON validation, and safe CRUD execution.
- `benchmark_service.py`: Sequential benchmark engine, GPU lock, telemetry gathering, and CSV export.

### 2.4 API Routes (`backend/app/api/routes/`)
- `health.py`: `/api/health` and `/api/health/telemetry`.
- `models.py`: `/api/models` and active model switcher.
- `chat.py`: `/api/chat/conversations`, `/messages`, and `/stream`.
- `rag.py`: `/api/rag/documents`, `/search`, and `/query`.
- `database_assistant.py`: `/api/database/schema`, `/interpret`, `/execute`, `/confirm`, `/reset-demo`.
- `benchmarks.py`: `/api/benchmarks/run`, `/runs`, `/summary`, and `/export`.

### 2.5 Evaluation Framework (`backend/app/evaluation/`)
- `datasets/`: Standardized JSON test suites:
  - `chatbot_benchmarks.json`
  - `rag_benchmarks.json`
  - `database_benchmarks.json`
- `evaluators/`: Programmatic deterministic evaluators:
  - `chat_evaluator.py`: Code execution testing, JSON verification, premise checks.
  - `rag_evaluator.py`: Recall@k, citation adherence, factual keyword scoring, abstention adherence.
  - `database_evaluator.py`: Schema matching, confirmation adherence, safety violation blocks.

---

## 3. Frontend Code Inventory

### 3.1 Primary Pages (`frontend/src/pages/`)
- `ChatPage.tsx`: Interactive multi-turn conversational chatbot with model selector, temperature slider, markdown rendering, token streaming, and latency/TTFT telemetry.
- `RAGPage.tsx`: Document library manager, drag-and-drop ingestion, semantic search inspector, chunk modal, and grounded Q&A with citation badges.
- `DatabaseAssistantPage.tsx`: Natural-language CRUD workbench, schema explorer, parameter disclosure badges, safety guardrail alerts, two-phase confirmation modal, and audit logs.
- `BenchmarksPage.tsx`: Comparative Recharts dashboard (grouped accuracy bar charts, throughput curves, latency comparisons), sequential run modal, live progress tracker, and JSON/CSV export.

### 3.2 Layout & Specialized Components (`frontend/src/components/`)
- `layout/Header.tsx`: Navigation bar, real-time GPU VRAM telemetry badge, and quick model switcher.
- `layout/ModelStatusBanner.tsx`: Parameter disclosure alert and Ollama connection status banner.
- `benchmarks/BenchmarkAnalysisModal.tsx`: Comprehensive analytical modal with Executive Scorecards, KPIs, Recharts visualizations, automated failure anomaly diagnostics, side-by-side grouped task matrix, and in-app raw JSON inspector.

### 3.3 API Services (`frontend/src/services/`)
- `api.ts`: Centralized fetch wrapper with JSON headers, error handling, and timeout support.
- `chat.ts`: Chatbot endpoints and Server-Sent Events stream consumer.
- `rag.ts`: Document upload, vector search, and grounded Q&A calls.
- `database.ts`: Schema explorer, instruction interpretation, safe execution, and confirmation tokens.
- `benchmarks.ts`: Benchmark runs, summaries, and export download URLs.
