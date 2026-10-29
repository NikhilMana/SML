"""Tests for conversation persistence, message flow, and chatbot benchmark evaluation."""

import json
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient
from app.evaluation.evaluators.chat_evaluator import ChatEvaluator


def test_conversation_crud(client: TestClient):
    """Verify conversation creation, retrieval, renaming, resetting, and deletion."""
    # 1. Create conversation
    create_res = client.post(
        "/api/chat/conversations",
        json={"title": "Test Chat", "model_tag": "qwen2.5:3b"},
    )
    assert create_res.status_code == 201
    conv = create_res.json()
    conv_id = conv["id"]
    assert conv["title"] == "Test Chat"
    assert conv["model_tag"] == "qwen2.5:3b"

    # 2. List conversations
    list_res = client.get("/api/chat/conversations")
    assert list_res.status_code == 200
    conv_list = list_res.json()
    assert any(c["id"] == conv_id for c in conv_list)

    # 3. Rename conversation
    patch_res = client.patch(
        f"/api/chat/conversations/{conv_id}",
        json={"title": "Updated Title", "model_tag": "llama3.2:3b"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["title"] == "Updated Title"
    assert patch_res.json()["model_tag"] == "llama3.2:3b"

    # 4. Get conversation
    get_res = client.get(f"/api/chat/conversations/{conv_id}")
    assert get_res.status_code == 200
    assert get_res.json()["id"] == conv_id

    # 5. Reset conversation
    reset_res = client.post(f"/api/chat/conversations/{conv_id}/reset")
    assert reset_res.status_code == 200

    # 6. Delete conversation
    del_res = client.delete(f"/api/chat/conversations/{conv_id}")
    assert del_res.status_code == 204

    # Verify deleted
    get_deleted = client.get(f"/api/chat/conversations/{conv_id}")
    assert get_deleted.status_code == 404


def test_chat_message_flow_with_mock(client: TestClient):
    """Test full conversational turn with simulated Ollama inference."""
    create_res = client.post(
        "/api/chat/conversations",
        json={"title": "Inference Chat", "model_tag": "qwen2.5:3b"},
    )
    conv_id = create_res.json()["id"]

    mock_response = {
        "model": "qwen2.5:3b",
        "content": "A local SLM executes on-device without cloud dependencies.",
        "latency_ms": 250.5,
        "ttft_ms": 45.2,
        "tokens_per_second": 32.4,
        "input_tokens": 18,
        "output_tokens": 12,
        "done_reason": "stop",
    }

    with patch("app.services.chat_service.ollama_service.chat_completion", new_callable=AsyncMock) as mock_chat:
        mock_chat.return_value = mock_response

        msg_res = client.post(
            f"/api/chat/conversations/{conv_id}/messages",
            json={"content": "Explain local SLMs briefly."},
        )

        assert msg_res.status_code == 200
        reply = msg_res.json()
        assert reply["role"] == "assistant"
        assert reply["content"] == mock_response["content"]
        assert reply["latency_ms"] == 250.5
        assert reply["tokens_per_second"] == 32.4
        assert reply["model_tag"] == "qwen2.5:3b"

    # Verify both user and assistant messages are persistently saved
    conv_res = client.get(f"/api/chat/conversations/{conv_id}")
    messages = conv_res.json()["messages"]
    assert len(messages) == 2
    assert messages[0]["role"] == "user"
    assert messages[0]["content"] == "Explain local SLMs briefly."
    assert messages[1]["role"] == "assistant"
    assert messages[1]["content"] == mock_response["content"]


def test_chat_evaluator_deterministic_rules():
    """Verify deterministic scoring rules in ChatEvaluator across benchmark categories."""
    # 1. Logic test (Sheep puzzle)
    logic_task = {
        "category": "logical_reasoning",
        "evaluation_criteria": {"expected_answer": "9", "forbidden_answer": "8"},
    }
    good_logic = ChatEvaluator.evaluate(logic_task, "The farmer still has 9 sheep because all but 9 ran away.")
    bad_logic = ChatEvaluator.evaluate(logic_task, "17 minus 9 equals 8, so the farmer has 8 sheep.")
    assert good_logic["is_success"] is True
    assert good_logic["score"] == 1.0
    assert bad_logic["is_success"] is False

    # 2. JSON test
    json_task = {
        "category": "json_generation",
        "evaluation_criteria": {"required_keys": ["title", "author", "year", "topics"]},
    }
    good_json = ChatEvaluator.evaluate(
        json_task,
        '{"title": "Local SLMs", "author": "Research Lab", "year": 2026, "topics": ["ai", "models"]}'
    )
    bad_json = ChatEvaluator.evaluate(json_task, "Here is the book: title is Local SLMs, year is 2026.")
    assert good_json["is_success"] is True
    assert good_json["score"] == 1.0
    assert bad_json["is_success"] is False

    # 3. Python coding test (Palindrome)
    code_task = {
        "category": "python_coding",
        "evaluation_criteria": {
            "function_name": "is_palindrome",
            "test_cases": [
                {"input": "A man, a plan, a canal: Panama", "expected": True},
                {"input": "hello", "expected": False},
            ],
        },
    }
    valid_code = (
        "def is_palindrome(s: str) -> bool:\n"
        "    cleaned = [c.lower() for c in s if c.isalnum()]\n"
        "    return cleaned == cleaned[::-1]\n"
    )
    eval_code = ChatEvaluator.evaluate(code_task, valid_code)
    assert eval_code["is_success"] is True
    assert eval_code["score"] == 1.0

    # 4. Hallucination test
    halluc_task = {
        "category": "hallucination_sensitive",
        "evaluation_criteria": {"refutes_false_premise": True},
    }
    good_halluc = ChatEvaluator.evaluate(halluc_task, "No human has ever walked on Mars, and the Apollo-Ares mission is fictional.")
    bad_halluc = ChatEvaluator.evaluate(halluc_task, "Commander John Smith led the Apollo-Ares mission to Mars in 2018.")
    assert good_halluc["is_success"] is True
    assert bad_halluc["is_success"] is False

    # 4b. Realistic SLM Hallucination Refutation (Llama 3.2 phrasing)
    llama_halluc = ChatEvaluator.evaluate(
        halluc_task,
        "There was no Apollo-Ares mission in 2018, and to date, there has been no manned mission to Mars."
    )
    assert llama_halluc["is_success"] is True
    assert llama_halluc["score"] == 1.0

    # 5. General Knowledge Attention Mechanism concept matching
    gen_task = {
        "category": "general_knowledge",
        "evaluation_criteria": {
            "required_keywords": ["causal", "mask", "bidirectional", "unidirectional"],
        },
    }
    model_response = (
        "In an autoregressive decoder, attention is used sequentially to generate one token at a time "
        "based on previous tokens. In contrast, an encoder-only model uses attention across the entire input in a single pass."
    )
    gen_eval = ChatEvaluator.evaluate(gen_task, model_response)
    assert gen_eval["is_success"] is True
    assert gen_eval["score"] >= 0.5
