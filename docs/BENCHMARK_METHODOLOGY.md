# Local SLM Laboratory: Benchmark Methodology & Evaluation Framework

## 1. Objective & Philosophy
The **Local SLM Laboratory** benchmark framework evaluates Small Language Models (SLMs) on consumer laptop hardware (NVIDIA GeForce RTX 4050 6GB VRAM) under identical runtime conditions.

Rather than relying on nondeterministic LLM-as-a-judge or synthetic perplexity scores, our evaluation engine uses **deterministic programmatic verification**, fixed version-controlled JSON datasets, and real-time hardware telemetry.

---

## 2. Models Under Evaluation & Parameter Disclosures

Marketing tags commonly round parameter counts. In the laboratory, actual published parameter counts are disclosed and tracked:

| Model Tag | Commercial Name | Actual Parameter Count | Precision / Quantization | Native Context Window | Primary Focus |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`qwen2.5:3b`** | Qwen 2.5 3B Instruct | **~3.09 Billion** | Q4_K_M / FP16 | 32,768 tokens | Multilingual, coding, structured JSON planning |
| **`llama3.2:3b`** | Llama 3.2 3B Instruct | **~3.21 Billion** | Q4_K_M / FP16 | 131,072 tokens | Long-context instruction adherence |
| **`qwen3:1.7b`** | Qwen3 1.7B | **~1.70 Billion** | Q4_K_M / FP16 | 32,768 tokens | Ultra-compact, high tokens-per-second throughput |

---

## 3. Hardware Protection Policy: Strict Sequential Execution

### 3.1 The 6GB VRAM Constraint
Consumer laptop GPUs have 6GB of unified GDDR6 memory. Loading two 3B models simultaneously into VRAM triggers Out-Of-Memory (OOM) allocation failures.

### 3.2 Architectural Guardrail
The benchmark engine implements an asynchronous mutex lock (`_BENCHMARK_GPU_LOCK = asyncio.Lock()`). Models are evaluated strictly sequentially:
1. `Model A` loads into VRAM, executes its test cases, and unloads.
2. An explicit GPU synchronization pause occurs.
3. `Model B` loads and executes.

Concurrent benchmark requests queue safely rather than crashing the graphics pipeline.

---

## 4. Standardized Benchmark Suites

### Suite 1: Chatbot Capabilities (`chatbot_benchmarks.json`)
Consists of 8 standardized tasks spanning core LLM reasoning domains:
1. **Multi-Turn Context Recall:** Validates retrieval of facts established in preceding conversation turns.
2. **Code Generation:** Evaluates Python function generation. Programmatic evaluator executes code against test assertions in an isolated namespace.
3. **Math & Step-by-Step Reasoning:** Tests arithmetic and multi-step word problems.
4. **Instruction Following:** Enforces constraints (e.g. "Answer in exactly 3 bullet points with under 15 words each").
5. **Roleplay & Persona:** Tests tone consistency and character persona preservation.
6. **Fact Summarization:** Tests concise compression without omitting key details.
7. **Premise Refutation:** Tests resistance to false factual premises (e.g. "What happened when the Apollo 11 moon landing was cancelled?").
8. **JSON Formatting:** Validates adherence to exact JSON schemas without markdown code fences.

### Suite 2: Document RAG Quality (`rag_benchmarks.json`)
Evaluates retrieval accuracy and grounded answer generation against an indexed technical specification:
1. **Recall@k:** Verifies whether the ground-truth document passage is present in the top-k retrieved vectors.
2. **Citation Precision:** Inspects generated answers for explicit citations matching `[Document: ..., Page: ...]`.
3. **Factual Groundedness:** Verifies required technical keywords against the ground truth.
4. **Explicit Abstention:** Presents out-of-domain unanswerable queries to test whether the model correctly outputs `"INSUFFICIENT EVIDENCE"` rather than hallucinating.

### Suite 3: Natural-Language Database CRUD (`database_benchmarks.json`)
Tests safe translation of natural language into structured operations on the isolated eCommerce schema:
1. **SELECT Filtering:** Tests simple and compound equality filters (`city = 'Bengaluru'`).
2. **Numeric Comparison:** Tests range queries (`price >= 200`).
3. **Sorting & Limit:** Tests order-by clauses and row limit caps (`price_desc, limit=3`).
4. **INSERT Generation:** Tests payload formation with required fields.
5. **Destructive Mutation Confirmation:** Tests whether `UPDATE` and `DELETE` trigger the two-phase confirmation protocol.
6. **Safety Violation Rejection:** Tests whether bulk deletions without filters (`DELETE customers with empty filters`) or queries against unallowlisted entities are strictly rejected by security policy.

---

## 5. Metrics & Scoring Rubrics

### 5.1 Programmatic Scoring
- **Task Score ($S$):** Normalized from $0.0$ (complete failure) to $1.0$ (perfect adherence).
- **Overall Score:** Weighted average of task scores expressed as a percentage ($0 - 100\%$).
- **Success Rate:** Percentage of tasks meeting or exceeding an $0.80$ passing threshold.

### 5.2 Performance & Telemetry Metrics
- **End-to-End Latency ($ms$):** Total elapsed wall-clock time from request dispatch to final token receipt.
- **Time to First Token (TTFT, $ms$):** Latency until the initial response token is emitted by the model.
- **Throughput (Tokens/sec):** Generation speed calculated as $\frac{\text{Completion Tokens}}{\text{Generation Time (seconds)}}$.
- **Peak VRAM ($MB$):** Maximum GPU memory allocated during the inference burst (queried via `pynvml` / `nvidia-smi`).
