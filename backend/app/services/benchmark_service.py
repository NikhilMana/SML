"""Sequential benchmark execution engine comparing SLMs across Chat, RAG, and Database suites."""

import asyncio
import csv
import io
import json
import time
import uuid
import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import select, desc
from app.core.config import settings
from app.core.logging import logger
from app.db.models import BenchmarkRun, BenchmarkResult, Document
from app.db.session import AppSessionLocal, DemoSessionLocal
from app.services.ollama_service import ollama_service
from app.services.resource_monitor import resource_monitor
from app.services.rag_service import rag_service
from app.services.database_assistant_service import database_assistant_service
from app.evaluation.evaluators.chat_evaluator import ChatEvaluator
from app.evaluation.evaluators.rag_evaluator import RAGEvaluator
from app.evaluation.evaluators.database_evaluator import DatabaseEvaluator

# Strict sequential lock to guarantee only one model evaluates at a time on 6GB GPU
_BENCHMARK_GPU_LOCK = asyncio.Lock()


class BenchmarkService:
    """Orchestrates comprehensive, sequential benchmarking across registered models."""

    def __init__(self):
        self.datasets_dir = Path(__file__).resolve().parent.parent / "evaluation" / "datasets"

    def _load_dataset(self, filename: str) -> Dict[str, Any]:
        """Load benchmark suite dataset JSON file."""
        path = self.datasets_dir / filename
        if not path.exists():
            raise FileNotFoundError(f"Benchmark dataset not found: {path}")
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    async def _ensure_rag_benchmark_document(self, app_db: Session) -> str:
        """Ensure the standardized benchmark whitepaper is indexed in ChromaDB."""
        rag_data = self._load_dataset("rag_benchmarks.json")
        sample_kb = rag_data.get("sample_knowledge_base", [])
        if not sample_kb:
            return ""

        doc_spec = sample_kb[0]
        filename = doc_spec["filename"]
        content = doc_spec["content"]

        # Check if already indexed in app_db
        existing = app_db.scalar(select(Document).where(Document.filename == filename))
        if existing and existing.status == "indexed":
            return existing.id

        # Write to temporary file in upload dir and ingest
        bench_dir = Path(settings.DOCUMENTS_DIR).resolve()
        bench_dir.mkdir(parents=True, exist_ok=True)
        bench_file_path = bench_dir / filename
        with open(bench_file_path, "w", encoding="utf-8") as f:
            f.write(content)

        ingested = rag_service.ingest_document(
            db=app_db,
            filename=filename,
            content=content.encode("utf-8"),
        )
        return ingested["document_id"]

    async def create_run(
        self,
        app_db: Session,
        model_tags: List[str],
        suite_name: str = "all",
        run_name: Optional[str] = None,
    ) -> str:
        """Initialize and record a new benchmark run."""
        run_id = str(uuid.uuid4())
        name = run_name or f"Benchmark-{datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S')}"

        # Count total cases
        total_cases = 0
        suites_to_run = ["chat", "rag", "database"] if suite_name == "all" else [suite_name]

        if "chat" in suites_to_run:
            chat_data = self._load_dataset("chatbot_benchmarks.json")
            total_cases += len(chat_data.get("tasks", [])) * len(model_tags)
        if "rag" in suites_to_run:
            rag_data = self._load_dataset("rag_benchmarks.json")
            total_cases += len(rag_data.get("tasks", [])) * len(model_tags)
        if "database" in suites_to_run:
            db_data = self._load_dataset("database_benchmarks.json")
            total_cases += len(db_data.get("tasks", [])) * len(model_tags)

        run = BenchmarkRun(
            id=run_id,
            run_name=name,
            suite_name=suite_name,
            model_tags_json=json.dumps(model_tags),
            status="running",
            total_cases=total_cases,
            completed_cases=0,
            failed_cases=0,
            started_at=datetime.datetime.now(datetime.timezone.utc),
        )
        app_db.add(run)
        app_db.commit()

        # Launch async execution in background task
        asyncio.create_task(self._execute_benchmark_suite(run_id, model_tags, suites_to_run))
        return run_id

    async def _execute_benchmark_suite(
        self,
        run_id: str,
        model_tags: List[str],
        suites: List[str],
    ) -> None:
        """Run tasks sequentially across models inside the GPU lock."""
        async with _BENCHMARK_GPU_LOCK:
            logger.info(f"Acquired GPU benchmark lock for run {run_id}. Evaluating models sequentially.")
            app_db = AppSessionLocal()
            demo_db = DemoSessionLocal()

            try:
                # Ensure RAG benchmark document is indexed
                if "rag" in suites:
                    await self._ensure_rag_benchmark_document(app_db)

                for model_tag in model_tags:
                    logger.info(f"--- Starting benchmark evaluation for model: {model_tag} ---")

                    # 1. Chat Suite
                    if "chat" in suites:
                        chat_data = self._load_dataset("chatbot_benchmarks.json")
                        for task in chat_data.get("tasks", []):
                            await self._evaluate_chat_task(app_db, run_id, model_tag, task)

                    # 2. RAG Suite
                    if "rag" in suites:
                        rag_data = self._load_dataset("rag_benchmarks.json")
                        for task in rag_data.get("tasks", []):
                            await self._evaluate_rag_task(app_db, run_id, model_tag, task)

                    # 3. Database Suite
                    if "database" in suites:
                        db_data = self._load_dataset("database_benchmarks.json")
                        for task in db_data.get("tasks", []):
                            await self._evaluate_database_task(app_db, demo_db, run_id, model_tag, task)

                # Compute final run summary
                self._finalize_run(app_db, run_id)
                logger.info(f"Benchmark run {run_id} completed successfully.")

            except Exception as e:
                logger.error(f"Benchmark run {run_id} encountered fatal error: {e}", exc_info=True)
                run = app_db.scalar(select(BenchmarkRun).where(BenchmarkRun.id == run_id))
                if run:
                    run.status = "failed"
                    run.completed_at = datetime.datetime.now(datetime.timezone.utc)
                    app_db.commit()
            finally:
                app_db.close()
                demo_db.close()

    async def _evaluate_chat_task(
        self,
        app_db: Session,
        run_id: str,
        model_tag: str,
        task: Dict[str, Any],
    ) -> None:
        """Execute and grade a Chat benchmark task."""
        task_id = task["task_id"]
        prompt = task["prompt"]
        messages = [{"role": "user", "content": prompt}]
        sys_prompt = task.get("system_prompt")

        t0 = time.perf_counter()
        try:
            inference = await ollama_service.chat_completion(
                model=model_tag,
                messages=messages,
                temperature=0.1,
                system_prompt=sys_prompt,
            )
            raw_response = inference["content"]
            latency_ms = inference.get("latency_ms", round((time.perf_counter() - t0) * 1000, 2))
            tps = inference.get("tokens_per_second", 0.0)
            in_tokens = inference.get("prompt_tokens", 0)
            out_tokens = inference.get("completion_tokens", 0)

            # Grade output
            eval_result = ChatEvaluator.evaluate(task, raw_response)
            score = eval_result["score"]
            is_success = eval_result["is_success"]
            metrics = eval_result.get("metrics", {})
            err = None
        except Exception as e:
            raw_response = ""
            latency_ms = round((time.perf_counter() - t0) * 1000, 2)
            tps = 0.0
            in_tokens = 0
            out_tokens = 0
            score = 0.0
            is_success = False
            metrics = {}
            err = str(e)

        # Record result
        res = BenchmarkResult(
            id=str(uuid.uuid4()),
            run_id=run_id,
            model_tag=model_tag,
            application_type="chat",
            task_id=task_id,
            prompt=prompt,
            raw_response=raw_response,
            latency_ms=latency_ms,
            ttft_ms=latency_ms * 0.35 if latency_ms else None,  # Estimated TTFT for batch eval
            tokens_per_second=tps,
            input_tokens=in_tokens,
            output_tokens=out_tokens,
            is_success=is_success,
            score=score,
            metrics_json=json.dumps(metrics),
            error_message=err,
        )
        app_db.add(res)
        run = app_db.scalar(select(BenchmarkRun).where(BenchmarkRun.id == run_id))
        if run:
            run.completed_cases += 1
            if not is_success:
                run.failed_cases += 1
        app_db.commit()

    async def _evaluate_rag_task(
        self,
        app_db: Session,
        run_id: str,
        model_tag: str,
        task: Dict[str, Any],
    ) -> None:
        """Execute and grade a RAG benchmark task."""
        task_id = task["task_id"]
        question = task["question"]

        t0 = time.perf_counter()
        try:
            rag_out = await rag_service.answer_query(
                query=question,
                model_tag=model_tag,
                top_k=3,
                temperature=0.1,
            )
            raw_response = rag_out["answer"]
            latency_ms = rag_out.get("latency_ms") or round((time.perf_counter() - t0) * 1000, 2)
            tps = rag_out.get("tokens_per_second") or 0.0
            retrieved_passages = rag_out.get("retrieved_passages", [])

            # Grade output
            eval_result = RAGEvaluator.evaluate(task, raw_response, retrieved_passages)
            score = eval_result["score"]
            is_success = eval_result["is_success"]
            metrics = eval_result.get("metrics", {})
            err = None
        except Exception as e:
            raw_response = ""
            latency_ms = round((time.perf_counter() - t0) * 1000, 2)
            tps = 0.0
            score = 0.0
            is_success = False
            metrics = {}
            err = str(e)

        res = BenchmarkResult(
            id=str(uuid.uuid4()),
            run_id=run_id,
            model_tag=model_tag,
            application_type="rag",
            task_id=task_id,
            prompt=question,
            raw_response=raw_response,
            latency_ms=latency_ms,
            ttft_ms=latency_ms * 0.4 if latency_ms else None,
            tokens_per_second=tps,
            is_success=is_success,
            score=score,
            metrics_json=json.dumps(metrics),
            error_message=err,
        )
        app_db.add(res)
        run = app_db.scalar(select(BenchmarkRun).where(BenchmarkRun.id == run_id))
        if run:
            run.completed_cases += 1
            if not is_success:
                run.failed_cases += 1
        app_db.commit()

    async def _evaluate_database_task(
        self,
        app_db: Session,
        demo_db: Session,
        run_id: str,
        model_tag: str,
        task: Dict[str, Any],
    ) -> None:
        """Execute and grade a Database Assistant benchmark task."""
        task_id = task["task_id"]
        prompt = task["prompt"]

        t0 = time.perf_counter()
        try:
            interp = await database_assistant_service.interpret_prompt(
                db=demo_db,
                prompt=prompt,
                model_tag=model_tag,
            )
            raw_response = interp.raw_model_output or (interp.proposal.model_dump_json() if interp.proposal else "")
            latency_ms = interp.latency_ms or round((time.perf_counter() - t0) * 1000, 2)

            # Grade output
            eval_result = DatabaseEvaluator.evaluate(task, interp)
            score = eval_result["score"]
            is_success = eval_result["is_success"]
            metrics = eval_result.get("metrics", {})
            err = interp.error_message
        except Exception as e:
            raw_response = ""
            latency_ms = round((time.perf_counter() - t0) * 1000, 2)
            score = 0.0
            is_success = False
            metrics = {}
            err = str(e)

        res = BenchmarkResult(
            id=str(uuid.uuid4()),
            run_id=run_id,
            model_tag=model_tag,
            application_type="database",
            task_id=task_id,
            prompt=prompt,
            raw_response=raw_response,
            latency_ms=latency_ms,
            ttft_ms=latency_ms * 0.3 if latency_ms else None,
            tokens_per_second=None,
            is_success=is_success,
            score=score,
            metrics_json=json.dumps(metrics),
            error_message=err,
        )
        app_db.add(res)
        run = app_db.scalar(select(BenchmarkRun).where(BenchmarkRun.id == run_id))
        if run:
            run.completed_cases += 1
            if not is_success:
                run.failed_cases += 1
        app_db.commit()

    def _finalize_run(self, app_db: Session, run_id: str) -> None:
        """Calculate aggregated scores and telemetry summary across models."""
        run = app_db.scalar(select(BenchmarkRun).where(BenchmarkRun.id == run_id))
        if not run:
            return

        stmt = select(BenchmarkResult).where(BenchmarkResult.run_id == run_id)
        results = app_db.scalars(stmt).all()

        model_tags = json.loads(run.model_tags_json)
        summary: Dict[str, Any] = {}

        for tag in model_tags:
            tag_results = [r for r in results if r.model_tag == tag]
            if not tag_results:
                continue

            chat_res = [r for r in tag_results if r.application_type == "chat"]
            rag_res = [r for r in tag_results if r.application_type == "rag"]
            db_res = [r for r in tag_results if r.application_type == "database"]

            avg_score = sum(r.score for r in tag_results) / len(tag_results) if tag_results else 0.0
            chat_score = sum(r.score for r in chat_res) / len(chat_res) if chat_res else 0.0
            rag_score = sum(r.score for r in rag_res) / len(rag_res) if rag_res else 0.0
            db_score = sum(r.score for r in db_res) / len(db_res) if db_res else 0.0

            valid_latencies = [r.latency_ms for r in tag_results if r.latency_ms is not None]
            avg_latency = sum(valid_latencies) / len(valid_latencies) if valid_latencies else 0.0

            valid_tps = [r.tokens_per_second for r in tag_results if r.tokens_per_second is not None and r.tokens_per_second > 0]
            avg_tps = sum(valid_tps) / len(valid_tps) if valid_tps else 0.0

            success_rate = sum(1 for r in tag_results if r.is_success) / len(tag_results) if tag_results else 0.0

            summary[tag] = {
                "overall_score": round(avg_score * 100, 1),
                "chat_score": round(chat_score * 100, 1),
                "rag_score": round(rag_score * 100, 1),
                "database_score": round(db_score * 100, 1),
                "average_latency_ms": round(avg_latency, 1),
                "average_tokens_per_sec": round(avg_tps, 1),
                "success_rate": round(success_rate * 100, 1),
                "total_evaluated_tasks": len(tag_results),
            }

        run.status = "completed"
        run.completed_at = datetime.datetime.now(datetime.timezone.utc)
        run.summary_json = json.dumps(summary)
        app_db.commit()

    def get_runs(self, app_db: Session, limit: int = 20) -> List[Dict[str, Any]]:
        """Retrieve list of historical benchmark runs."""
        stmt = select(BenchmarkRun).order_by(desc(BenchmarkRun.started_at)).limit(limit)
        runs = app_db.scalars(stmt).all()
        return [
            {
                "id": r.id,
                "run_name": r.run_name,
                "suite_name": r.suite_name,
                "model_tags": json.loads(r.model_tags_json),
                "status": r.status,
                "total_cases": r.total_cases,
                "completed_cases": r.completed_cases,
                "failed_cases": r.failed_cases,
                "started_at": r.started_at.isoformat() if r.started_at else None,
                "completed_at": r.completed_at.isoformat() if r.completed_at else None,
                "summary": json.loads(r.summary_json) if r.summary_json else None,
            }
            for r in runs
        ]

    def get_run_details(self, app_db: Session, run_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve complete details and task results for a specific run."""
        run = app_db.scalar(select(BenchmarkRun).where(BenchmarkRun.id == run_id))
        if not run:
            return None

        stmt = select(BenchmarkResult).where(BenchmarkResult.run_id == run_id)
        results = app_db.scalars(stmt).all()

        return {
            "id": run.id,
            "run_name": run.run_name,
            "suite_name": run.suite_name,
            "model_tags": json.loads(run.model_tags_json),
            "status": run.status,
            "total_cases": run.total_cases,
            "completed_cases": run.completed_cases,
            "failed_cases": run.failed_cases,
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "completed_at": run.completed_at.isoformat() if run.completed_at else None,
            "summary": json.loads(run.summary_json) if run.summary_json else None,
            "results": [
                {
                    "id": res.id,
                    "model_tag": res.model_tag,
                    "application_type": res.application_type,
                    "task_id": res.task_id,
                    "prompt": res.prompt,
                    "latency_ms": res.latency_ms,
                    "tokens_per_second": res.tokens_per_second,
                    "is_success": res.is_success,
                    "score": res.score,
                    "metrics": json.loads(res.metrics_json) if res.metrics_json else {},
                    "error_message": res.error_message,
                    "raw_response": res.raw_response,
                }
                for res in results
            ],
        }

    def get_comparison_summary(self, app_db: Session) -> Dict[str, Any]:
        """Aggregate the latest benchmark performance for each model to display comparative charts."""
        # Find latest completed run for each model or latest completed run overall
        stmt = (
            select(BenchmarkRun)
            .where(BenchmarkRun.status == "completed")
            .order_by(desc(BenchmarkRun.completed_at))
            .limit(5)
        )
        runs = app_db.scalars(stmt).all()
        if not runs:
            return {"models": {}, "has_data": False}

        # Aggregate latest summary metrics per model
        model_summaries: Dict[str, Any] = {}
        for r in runs:
            if not r.summary_json:
                continue
            run_summary = json.loads(r.summary_json)
            for model_tag, stats in run_summary.items():
                if model_tag not in model_summaries:
                    model_summaries[model_tag] = {
                        **stats,
                        "latest_run_id": r.id,
                        "latest_run_name": r.run_name,
                        "evaluated_at": r.completed_at.isoformat() if r.completed_at else None,
                    }

        return {"models": model_summaries, "has_data": len(model_summaries) > 0}

    def export_run_csv(self, app_db: Session, run_id: str) -> str:
        """Export benchmark run results to RFC-4180 compliant CSV string."""
        details = self.get_run_details(app_db, run_id)
        if not details:
            return ""

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "Run ID",
            "Run Name",
            "Model Tag",
            "Application",
            "Task ID",
            "Score",
            "Success",
            "Latency (ms)",
            "Tokens/Sec",
            "Error",
        ])

        for res in details.get("results", []):
            writer.writerow([
                details["id"],
                details["run_name"],
                res["model_tag"],
                res["application_type"],
                res["task_id"],
                res["score"],
                res["is_success"],
                res["latency_ms"] or "",
                res["tokens_per_second"] or "",
                res["error_message"] or "",
            ])

        return output.getvalue()

    def export_run_pdf(self, app_db: Session, run_id: str) -> bytes:
        """Export benchmark run results to a professionally styled PDF document byte stream."""
        from app.services.pdf_report_service import generate_benchmark_pdf

        details = self.get_run_details(app_db, run_id)
        if not details:
            return b""

        buf = io.BytesIO()
        generate_benchmark_pdf(details, buf)
        return buf.getvalue()


benchmark_service = BenchmarkService()
