"""API endpoints for managing conversations and exchanging chat messages with local SLMs."""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.db.session import get_app_db
from app.db.repositories.chat_repository import chat_repository
from app.services.chat_service import chat_service
from app.api.schemas.chat import (
    ConversationResponse,
    ConversationListItemResponse,
    ConversationCreateRequest,
    ConversationUpdateRequest,
    MessageCreateRequest,
    MessageResponse,
)

router = APIRouter(prefix="/chat", tags=["Chatbot"])


@router.post("/conversations", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
def create_conversation(
    payload: ConversationCreateRequest,
    db: Session = Depends(get_app_db),
):
    """Create a new chat conversation session."""
    conversation = chat_repository.create_conversation(
        db=db,
        title=payload.title or "New Conversation",
        model_tag=payload.model_tag or "qwen2.5:3b",
    )
    return conversation


@router.get("/conversations", response_model=List[ConversationListItemResponse])
def list_conversations(
    db: Session = Depends(get_app_db),
):
    """List all saved conversations ordered by recency."""
    conversations = chat_repository.list_conversations(db=db)
    result = []
    for conv in conversations:
        item = ConversationListItemResponse(
            id=conv.id,
            title=conv.title,
            model_tag=conv.model_tag,
            created_at=conv.created_at,
            updated_at=conv.updated_at,
            message_count=len(conv.messages),
        )
        result.append(item)
    return result


@router.get("/conversations/{conversation_id}", response_model=ConversationResponse)
def get_conversation(
    conversation_id: str,
    db: Session = Depends(get_app_db),
):
    """Fetch complete conversation history and telemetry for a specific conversation."""
    conversation = chat_repository.get_conversation(db=db, conversation_id=conversation_id)
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation '{conversation_id}' not found.",
        )
    return conversation


@router.patch("/conversations/{conversation_id}", response_model=ConversationResponse)
def update_conversation(
    conversation_id: str,
    payload: ConversationUpdateRequest,
    db: Session = Depends(get_app_db),
):
    """Rename a conversation title or update its default model."""
    conversation = chat_repository.update_conversation(
        db=db,
        conversation_id=conversation_id,
        title=payload.title,
        model_tag=payload.model_tag,
    )
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation '{conversation_id}' not found.",
        )
    return conversation


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(
    conversation_id: str,
    db: Session = Depends(get_app_db),
):
    """Delete a conversation and all its associated messages."""
    deleted = chat_repository.delete_conversation(db=db, conversation_id=conversation_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation '{conversation_id}' not found.",
        )
    return None


@router.post("/conversations/{conversation_id}/reset", status_code=status.HTTP_200_OK)
def reset_conversation(
    conversation_id: str,
    db: Session = Depends(get_app_db),
):
    """Clear all messages from the conversation while retaining the conversation container."""
    cleared_count = chat_repository.clear_messages(db=db, conversation_id=conversation_id)
    return {"message": "Conversation history reset successfully", "cleared_messages": cleared_count}


@router.post("/conversations/{conversation_id}/messages", response_model=MessageResponse)
async def send_message(
    conversation_id: str,
    payload: MessageCreateRequest,
    db: Session = Depends(get_app_db),
):
    """Submit a message and await complete model response with latency telemetry."""
    assistant_message = await chat_service.send_message(
        db=db,
        conversation_id=conversation_id,
        content=payload.content,
        model_tag=payload.model_tag,
        temperature=payload.temperature or 0.7,
        max_tokens=payload.max_tokens,
        system_prompt=payload.system_prompt,
    )
    return assistant_message


@router.post("/conversations/{conversation_id}/stream")
async def stream_message(
    conversation_id: str,
    payload: MessageCreateRequest,
    db: Session = Depends(get_app_db),
):
    """Submit a message and stream response tokens sequentially using Server-Sent Events."""
    return StreamingResponse(
        chat_service.stream_message(
            db=db,
            conversation_id=conversation_id,
            content=payload.content,
            model_tag=payload.model_tag,
            temperature=payload.temperature or 0.7,
            max_tokens=payload.max_tokens,
            system_prompt=payload.system_prompt,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
