import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from './app/store';
import { setErrorMessage } from './features/interview/interviewSlice';
import { useInterviewSocket } from './hooks/useInterviewSocket';
import { StatusIndicator } from './components/StatusIndicator';
import { ContextForm } from './components/ContextForm';
import { TranscriptPanel } from './components/TranscriptPanel';
import { QuestionPanel } from './components/QuestionPanel';
import { AnswerPanel } from './components/AnswerPanel';
import { AlertCircle, X, Shield, Cpu, Zap, Heart } from 'lucide-react';

export const App: React.FC = () => {
  const dispatch = useDispatch();
  const { errorMessage } = useSelector((state: RootState) => state.interview);
  const { startSession, stopSession, triggerAnswer } = useInterviewSocket();

  return (
    <div className="app-container">
      {/* Top Bar / Header */}
      <header className="app-header">
        <StatusIndicator onStart={startSession} onStop={stopSession} />
      </header>

      {/* Error Banner */}
      {errorMessage && (
        <div className="error-banner">
          <div className="error-content">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            className="error-dismiss"
            onClick={() => dispatch(setErrorMessage(null))}
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Workspace Layout */}
      <main className="app-main">
        {/* Candidate & Job Context Form */}
        <section className="section-context">
          <ContextForm />
        </section>

        {/* Live Panels 2-Column Grid */}
        <section className="section-panels-grid">
          {/* Left Column: Live Audio Transcript & Detected Questions */}
          <div className="grid-column left-column">
            <TranscriptPanel onTriggerAnswer={triggerAnswer} />
            <QuestionPanel onTriggerAnswer={triggerAnswer} />
          </div>

          {/* Right Column: AI Streaming Answer Panel */}
          <div className="grid-column right-column">
            <AnswerPanel />
          </div>
        </section>
      </main>

      {/* Footer & Telemetry */}
      <footer className="app-footer">
        <div className="footer-item">
          <Shield className="w-3.5 h-3.5 text-emerald-400" />
          <span>Local Privacy First: Audio & Models Run 100% On-Device</span>
        </div>
        <div className="footer-item">
          <Cpu className="w-3.5 h-3.5 text-indigo-400" />
          <span>STT: faster-whisper (int8) | LLM: Hugging Face (MPS/CUDA/CPU)</span>
        </div>
        <div className="footer-item">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>Target SLA: &lt; 3.0s First Token Latency</span>
        </div>
        <div className="footer-item">
          <Heart className="w-3.5 h-3.5 text-rose-400" />
          <span>Cost: $0 API Spend</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
