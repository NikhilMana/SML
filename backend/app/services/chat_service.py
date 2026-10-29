"""Service managing conversation context assembly, inference orchestration, and message persistence."""

import json
from typing import AsyncGenerator, Dict, List, Optional
from sqlalchemy.orm import Session
from app.core.exceptions import SLMLabException, ModelUnavailableException
from app.core.logging import logger
from app.db.models import Conversation, Message
from app.db.repositories.chat_repository import chat_repository
from app.services.ollama_service import ollama_service
from app.services.model_registry import model_registry


class ChatService:
    """Orchestrates multi-turn chat sessions and streaming inference."""

    def __init__(self):
        self.default_system_prompt = (
            "You are a helpful, precise, and concise AI assistant running locally via Ollama. "
            "Provide accurate answers and well-structured code snippets when requested."
        )

    def _prepare_history(
        self,
        conversation: Conversation,
        max_turns: int = 12,
    ) -> List[Dict[str, str]]:
        """Extract recent conversation turns into Ollama-compatible message dicts."""
        # Grab the last max_turns messages
        recent_messages = conversation.messages[-max_turns:] if conversation.messages else []
        history = []
        for msg in recent_messages:
            history.append({
                "role": msg.role,
                "content": msg.content,
            })
        return history

    async def send_message(
        self,
        db: Session,
        conversation_id: str,
        content: str,
        model_tag: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        system_prompt: Optional[str] = None,
    ) -> Message:
        """Process user message, query local SLM synchronously, and persist assistant turn."""
        conversation = chat_repository.get_conversation(db, conversation_id)
        if not conversation:
            raise SLMLabException(f"Conversation '{conversation_id}' not found", status_code=404)

        chosen_model = model_tag or conversation.model_tag

        # 1. Persist user message first
        chat_repository.add_message(
            db=db,
            conversation_id=conversation_id,
            role="user",
            content=content,
        )

        # 2. Assemble context window
        db.refresh(conversation)
        history = self._prepare_history(conversation)

        active_system_prompt = system_prompt or self.default_system_prompt

        # 3. Execute inference via Ollama service
        inference_result = await ollama_service.chat_completion(
            model=chosen_model,
            messages=history,
            temperature=temperature,
            max_tokens=max_tokens,
            system_prompt=active_system_prompt,
        )

        # 4. Persist assistant reply with telemetry
        assistant_message = chat_repository.add_message(
            db=db,
            conversation_id=conversation_id,
            role="assistant",
            content=inference_result["content"],
            model_tag=chosen_model,
            latency_ms=inference_result.get("latency_ms"),
            ttft_ms=inference_result.get("ttft_ms"),
            tokens_per_second=inference_result.get("tokens_per_second"),
            input_tokens=inference_result.get("input_tokens"),
            output_tokens=inference_result.get("output_tokens"),
        )

        return assistant_message

    async def stream_message(
        self,
        db: Session,
        conversation_id: str,
        content: str,
        model_tag: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        system_prompt: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        """Stream response tokens sequentially from Ollama, persisting the complete turn on completion."""
        conversation = chat_repository.get_conversation(db, conversation_id)
        if not conversation:
            yield f"data: {json.dumps({'type': 'error', 'message': f'Conversation {conversation_id} not found'})}\n\n"
            return

        chosen_model = model_tag or conversation.model_tag

        # 1. Persist user turn
        chat_repository.add_message(
            db=db,
            conversation_id=conversation_id,
            role="user",
            content=content,
        )

        db.refresh(conversation)
        history = self._prepare_history(conversation)
        active_system_prompt = system_prompt or self.default_system_prompt

        accumulated_tokens = []
        ttft_ms: Optional[float] = None
        latency_ms: Optional[float] = None
        tps: Optional[float] = None
        input_tokens: Optional[int] = None
        output_tokens: Optional[int] = None

        try:
            async for chunk in ollama_service.stream_chat(
                model=chosen_model,
                messages=history,
                temperature=temperature,
                max_tokens=max_tokens,
                system_prompt=active_system_prompt,
            ):
                chunk_type = chunk.get("type")

                if chunk_type == "ttft":
                    ttft_ms = chunk.get("ttft_ms")
                    yield f"data: {json.dumps(chunk)}\n\n"

                elif chunk_type == "token":
                    accumulated_tokens.append(chunk.get("token", ""))
                    yield f"data: {json.dumps(chunk)}\n\n"

                elif chunk_type == "done":
                    latency_ms = chunk.get("latency_ms")
                    tps = chunk.get("tokens_per_second")
                    input_tokens = chunk.get("input_tokens")
                    output_tokens = chunk.get("output_tokens")
                    yield f"data: {json.dumps(chunk)}\n\n"

                elif chunk_type == "error":
                    yield f"data: {json.dumps(chunk)}\n\n"
                    return

            # Save completed assistant reply
            full_reply = "".join(accumulated_tokens)
            assistant_msg = chat_repository.add_message(
                db=db,
                conversation_id=conversation_id,
                role="assistant",
                content=full_reply,
                model_tag=chosen_model,
                latency_ms=latency_ms,
                ttft_ms=ttft_ms,
                tokens_per_second=tps,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            )

            # Emit final saved event with message ID
            saved_event = {
                "type": "saved",
                "message_id": assistant_msg.id,
                "model_tag": chosen_model,
                "latency_ms": latency_ms,
                "ttft_ms": ttft_ms,
                "tokens_per_second": tps,
            }
            yield f"data: {json.dumps(saved_event)}\n\n"

        except Exception as e:
            logger.error(f"Error during streaming chat: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"


chat_service = ChatService()
