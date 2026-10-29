# Architecture Decision Records (ADRs)

## ADR-001: System Architecture, Shared Model Service, and Resource Governance

- **Date:** 2026-10-18
- **Status:** Accepted
- **Context:**
  The goal is to build *Local SLM Laboratory*, an educational, production-grade benchmarking platform evaluating three Small Language Models (`qwen2.5:3b`, `llama3.2:3b`, `qwen3:1.7b`) across three domains: Chatbot, Document RAG, and Safe NL-to-CRUD. The target execution environment is a Windows laptop with an NVIDIA RTX 4050 GPU (6 GB VRAM) and 16 GB system RAM.
- **Decision:**
  1. **Unified Shared Model Service:** Rather than building three disjoint applications with siloed model clients, all applications communicate with a centralized `ModelRegistry` and `OllamaService`.
  2. **Sequential Inference Policy:** Due to the 6GB VRAM constraint, concurrent loading of multiple 3B models risks CUDA out-of-memory errors and erratic OS paging. Models are evaluated sequentially, with explicit timeouts and unloaded resources.
  3. **Strict Scientific Disclosure for Qwen 2.5 3B:** Marketed as 3B, Qwen 2.5 3B has ~3.09B parameters. This is explicitly noted across the registry, UI, and documentation. If a project requires a strict <= 3.00B limit, the model registry configuration allows substituting it.
  4. **Controlled NL-to-CRUD Architecture:** Instead of allowing models to generate and execute arbitrary raw SQL, the model produces a validated structured operation proposal. Trusted backend code inspects allowlists, parameters, and requires explicit confirmation for destructive operations (`UPDATE`, `DELETE`).
- **Consequences:**
  Prevents memory thrashing, eliminates hallucinated SQL injections, ensures fair comparative benchmarking, and provides a clean educational codebase for learning full-stack AI development.
- **Verification:**
  Automated tests in `backend/tests/test_model_registry.py` and `backend/tests/test_health.py` verify that all three models, parameter disclosures, and availability mappings operate deterministically.

---

## ADR-002: Multi-Turn Conversation Persistence and SSE Streaming Architecture

- **Date:** 2026-10-20
- **Status:** Accepted
- **Context:**
  Application One requires interactive, multi-turn chat capabilities with persistent storage, model switching per conversation, latency tracking, time-to-first-token (TTFT) measurement, tokens-per-second calculation, and Markdown rendering with code blocks.
- **Decision:**
  1. **Dual Persistence Layer via SQLAlchemy:** Conversations and individual message turns are persistently stored in SQLite (`storage/app_data.db`). Each assistant turn persists exact runtime telemetry: `latency_ms`, `ttft_ms`, `tokens_per_second`, `input_tokens`, and `output_tokens`.
  2. **Server-Sent Events (SSE) Streaming:** FastAPI's `StreamingResponse` serves `text/event-stream` chunks from Ollama's HTTP streaming API. Events include `ttft` on the first token, incremental `token` events, `done` upon completion, and a final `saved` event once the database transaction commits.
  3. **Client-Side Abort Support:** Frontend streaming uses browser `Fetch` with `ReadableStream` and `AbortController`, enabling the user to immediately cancel ongoing generation without leaving orphan streaming locks.
  4. **Deterministic Evaluation Suite:** The chatbot benchmark dataset (`chatbot_benchmarks.json`) uses 8 distinct task categories evaluated by `ChatEvaluator` using deterministic syntactic, schema, and functional checks (e.g. running Python unit tests against model-generated code in isolated namespaces, verifying schema keys, detecting false premise refutations).
- **Consequences:**
  Eliminates subjective evaluator bias, guarantees conversation state persists across restarts, and provides real-time streaming feedback without blocking other requests.
- **Verification:**
  Verified via automated test suite in `backend/tests/test_chat.py` (CRUD, simulated turn, and deterministic rubric tests) and live local model inference using `qwen3:1.7b` on NVIDIA RTX 4050 GPU (81.3 tokens/second).

---

## ADR-003: Local RAG Pipeline Architecture with Sentence-Transformers and Persistent ChromaDB

- **Date:** 2026-10-20
- **Status:** Accepted
- **Context:**
  Application Two requires multi-format document ingestion (PDF, DOCX, TXT, MD), semantic chunking, local vector embeddings, persistent storage, and grounded answering with mandatory citations and explicit abstention.
- **Decision:**
  1. **Local PyMuPDF and python-docx Extraction:** Native text and page number extraction with 25MB file limits and path traversal validation.
  2. **Boundary-Aware Chunking:** Sentences are preserved using regex sentence delimiters with configurable size (500 chars) and overlap (100 chars).
  3. **Local Embedding Engine:** `all-MiniLM-L6-v2` runs on device, generating 384-dimensional normalized dense vectors.
  4. **Persistent ChromaDB:** Stored at `storage/chromadb/` with cosine similarity retrieval.
  5. **Mandatory Citations & Explicit Abstention:** The model prompt enforces citing sources `[Document: ..., Page: ...]` and mandates outputting `"INSUFFICIENT EVIDENCE"` when context lacks the answer.
- **Consequences:**
  Zero cloud dependencies, zero paid API keys, fast cosine retrieval (<10ms), and strong resistance to hallucinations.
- **Verification:**
  Automated tests in `backend/tests/test_rag.py` passing 100%.

---

