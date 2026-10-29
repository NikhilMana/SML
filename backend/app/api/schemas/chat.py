"""Pydantic schemas for conversation management and chat messaging."""

import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict


class MessageResponse(BaseModel):
    """Schema for an individual chat message with performance telemetry."""

    id: str
    conversation_id: str
    role: str
    content: str
    model_tag: Optional[str] = None
    latency_ms: Optional[float] = None
    ttft_ms: Optional[float] = None
    tokens_per_second: Optional[float] = None
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)


class ConversationListItemResponse(BaseModel):
    """Schema for conversation summary in sidebars."""

    id: str
    title: str
    model_tag: str
    created_at: datetime.datetime
    updated_at: datetime.datetime
    message_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class ConversationResponse(BaseModel):
    """Schema for a full conversation including message history."""

    id: str
    title: str
    model_tag: str
    created_at: datetime.datetime
    updated_at: datetime.datetime
    messages: List[MessageResponse] = []

    model_config = ConfigDict(from_attributes=True)


class ConversationCreateRequest(BaseModel):
    """Payload to initiate a new conversation."""

    title: Optional[str] = Field("New Conversation", max_length=255)
    model_tag: Optional[str] = Field("qwen2.5:3b", max_length=100)


class ConversationUpdateRequest(BaseModel):
    """Payload to rename or update active model for a conversation."""

    title: Optional[str] = Field(None, max_length=255)
    model_tag: Optional[str] = Field(None, max_length=100)


class MessageCreateRequest(BaseModel):
    """Payload to submit a user message to the conversation."""

    content: str = Field(..., min_length=1, description="User prompt or question")
    model_tag: Optional[str] = Field(None, description="Model to generate the response; falls back to conversation model")
    temperature: Optional[float] = Field(0.7, ge=0.0, le=2.0)
    max_tokens: Optional[int] = Field(None, ge=1, le=8192)
    system_prompt: Optional[str] = Field(None, description="Optional custom system instruction")
