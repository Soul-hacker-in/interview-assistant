from typing import Optional, Literal, Dict, Any
from pydantic import BaseModel, Field


# Client -> Server Messages
class StartMessage(BaseModel):
    type: Literal["start"] = "start"
    resume: Optional[str] = ""
    jobDescription: Optional[str] = ""
    answerMode: Optional[str] = "concise"


class StopMessage(BaseModel):
    type: Literal["stop"] = "stop"


# Server -> Client Events
class StatusEvent(BaseModel):
    type: Literal["status"] = "status"
    status: Literal["idle", "listening", "transcribing", "thinking", "answering", "stopped", "error"]
    message: Optional[str] = None


class TranscriptPartialEvent(BaseModel):
    type: Literal["transcript_partial"] = "transcript_partial"
    text: str
    timestamp: float


class TranscriptFinalEvent(BaseModel):
    type: Literal["transcript_final"] = "transcript_final"
    text: str
    timestamp: float


class QuestionDetectedEvent(BaseModel):
    type: Literal["question_detected"] = "question_detected"
    question: str
    timestamp: float


class AnswerChunkEvent(BaseModel):
    type: Literal["answer_chunk"] = "answer_chunk"
    text: str  # accumulated text so far
    delta: str  # new token/chunk
    timestamp: float


class AnswerMetrics(BaseModel):
    ttft_ms: float
    total_ms: float
    token_count: int


class AnswerCompleteEvent(BaseModel):
    type: Literal["answer_complete"] = "answer_complete"
    answer: str
    metrics: AnswerMetrics
    timestamp: float


class ErrorEvent(BaseModel):
    type: Literal["error"] = "error"
    message: str
