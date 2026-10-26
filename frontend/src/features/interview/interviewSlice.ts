import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface TranscriptSegment {
  id: string;
  text: string;
  timestamp: number;
  isFinal: boolean;
}

export interface DetectedQuestion {
  id: string;
  question: string;
  timestamp: number;
}

export interface AnswerMetrics {
  ttft_ms: number;
  total_ms: number;
  token_count: number;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
export type InterviewStatus = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'answering' | 'stopped' | 'error';
export type AnswerMode = 'concise' | 'star' | 'bullet';

interface InterviewState {
  connectionStatus: ConnectionStatus;
  interviewStatus: InterviewStatus;
  statusMessage: string;
  transcriptSegments: TranscriptSegment[];
  partialTranscript: string;
  detectedQuestions: DetectedQuestion[];
  currentAnswer: string;
  answerMetrics: AnswerMetrics | null;
  resume: string;
  jobDescription: string;
  answerMode: AnswerMode;
  audioLevel: number;
  errorMessage: string | null;
}

const initialState: InterviewState = {
  connectionStatus: 'disconnected',
  interviewStatus: 'idle',
  statusMessage: 'Ready to start session',
  transcriptSegments: [],
  partialTranscript: '',
  detectedQuestions: [],
  currentAnswer: '',
  answerMetrics: null,
  resume: `• Senior Full-Stack Engineer with 5+ years building distributed React, Node.js, and Python microservices.
• Architected real-time WebSocket messaging pipelines handling 10k+ concurrent connections with sub-50ms latency.
• Proficient in React 18/19, TypeScript, Redux Toolkit, FastAPI, PyTorch, and Docker containerization.
• Reduced API response latency by 45% through Redis caching and query indexing.`,
  jobDescription: `Role: Senior Real-Time Systems & AI Engineer
Requirements:
- Deep experience in modern React, TypeScript, and state management (Redux/Zustand).
- Strong proficiency in Python, FastAPI, WebSockets, and asynchronous I/O architectures.
- Experience with Speech-to-Text (Whisper) and LLM inference pipelines (Hugging Face / PyTorch).
- Focus on low-latency UX and reliable real-time event streaming.`,
  answerMode: 'concise',
  audioLevel: 0,
  errorMessage: null,
};

export const interviewSlice = createSlice({
  name: 'interview',
  initialState,
  reducers: {
    setConnectionStatus: (state, action: PayloadAction<ConnectionStatus>) => {
      state.connectionStatus = action.payload;
    },
    setInterviewStatus: (state, action: PayloadAction<{ status: InterviewStatus; message?: string }>) => {
      state.interviewStatus = action.payload.status;
      if (action.payload.message) {
        state.statusMessage = action.payload.message;
      }
    },
    setResume: (state, action: PayloadAction<string>) => {
      state.resume = action.payload;
    },
    setJobDescription: (state, action: PayloadAction<string>) => {
      state.jobDescription = action.payload;
    },
    setAnswerMode: (state, action: PayloadAction<AnswerMode>) => {
      state.answerMode = action.payload;
    },
    setAudioLevel: (state, action: PayloadAction<number>) => {
      state.audioLevel = action.payload;
    },
    setPartialTranscript: (state, action: PayloadAction<string>) => {
      state.partialTranscript = action.payload;
    },
    addFinalTranscript: (state, action: PayloadAction<{ text: string; timestamp: number }>) => {
      state.transcriptSegments.push({
        id: `seg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        text: action.payload.text,
        timestamp: action.payload.timestamp,
        isFinal: true,
      });
      state.partialTranscript = '';
    },
    addDetectedQuestion: (state, action: PayloadAction<{ question: string; timestamp: number }>) => {
      state.detectedQuestions.push({
        id: `q-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        question: action.payload.question,
        timestamp: action.payload.timestamp,
      });
      state.currentAnswer = '';
      state.answerMetrics = null;
    },
    appendAnswerChunk: (state, action: PayloadAction<{ text: string; delta: string }>) => {
      state.currentAnswer = action.payload.text;
    },
    setAnswerComplete: (state, action: PayloadAction<{ answer: string; metrics: AnswerMetrics }>) => {
      state.currentAnswer = action.payload.answer;
      state.answerMetrics = action.payload.metrics;
    },
    setErrorMessage: (state, action: PayloadAction<string | null>) => {
      state.errorMessage = action.payload;
      if (action.payload) {
        state.interviewStatus = 'error';
      }
    },
    resetSession: (state) => {
      state.transcriptSegments = [];
      state.partialTranscript = '';
      state.detectedQuestions = [];
      state.currentAnswer = '';
      state.answerMetrics = null;
      state.audioLevel = 0;
      state.errorMessage = null;
      state.interviewStatus = 'idle';
      state.statusMessage = 'Session reset';
    },
  },
});

export const {
  setConnectionStatus,
  setInterviewStatus,
  setResume,
  setJobDescription,
  setAnswerMode,
  setAudioLevel,
  setPartialTranscript,
  addFinalTranscript,
  addDetectedQuestion,
  appendAnswerChunk,
  setAnswerComplete,
  setErrorMessage,
  resetSession,
} = interviewSlice.actions;

export default interviewSlice.reducer;
