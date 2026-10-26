import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../app/store';
import { resetSession } from '../features/interview/interviewSlice';
import { Mic, Square, RotateCcw, Wifi, WifiOff, Sparkles, Activity } from 'lucide-react';

interface StatusIndicatorProps {
  onStart: () => void;
  onStop: () => void;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ onStart, onStop }) => {
  const dispatch = useDispatch();
  const {
    connectionStatus,
    interviewStatus,
    statusMessage,
    audioLevel,
  } = useSelector((state: RootState) => state.interview);

  const isRunning = interviewStatus === 'listening' || interviewStatus === 'thinking' || interviewStatus === 'answering';

  const getStatusBadge = () => {
    switch (interviewStatus) {
      case 'listening':
        return { label: 'Listening...', color: 'status-listening', icon: <Mic className="w-3.5 h-3.5 animate-pulse" /> };
      case 'thinking':
        return { label: 'Thinking...', color: 'status-thinking', icon: <Sparkles className="w-3.5 h-3.5 animate-spin" /> };
      case 'answering':
        return { label: 'Streaming Answer', color: 'status-answering', icon: <Activity className="w-3.5 h-3.5 animate-bounce" /> };
      case 'stopped':
        return { label: 'Session Stopped', color: 'status-stopped', icon: <Square className="w-3.5 h-3.5" /> };
      case 'error':
        return { label: 'Error', color: 'status-error', icon: <WifiOff className="w-3.5 h-3.5" /> };
      default:
        return { label: 'Ready', color: 'status-idle', icon: <Mic className="w-3.5 h-3.5" /> };
    }
  };

  const statusBadge = getStatusBadge();

  return (
    <div className="status-indicator-bar">
      {/* Left: App branding & connection */}
      <div className="status-left">
        <div className="brand-logo">
          <div className="brand-icon-wrapper">
            <Sparkles className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="brand-title">Interview Copilot</h1>
            <p className="brand-subtitle">Real-Time Whisper STT & Hugging Face LLM</p>
          </div>
        </div>

        <div className={`connection-pill ${connectionStatus}`}>
          {connectionStatus === 'connected' ? (
            <>
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              <span>Backend Connected</span>
            </>
          ) : connectionStatus === 'connecting' || connectionStatus === 'reconnecting' ? (
            <>
              <span className="dot-pulse" />
              <span>{connectionStatus === 'connecting' ? 'Connecting...' : 'Reconnecting...'}</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 text-rose-400" />
              <span>Disconnected</span>
            </>
          )}
        </div>
      </div>

      {/* Middle: Live Audio Wave & State */}
      <div className="status-center">
        <div className={`badge ${statusBadge.color}`}>
          {statusBadge.icon}
          <span>{statusBadge.label}</span>
        </div>

        {isRunning && (
          <div className="audio-visualizer-container" title={`Mic Level: ${audioLevel}%`}>
            {[0.4, 0.7, 1.0, 0.6, 0.9, 0.5, 0.8].map((factor, i) => {
              const height = Math.max(4, Math.min(24, (audioLevel / 100) * 24 * factor));
              return (
                <div
                  key={i}
                  className="audio-bar"
                  style={{ height: `${height}px` }}
                />
              );
            })}
          </div>
        )}

        <span className="status-description">{statusMessage}</span>
      </div>

      {/* Right: Actions */}
      <div className="status-right">
        {!isRunning ? (
          <button
            id="start-interview-btn"
            className="btn btn-primary"
            onClick={onStart}
            disabled={connectionStatus !== 'connected'}
          >
            <Mic className="w-4 h-4" />
            <span>Start Interview</span>
          </button>
        ) : (
          <button
            id="stop-interview-btn"
            className="btn btn-danger"
            onClick={onStop}
          >
            <Square className="w-4 h-4" />
            <span>Stop Session</span>
          </button>
        )}

        <button
          id="reset-interview-btn"
          className="btn btn-secondary"
          onClick={() => dispatch(resetSession())}
          title="Clear transcripts and answers"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
