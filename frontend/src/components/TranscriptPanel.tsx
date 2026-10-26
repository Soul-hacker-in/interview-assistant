import React, { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../app/store';
import { Mic, CheckCircle2, Radio, Zap } from 'lucide-react';

interface TranscriptPanelProps {
  onTriggerAnswer?: (question?: string) => void;
}

export const TranscriptPanel: React.FC<TranscriptPanelProps> = ({ onTriggerAnswer }) => {
  const { transcriptSegments, partialTranscript } = useSelector(
    (state: RootState) => state.interview
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcriptSegments, partialTranscript]);

  const hasContent = transcriptSegments.length > 0 || !!partialTranscript;
  const currentText = partialTranscript || (transcriptSegments.length > 0 ? transcriptSegments[transcriptSegments.length - 1].text : '');

  return (
    <div className="card transcript-panel">
      <div className="card-header">
        <div className="card-header-left">
          <Mic className="w-4 h-4 text-emerald-400" />
          <h2 className="card-title">Live Transcript</h2>
          <span className="badge-subtle">faster-whisper</span>
        </div>
        <div className="card-header-actions">
          {partialTranscript && (
            <div className="live-indicator">
              <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span>Transcribing...</span>
            </div>
          )}
          {hasContent && onTriggerAnswer && (
            <button
              className="btn-preset"
              style={{ background: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.4)', color: '#34d399' }}
              onClick={() => onTriggerAnswer(currentText)}
              title="Force answer generation for current transcript"
            >
              <Zap className="w-3 h-3 inline mr-1" />
              Answer Now
            </button>
          )}
        </div>
      </div>

      <div className="transcript-body" ref={scrollRef}>
        {!hasContent ? (
          <div className="empty-state">
            <Mic className="w-8 h-8 text-slate-500 mb-2 stroke-1" />
            <p className="empty-title">Microphone is idle</p>
            <p className="empty-subtitle">
              Press <strong>Start Interview</strong> and speak naturally. Transcription will stream here in real time.
            </p>
          </div>
        ) : (
          <div className="transcript-feed">
            {transcriptSegments.map((segment) => (
              <div key={segment.id} className="transcript-segment final">
                <div className="segment-meta">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span className="timestamp">
                    {new Date(segment.timestamp * 1000).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>
                <div className="segment-text">{segment.text}</div>
              </div>
            ))}

            {partialTranscript && (
              <div className="transcript-segment partial">
                <div className="segment-meta">
                  <span className="dot-pulse" />
                  <span className="text-emerald-400 text-xs font-mono">live interim</span>
                </div>
                <div className="segment-text italic">{partialTranscript}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
