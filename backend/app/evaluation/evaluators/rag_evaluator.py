"""Deterministic evaluator for RAG retrieval quality and grounded generation metrics."""

import re
from typing import Dict, Any, List


class RAGEvaluator:
    """Computes Recall@k, Citation Accuracy, Groundedness, and Abstention fidelity."""

    VERSION = "1.0.0"

    @classmethod
    def evaluate(
        cls,
        task: Dict[str, Any],
        answer: str,
        retrieved_passages: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Grade both retrieval and generation quality for a RAG benchmark task."""
        requires_abstention = task.get("requires_abstention", False)
        expected_source = task.get("expected_source")
        required_keywords = task.get("required_keywords", [])

        # 1. Evaluate Retrieval Recall@k
        recall_at_k = 1.0
        if expected_source:
            found_sources = [p.get("filename", "") for p in retrieved_passages]
            recall_at_k = 1.0 if any(expected_source in s for s in found_sources) else 0.0

        # 2. Evaluate Abstention
        lower_answer = answer.lower()
        has_abstention = "insufficient evidence" in lower_answer or "not mentioned" in lower_answer

        if requires_abstention:
            abstention_success = has_abstention
            score = 1.0 if abstention_success else 0.0
            return {
                "is_success": abstention_success,
                "score": score,
                "evaluator": f"RAGEvaluator v{cls.VERSION}",
                "metrics": {
                    "recall_at_k": recall_at_k,
                    "abstention_adherence": 1.0 if abstention_success else 0.0,
                    "citation_count": 0,
                    "keyword_accuracy": 1.0 if abstention_success else 0.0,
                },
                "feedback": "Correctly abstained on out-of-domain query" if abstention_success else "Hallucinated instead of abstaining",
            }

        # 3. Citation Check: [Document: ..., Page: ...]
        citation_matches = re.findall(r"\[Document:\s*[^,\]]+(?:,\s*Page:\s*\d+)?\]", answer)
        has_citations = len(citation_matches) > 0
        citation_score = 1.0 if has_citations else 0.5  # 0.5 partial if answered factually without explicit tag

        # 4. Keyword / Factoid Groundedness
        keyword_hits = [k for k in required_keywords if k.lower() in lower_answer]
        keyword_accuracy = len(keyword_hits) / len(required_keywords) if required_keywords else 1.0

        # Weighted composite score: 40% Retrieval Recall, 40% Factoid Accuracy, 20% Citation Presence
        final_score = round(
            (0.4 * recall_at_k) + (0.4 * keyword_accuracy) + (0.2 * citation_score),
            2,
        )

        # Handle abstention on in-domain questions
        if has_abstention and not requires_abstention:
            if keyword_accuracy < 0.5:
                # Genuine unwarranted abstention / failure to extract facts
                final_score = round(min(final_score, 0.40), 2)
            else:
                # Extracted facts and cited document, but appended cautious disclaimer
                final_score = max(0.0, round(final_score - 0.10, 2))

        is_success = final_score >= 0.70

        return {
            "is_success": is_success,
            "score": final_score,
            "evaluator": f"RAGEvaluator v{cls.VERSION}",
            "metrics": {
                "recall_at_k": recall_at_k,
                "keyword_accuracy": round(keyword_accuracy, 2),
                "citation_score": citation_score,
                "citation_count": len(citation_matches),
            },
            "feedback": (
                f"Recall@k: {recall_at_k}, Keywords: {len(keyword_hits)}/{len(required_keywords)}, Citations: {len(citation_matches)}"
            ),
        }
