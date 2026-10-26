import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from .services import TranscriptionService, HuggingFaceAnswerGenerator
from .websocket import handle_interview_websocket

env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
if os.path.exists(env_path):
    load_dotenv(env_path, override=True)
else:
    load_dotenv(override=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("interview_app")

transcription_service: TranscriptionService = None
answer_generator: HuggingFaceAnswerGenerator = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global transcription_service, answer_generator
    logger.info("Initializing services on server startup...")

    transcription_service = TranscriptionService()
    answer_generator = HuggingFaceAnswerGenerator()

    # Preload STT and LLM in background threads if configured
    try:
        logger.info("Services initialized successfully.")
    except Exception as e:
        logger.error(f"Startup warning during service initialization: {e}")

    yield

    logger.info("Shutting down application...")


app = FastAPI(
    title="Real-Time Interview Assistant Backend",
    version="1.0.0",
    description="Real-time interview speech transcription, question detection, and Hugging Face answer streaming.",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "stt_model": transcription_service.model_size if transcription_service else "pending",
        "llm_backend": answer_generator.backend if answer_generator else "pending",
        "llm_model": answer_generator.model_id if answer_generator else "pending",
    }


@app.websocket("/ws/interview")
async def interview_ws_endpoint(websocket: WebSocket):
    await handle_interview_websocket(websocket, transcription_service, answer_generator)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
