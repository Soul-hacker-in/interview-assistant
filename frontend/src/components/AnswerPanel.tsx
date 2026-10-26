import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../app/store';
import { MessageSquareCode, Copy, Check, Volume2, Gauge, Zap, CheckCircle2 } from 'lucide-react';

export const AnswerPanel: React.FC = () => {
  const { currentAnswer, answerMetrics, interviewStatus } = useSelector(
    (state: RootState) => state.interview
  );
  const [copied, setCopied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const isGenerating = interviewStatus === 'thinking' || interviewStatus === 'answering';

  const handleCopy = () => {
    if (!currentAnswer) return;
    navigator.clipboard.writeText(currentAnswer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSpeech = () => {
    if (!currentAnswer || !('speechSynthesis' in window)) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const cleanText = currentAnswer.replace(/[#*•]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.05;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="card answer-panel">
      <div className="card-header">
        <div className="card-header-left">
          <MessageSquareCode className="w-4 h-4 text-purple-400" />
          <h2 className="card-title">Suggested Answer</h2>
          <span className="badge-subtle">Hugging Face LLM</span>
        </div>

        <div className="card-header-actions">
          {answerMetrics && (
            <div className="latency-pill" title="Time To First Token">
              <Zap className="w-3.5 h-3.5 text-amber-400 inline mr-1" />
              <span>TTFT: {answerMetrics.ttft_ms} ms</span>
              <span className={`target-badge ${answerMetrics.ttft_ms < 3000 ? 'good' : 'warning'}`}>
                {answerMetrics.ttft_ms < 3000 ? '< 3s Target Met' : '> 3s'}
              </span>
            </div>
          )}

          {currentAnswer && (
            <div className="action-buttons-group">
              <button
                className="btn-icon-action"
                onClick={handleSpeech}
                title={isSpeaking ? 'Stop speaking' : 'Read answer aloud'}
              >
                <Volume2 className={`w-3.5 h-3.5 ${isSpeaking ? 'text-indigo-400 animate-pulse' : ''}`} />
              </button>
              <button
                className="btn-icon-action"
                onClick={handleCopy}
                title="Copy answer to clipboard"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="card-body">
        {/* Answer Streaming Content */}
        {!currentAnswer && !isGenerating ? (
          <div className="empty-state">
            <MessageSquareCode className="w-8 h-8 text-slate-500 mb-2 stroke-1" />
            <p className="empty-title">No answer generated yet</p>
            <p className="empty-subtitle">
              When an interview question is detected, concise grounded bullet points will stream here in real time.
            </p>
          </div>
        ) : (
          <div className="answer-wrapper">
            <div className="answer-text">
              {currentAnswer ? (
                <div className="formatted-answer">
                  {currentAnswer.split('\n').map((line, idx) => {
                    const trimmed = line.trim();
                    if (!trimmed) return <div key={idx} className="h-2" />;
                    return (
                      <p key={idx} className="answer-line">
                        {trimmed}
                      </p>
                    );
                  })}
                  {isGenerating && <span className="typing-cursor" />}
                </div>
              ) : (
                <div className="thinking-loader">
                  <div className="dot-flashing" />
                  <span className="text-sm text-slate-400">Synthesizing answer from resume and job description...</span>
                </div>
              )}
            </div>

            {/* Metrics footer when answer finishes */}
            {answerMetrics && (
              <div className="metrics-bar">
                <div className="metric-item">
                  <Gauge className="w-3.5 h-3.5 text-slate-400" />
                  <span className="metric-label">TTFT:</span>
                  <span className="metric-value font-mono">{answerMetrics.ttft_ms} ms</span>
                </div>
                <div className="metric-divider" />
                <div className="metric-item">
                  <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                  <span className="metric-label">Total Time:</span>
                  <span className="metric-value font-mono">{(answerMetrics.total_ms / 1000).toFixed(2)}s</span>
                </div>
                <div className="metric-divider" />
                <div className="metric-item">
                  <span className="metric-label">Tokens:</span>
                  <span className="metric-value font-mono">{answerMetrics.token_count}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
