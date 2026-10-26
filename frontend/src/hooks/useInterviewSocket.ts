import { useEffect, useRef, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../app/store';
import {
  setConnectionStatus,
  setInterviewStatus,
  setPartialTranscript,
  addFinalTranscript,
  addDetectedQuestion,
  appendAnswerChunk,
  setAnswerComplete,
  setErrorMessage,
  setAudioLevel,
} from '../features/interview/interviewSlice';

const DEFAULT_WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws/interview';

const FILLER_WORDS = new Set([
  'ok', 'okay', 'yeah', 'yes', 'yep', 'nope', 'no', 'cool', 'great', 'awesome',
  'alright', 'right', 'sure', 'got it', 'i see', 'uh huh', 'mhm', 'um', 'uh',
  'hello', 'hi', 'hey', 'thank you', 'thanks', 'sounds good', 'can you hear me',
  'testing', 'one two three', 'let us see', 'let me know'
]);

function isQuestionCandidate(text: string): boolean {
  const clean = text.toLowerCase().replace(/[^a-z0-9\s?]/g, '').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  // Allow short technical questions (e.g. "what is javascript", "what is react", "explain closures")
  if (words.length < 2 || clean.length < 6) return false;

  // Reject pure fillers or repetitions like "okay okay okay", "yeah yeah"
  const uniqueWords = new Set(words);
  if (uniqueWords.size <= 2 && [...uniqueWords].every((w) => FILLER_WORDS.has(w))) {
    return false;
  }
  // Reject transitions without questions
  if (words.every((w) => ['so', 'we', 'are', 'going', 'to', 'ahead', 'and', 'do', 'this', 'now', 'well', 'all'].includes(w))) {
    return false;
  }

  // Check direct question mark
  if (text.includes('?')) return true;

  // Check interrogative prompts & technical query cues
  const questionCues = [
    'what', 'why', 'how', 'when', 'where', 'who', 'which',
    'can you', 'could you', 'would you', 'will you', 'do you', 'did you', 'have you', 'are you',
    'explain', 'describe', 'tell me about', 'tell me', 'walk me through',
    'give an example', 'share an experience', 'difference between', 'compare',
    'define', 'difference', 'pros and cons', 'advantages of', 'disadvantages of',
    'what is', 'what are', 'whats', "what's"
  ];
  return questionCues.some((cue) => clean.startsWith(cue) || clean.includes(' ' + cue + ' '));
}

export function useInterviewSocket() {
  const dispatch = useDispatch();
  const {
    connectionStatus,
    interviewStatus,
    resume,
    jobDescription,
    answerMode,
  } = useSelector((state: RootState) => state.interview);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const speechRecognitionRef = useRef<any | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isManuallyStoppedRef = useRef(false);
  const lastTriggeredRef = useRef<{ text: string; time: number }>({ text: '', time: 0 });
  const interimPauseTimerRef = useRef<any>(null);

  // Downsample audio buffer from hardware rate to 16,000 Hz for faster-whisper
  const downsampleTo16k = useCallback((input: Float32Array, sampleRate: number): Float32Array => {
    if (sampleRate === 16000) return input;
    const ratio = sampleRate / 16000;
    const newLength = Math.round(input.length / ratio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < input.length; i++) {
        accum += input[i];
        count++;
      }
      result[offsetResult] = count > 0 ? accum / count : input[offsetBuffer];
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  }, []);

  // Convert Float32Array to 16-bit PCM ArrayBuffer
  const convertFloat32ToPCM16 = useCallback((input: Float32Array): ArrayBuffer => {
    const buffer = new ArrayBuffer(input.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < input.length; i++) {
      let s = Math.max(-1, Math.min(1, input[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buffer;
  }, []);

  // Connect WebSocket
  const connectWebSocket = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    dispatch(setConnectionStatus('connecting'));

    try {
      const ws = new WebSocket(DEFAULT_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        dispatch(setConnectionStatus('connected'));
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          switch (data.type) {
            case 'status':
              dispatch(setInterviewStatus({ status: data.status, message: data.message }));
              break;
            case 'transcript_partial':
              dispatch(setPartialTranscript(data.text));
              break;
            case 'transcript_final':
              dispatch(addFinalTranscript({ text: data.text, timestamp: data.timestamp }));
              break;
            case 'question_detected':
              dispatch(addDetectedQuestion({ question: data.question, timestamp: data.timestamp }));
              break;
            case 'answer_chunk':
              dispatch(appendAnswerChunk({ text: data.text, delta: data.delta }));
              break;
            case 'answer_complete':
              dispatch(setAnswerComplete({ answer: data.answer, metrics: data.metrics }));
              break;
            case 'error':
              dispatch(setErrorMessage(data.message));
              break;
            default:
              console.log('Unhandled WebSocket event:', data);
          }
        } catch (err) {
          console.error('Failed to parse incoming WebSocket message:', err);
        }
      };

      ws.onerror = () => {
        // Quiet down browser Event object logging
        dispatch(setConnectionStatus('disconnected'));
      };

      ws.onclose = () => {
        dispatch(setConnectionStatus('disconnected'));
        if (!isManuallyStoppedRef.current && reconnectAttemptsRef.current < 5) {
          reconnectAttemptsRef.current += 1;
          dispatch(setConnectionStatus('reconnecting'));
          setTimeout(() => {
            connectWebSocket();
          }, 1500 * reconnectAttemptsRef.current);
        }
      };
    } catch (e) {
      dispatch(setConnectionStatus('disconnected'));
      dispatch(setErrorMessage(`WebSocket connection failed: ${e}`));
    }
  }, [dispatch]);

  // Helper to ensure WebSocket is open before streaming
  const ensureConnected = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        resolve(true);
        return;
      }
      connectWebSocket();
      let elapsed = 0;
      const interval = setInterval(() => {
        elapsed += 100;
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          clearInterval(interval);
          resolve(true);
        } else if (elapsed > 3500) {
          clearInterval(interval);
          resolve(false);
        }
      }, 100);
    });
  }, [connectWebSocket]);

  // Clean up audio capture and speech recognition
  const cleanupAudio = useCallback(() => {
    if (interimPauseTimerRef.current) {
      clearTimeout(interimPauseTimerRef.current);
      interimPauseTimerRef.current = null;
    }
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.onend = null;
        speechRecognitionRef.current.onerror = null;
        speechRecognitionRef.current.stop();
      } catch (_) {}
      speechRecognitionRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    dispatch(setAudioLevel(0));
  }, [dispatch]);

  // Start microphone and streaming session
  const startSession = useCallback(async () => {
    isManuallyStoppedRef.current = false;
    dispatch(setErrorMessage(null));

    const isConnected = await ensureConnected();
    if (!isConnected || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      dispatch(setErrorMessage('Backend WebSocket server is not reachable. Make sure FastAPI is running on port 8000.'));
      return;
    }

    // Request microphone access
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtxClass();
      audioContextRef.current = audioCtx;

      // Ensure AudioContext is active
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const source = audioCtx.createMediaStreamSource(stream);
      // ScriptProcessorNode buffer 4096 samples
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);

        // Visualizer RMS level calculation
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        const level = Math.min(100, Math.round(rms * 400));
        dispatch(setAudioLevel(level));

        // Resample from hardware rate to 16,000 Hz for faster-whisper
        const resampled = downsampleTo16k(inputData, e.inputBuffer.sampleRate);

        // Stream PCM16 bytes to backend WebSocket
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const pcm16 = convertFloat32ToPCM16(resampled);
          wsRef.current.send(pcm16);
        }
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);

      // Start dual-engine browser SpeechRecognition for instant transcription & triggering
      const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognitionClass) {
        try {
          const recognition = new SpeechRecognitionClass();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = 'en-US';
          recognition.maxAlternatives = 1;

          recognition.onresult = (event: any) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
              const res = event.results[i];
              const text = res[0].transcript;
              if (res.isFinal) {
                const trimmed = text.trim();
                if (trimmed) {
                  // Final speech chunk arrived; clear interim pause timer
                  if (interimPauseTimerRef.current) {
                    clearTimeout(interimPauseTimerRef.current);
                    interimPauseTimerRef.current = null;
                  }

                  dispatch(addFinalTranscript({ text: trimmed, timestamp: Date.now() / 1000 }));

                  const now = Date.now();
                  const timeSinceLastTrigger = now - lastTriggeredRef.current.time;
                  const isNewQuestion = trimmed.toLowerCase() !== lastTriggeredRef.current.text.toLowerCase();
                  const alreadyRecentlyTriggered = !isNewQuestion && timeSinceLastTrigger < 2000;

                  // Trigger answer immediately if it is a question and not a duplicate within 2s
                  if (isQuestionCandidate(trimmed) && (!alreadyRecentlyTriggered || isNewQuestion)) {
                    lastTriggeredRef.current = { text: trimmed, time: now };
                    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                      wsRef.current.send(JSON.stringify({
                        type: 'trigger_question',
                        question: trimmed,
                        force: true,
                      }));
                    }
                  }
                }
              } else {
                interim += text;
              }
            }

            if (interim) {
              dispatch(setPartialTranscript(interim));

              // When candidate pauses after asking a question, auto-trigger within <= 2.0s
              const candidate = interim.trim();
              if (isQuestionCandidate(candidate)) {
                if (interimPauseTimerRef.current) {
                  clearTimeout(interimPauseTimerRef.current);
                }
                // 1200ms silence threshold triggers LLM answer so total latency is <= 2.0s
                interimPauseTimerRef.current = setTimeout(() => {
                  const now = Date.now();
                  const isNewQuestion = candidate.toLowerCase() !== lastTriggeredRef.current.text.toLowerCase();
                  const timeSinceLastTrigger = now - lastTriggeredRef.current.time;

                  if (isNewQuestion || timeSinceLastTrigger > 1500) {
                    lastTriggeredRef.current = { text: candidate, time: now };
                    dispatch(addFinalTranscript({ text: candidate, timestamp: now / 1000 }));
                    dispatch(setPartialTranscript(''));

                    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                      wsRef.current.send(JSON.stringify({
                        type: 'trigger_question',
                        question: candidate,
                        force: true,
                      }));
                    }
                  }
                }, 1200);
              }
            }
          };

          recognition.onerror = (e: any) => {
            console.warn('SpeechRecognition warning:', e.error);
          };

          recognition.onend = () => {
            if (!isManuallyStoppedRef.current && mediaStreamRef.current) {
              try { recognition.start(); } catch (_) {}
            }
          };

          recognition.start();
          speechRecognitionRef.current = recognition;
        } catch (e) {
          console.warn('Browser SpeechRecognition not initialized:', e);
        }
      }

      // Send start message with resume & JD context to backend
      const startPayload = {
        type: 'start',
        resume,
        jobDescription,
        answerMode,
      };
      wsRef.current.send(JSON.stringify(startPayload));
      dispatch(setInterviewStatus({ status: 'listening', message: 'Listening to interview...' }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      dispatch(setErrorMessage(`Microphone access error: ${msg}`));
      dispatch(setInterviewStatus({ status: 'error', message: 'Microphone permission denied' }));
      cleanupAudio();
    }
  }, [connectWebSocket, dispatch, resume, jobDescription, answerMode, downsampleTo16k, convertFloat32ToPCM16, cleanupAudio]);

  // Stop session
  const stopSession = useCallback(() => {
    isManuallyStoppedRef.current = true;
    cleanupAudio();

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
    }
    dispatch(setInterviewStatus({ status: 'stopped', message: 'Session stopped' }));
  }, [cleanupAudio, dispatch]);

  // Manual trigger to force answer generation for current or custom question
  const triggerAnswer = useCallback((customQuestion?: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'trigger_question',
        question: customQuestion || '',
        force: true,
      }));
    }
  }, []);

  // Auto-connect on mount, clean up on unmount
  useEffect(() => {
    connectWebSocket();
    return () => {
      cleanupAudio();
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connectWebSocket, cleanupAudio]);

  return {
    connectionStatus,
    interviewStatus,
    startSession,
    stopSession,
    triggerAnswer,
    reconnect: connectWebSocket,
  };
}