## ADR-004: Controlled Natural-Language Database Assistant with Two-Phase Confirmation

- **Date:** 2026-10-20
- **Status:** Accepted
- **Context:**
  Application Three connects Small Language Models to a relational database. Direct execution of raw SQL strings emitted by models creates critical SQL injection, syntax failure, and accidental data destruction risks.
- **Decision:**
  1. **Dual Database Engine Isolation:** Metadata lives in `app_data.db`, while the eCommerce assistant operates exclusively on an isolated `demo_ecommerce.db`.
  2. **Structured Planning via Pydantic:** The model is constrained via JSON schema to produce a `CRUDOperationProposal` object rather than raw SQL text.
  3. **Strict Allowlist & Safety Policies:** Only allowlisted tables (`customers`, `products`, `orders`) and columns are accepted. Bulk `UPDATE` or `DELETE` without targeted filters are rejected outright.
  4. **Two-Phase Confirmation Protocol:** Destructive mutations issue a server-side UUID token with 5-minute TTL and preview affected records. The mutation is only executed when the user confirms with this token.
  5. **Zero Raw SQL Execution:** Operations are executed using parameterized SQLAlchemy 2.0 ORM statements.
- **Consequences:**
  Complete mitigation of SQL injection and accidental bulk deletion, full audit trail in `database_assistant_logs`, and production-grade safety.
- **Verification:**
  Automated tests in `backend/tests/test_database_assistant.py` passing 100%.

---

## ADR-005: Unified Sequential Benchmark Engine with Mutex Arbitration

- **Date:** 2026-10-20
- **Status:** Accepted
- **Context:**
  The laboratory requires rigorous, fair, empirical benchmarking across all three models and all three applications under identical consumer hardware constraints (RTX 4050 6GB VRAM).
- **Decision:**
  1. **Asyncio Mutex Lock (`_BENCHMARK_GPU_LOCK`):** Guarantees strict sequential execution of models during benchmark runs to prevent CUDA OOM errors.
  2. **Standardized Version-Controlled Datasets:** Fixed JSON test suites for Chatbot (8 tasks), RAG (4 tasks), and Database (8 tasks).
  3. **Deterministic Programmatic Evaluators:** Replaces LLM-as-a-judge with deterministic code execution tests, schema validation, and citation matching.
  4. **Multi-Dimensional Telemetry:** Captures End-to-End Latency, TTFT, Generation TPS, Input/Output Tokens, and Peak VRAM.
  5. **Open Export Standards:** Full run results exported as RFC-4180 CSV and JSON.
- **Consequences:**
  Zero evaluator hallucination, completely reproducible benchmarks, and clean comparative Recharts dashboards.
- **Verification:**
  Automated tests in `backend/tests/test_benchmarks.py` passing 100%.

---

## ADR-006: Benchmark Evaluator Resilience, Semantic Concept Clusters, and Proposal Sanitization

- **Date:** 2026-10-21
- **Status:** Accepted
- **Context:**
  Analysis of initial full-suite benchmark runs revealed several false-negative failures caused by brittle evaluation rules and rigid schema expectations rather than genuine model incapacity:
  1. Valid CRUD update logic emitted by Llama 3.2 3B failed Pydantic validation because `explanation` was strictly mandatory instead of defaulted.
  2. SQL convention of passing `limit: -1` (unlimited) emitted by Qwen 2.5 3B crashed Pydantic integer bounds (`ge=1`).
  3. Llama 3.2 3B emitted `{"id": null}` on a bulk delete instruction, which bypassed `bool(proposal.filters)` because the dictionary was non-empty.
  4. Llama 3.2 3B accurately refuted the Mars mission premise with "There was no Apollo-Ares mission in 2018...", but received 0% due to an overly rigid string list.
  5. Correct conceptual explanations of autoregressive vs. encoder attention mechanisms received 0% when models used equivalent technical phrasing without the exact word "causal".
  6. In RAG evaluation, a model providing accurate facts and citations that appended a cautious disclaimer received a composite score of 1.0 while having `is_success: false`.
- **Decision:**
  1. **Schema Resilience:** In `CRUDOperationProposal`, `explanation` is defaulted (`"No explanation provided"`), and `limit` is sanitized before validation (clamping `<= 0` or invalid values to `10`, and capping at `50`).
  2. **Filter Security Enforcement:** `OperationValidator` checks for meaningful filter values (`any(v is not None and v != "" for v in proposal.filters.values())`), ensuring `{ "id": null }` is properly rejected as an unsafe bulk mutation.
  3. **Entity Alias Resolution:** Normalize common entity aliases (such as `product_id` -> `id` on the `products` table) automatically.
  4. **Semantic Concept Clusters:** `ChatEvaluator` uses synonym clusters for technical definitions (e.g. `causal` matches `autoregressive`, `sequential`, `one token at a time`, `previous tokens`) and expands refutation markers to accept natural language negations.
  5. **Consistent Metric Alignment:** `RAGEvaluator` mathematically aligns `is_success` with `score >= 0.70`, applying a balanced penalty for cautious disclaimers on in-domain questions without creating logical contradictions.
- **Consequences:**
  Eliminates false negatives, hardens safety validation against null-value bypasses, prevents brittle schema rejections, and produces fair, accurate model benchmarks.
- **Verification:**
  Automated unit and integration test suite passing with 26/26 tests (`pytest backend/tests -v`).

