"""Deterministic evaluator for chatbot benchmark tasks."""

import re
import json
from typing import Dict, Any


class ChatEvaluator:
    """Evaluates small language model responses against deterministic rubric criteria."""

    VERSION = "1.0.0"

    @classmethod
    def evaluate(cls, task: Dict[str, Any], response_text: str) -> Dict[str, Any]:
        """Grade a model's response for a given task."""
        category = task.get("category", "")
        criteria = task.get("evaluation_criteria", {})
        cleaned_text = response_text.strip()

        if category == "logical_reasoning":
            return cls._eval_logic(criteria, cleaned_text)
        elif category == "json_generation":
            return cls._eval_json(criteria, cleaned_text)
        elif category == "python_coding":
            return cls._eval_python(criteria, cleaned_text)
        elif category == "instruction_following":
            return cls._eval_instructions(criteria, cleaned_text)
        elif category == "hallucination_sensitive":
            return cls._eval_hallucination(criteria, cleaned_text)
        elif category == "ambiguous_requests":
            return cls._eval_ambiguity(criteria, cleaned_text)
        elif category == "summarization":
            return cls._eval_summarization(criteria, cleaned_text)
        else:
            return cls._eval_general(criteria, cleaned_text)

    @classmethod
    def _eval_logic(cls, criteria: dict, text: str) -> dict:
        expected = criteria.get("expected_answer", "9")
        forbidden = criteria.get("forbidden_answer", "8")
        lower = text.lower()

        # Check if 9 is prominently identified
        has_expected = re.search(r"\b9\b|nine\b", lower) is not None
        # Check if model incorrectly concludes 8
        has_forbidden_conclusion = (
            re.search(r"left with 8|has 8 sheep|answer is 8|leaves 8|17 - 9 = 8", lower) is not None
        )

        success = has_expected and not has_forbidden_conclusion
        score = 1.0 if success else 0.0

        return {
            "is_success": success,
            "score": score,
            "evaluator": f"ChatEvaluator v{cls.VERSION}",
            "feedback": "Correctly identified 9 sheep remain" if success else "Failed to identify 9 or incorrectly answered 8",
            "metrics": {"has_expected": has_expected, "has_forbidden": has_forbidden_conclusion},
        }

    @classmethod
    def _eval_json(cls, criteria: dict, text: str) -> dict:
        # Strip potential markdown fences
        clean = text
        if "```" in clean:
            match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", clean)
            if match:
                clean = match.group(1).strip()

        try:
            parsed = json.loads(clean)
            if not isinstance(parsed, dict):
                return {"is_success": False, "score": 0.2, "feedback": "JSON parsed but root is not an object", "metrics": {}}

            required_keys = criteria.get("required_keys", [])
            present_keys = [k for k in required_keys if k in parsed]
            key_score = len(present_keys) / len(required_keys) if required_keys else 1.0

            success = key_score == 1.0
            return {
                "is_success": success,
                "score": round(key_score, 2),
                "evaluator": f"ChatEvaluator v{cls.VERSION}",
                "feedback": "Valid JSON conforming to required schema" if success else f"Missing keys: {set(required_keys) - set(present_keys)}",
                "metrics": {"valid_json": True, "present_keys": present_keys},
            }
        except Exception as e:
            return {
                "is_success": False,
                "score": 0.0,
                "evaluator": f"ChatEvaluator v{cls.VERSION}",
                "feedback": f"Invalid JSON syntax: {str(e)}",
                "metrics": {"valid_json": False},
            }

    @classmethod
    def _eval_python(cls, criteria: dict, text: str) -> dict:
        clean = text
        if "```" in clean:
            match = re.search(r"```(?:python)?\s*([\s\S]*?)\s*```", clean)
            if match:
                clean = match.group(1).strip()

        fn_name = criteria.get("function_name", "is_palindrome")
        try:
            namespace = {}
            compiled_code = compile(clean, "<eval>", "exec")
            exec(compiled_code, namespace)

            if fn_name not in namespace or not callable(namespace[fn_name]):
                return {"is_success": False, "score": 0.3, "feedback": f"Function `{fn_name}` not found in code", "metrics": {}}

            fn = namespace[fn_name]
            test_cases = criteria.get("test_cases", [])
            passed = 0
            for tc in test_cases:
                inp = tc["input"]
                expected = tc["expected"]
                if fn(inp) == expected:
                    passed += 1

            total_cases = len(test_cases)
            score = round(passed / total_cases, 2) if total_cases > 0 else 1.0
            success = passed == total_cases

            return {
                "is_success": success,
                "score": score,
                "evaluator": f"ChatEvaluator v{cls.VERSION}",
                "feedback": f"Passed {passed}/{total_cases} functional tests",
                "metrics": {"tests_passed": passed, "total_tests": total_cases},
            }
        except Exception as e:
            return {
                "is_success": False,
                "score": 0.0,
                "evaluator": f"ChatEvaluator v{cls.VERSION}",
                "feedback": f"Code compilation or runtime error: {str(e)}",
                "metrics": {"syntax_valid": False},
            }

    @classmethod
    def _eval_instructions(cls, criteria: dict, text: str) -> dict:
        lines = [line.strip() for line in text.strip().split("\n") if line.strip()]
        prefix = criteria.get("line_prefix", "Benefit:").lower()
        exact_count = criteria.get("exact_item_count", 3)

        matching_lines = [l for l in lines if prefix in l.lower()]
        count_match = len(matching_lines) == exact_count

        score = 1.0 if count_match else max(0.0, round(len(matching_lines) / exact_count, 2))
        return {
            "is_success": count_match,
            "score": score,
            "evaluator": f"ChatEvaluator v{cls.VERSION}",
            "feedback": f"Matched {len(matching_lines)} items with prefix '{prefix}'",
            "metrics": {"matching_lines": len(matching_lines), "total_lines": len(lines)},
        }

    SYNONYM_CLUSTERS = {
        "causal": [
            "causal",
            "autoregressive",
            "sequential",
            "one token at a time",
            "previous tokens",
            "one at a time",
            "left-to-right",
            "next token",
        ],
        "mask": [
            "mask",
            "masked",
            "previous tokens",
            "prevent",
            "causal mask",
            "future tokens",
            "causal attention",
        ],
        "bidirectional": [
            "bidirectional",
            "entire input",
            "all tokens",
            "entire sequence",
            "whole sequence",
            "all other tokens",
            "global context",
            "single pass",
            "all previous and future",
        ],
        "unidirectional": [
            "unidirectional",
            "one direction",
            "left-to-right",
            "sequential",
            "autoregressive",
            "one token at a time",
            "previous context",
        ],
    }

    @classmethod
    def _eval_hallucination(cls, criteria: dict, text: str) -> dict:
        lower = text.lower()
        refutations = [
            "no human",
            "has not walked",
            "have not walked",
            "never walked",
            "fictional",
            "false premise",
            "not yet",
            "has never been",
            "no one has walked",
            "nobody has walked",
            "apollo-ares is not",
            "there was no",
            "there has been no",
            "no manned mission",
            "never visited",
            "never landed",
            "no astronaut",
            "no lead astronaut",
            "not an actual",
            "does not exist",
            "did not happen",
            "didn't happen",
            "not currently have",
            "no human astronaut",
            "no human has ever",
        ]
        refuted = any(r in lower for r in refutations)
        score = 1.0 if refuted else 0.0

        return {
            "is_success": refuted,
            "score": score,
            "evaluator": f"ChatEvaluator v{cls.VERSION}",
            "feedback": "Correctly refuted false historical premise about Mars" if refuted else "Hallucinated or failed to refute false premise",
            "metrics": {"refuted_false_premise": refuted},
        }

    @classmethod
    def _eval_ambiguity(cls, criteria: dict, text: str) -> dict:
        lower = text.lower()
        clarification_markers = [
            "please provide",
            "what function",
            "share the code",
            "could you provide",
            "which bug",
            "didn't include",
            "did not provide",
            "see the code",
            "show me",
        ]
        asked_clarification = any(m in lower for m in clarification_markers)
        score = 1.0 if asked_clarification else 0.2

        return {
            "is_success": asked_clarification,
            "score": score,
            "evaluator": f"ChatEvaluator v{cls.VERSION}",
            "feedback": "Appropriately requested code/details for underspecified prompt" if asked_clarification else "Assumed or generated response without clarifying",
            "metrics": {"asked_clarification": asked_clarification},
        }

    @classmethod
    def _eval_summarization(cls, criteria: dict, text: str) -> dict:
        # Check single sentence structure
        sentences = [s.strip() for s in re.split(r"[.!?]+", text) if s.strip()]
        is_single = len(sentences) <= 1
        score = 1.0 if is_single else 0.5

        return {
            "is_success": is_single,
            "score": score,
            "evaluator": f"ChatEvaluator v{cls.VERSION}",
            "feedback": f"Output contained {len(sentences)} sentence(s)",
            "metrics": {"sentence_count": len(sentences)},
        }

    @classmethod
    def _eval_general(cls, criteria: dict, text: str) -> dict:
        required = criteria.get("required_keywords", [])
        lower = text.lower()
        hits = []
        for k in required:
            k_lower = k.lower()
            if k_lower in lower:
                hits.append(k)
            elif k_lower in cls.SYNONYM_CLUSTERS:
                if any(syn in lower for syn in cls.SYNONYM_CLUSTERS[k_lower]):
                    hits.append(k)

        score = round(len(hits) / len(required), 2) if required else 1.0

        return {
            "is_success": score >= 0.5,
            "score": score,
            "evaluator": f"ChatEvaluator v{cls.VERSION}",
            "feedback": f"Matched {len(hits)}/{len(required)} concept keywords",
            "metrics": {"hits": hits, "required": required},
        }
