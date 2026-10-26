import React from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../app/store';
import { HelpCircle, Sparkles, Clock, Send } from 'lucide-react';

const SAMPLE_QUESTIONS = [
  'What is React in JavaScript?',
  'How does Redux Toolkit simplify state management?',
  'Explain the JavaScript event loop and microtask queue',
  'Describe a challenging production bug you resolved.',
];

interface QuestionPanelProps {
  onTriggerAnswer?: (question: string) => void;
}

export const QuestionPanel: React.FC<QuestionPanelProps> = ({ onTriggerAnswer }) => {
  const { detectedQuestions } = useSelector((state: RootState) => state.interview);

  const latestQuestion = detectedQuestions.length > 0 ? detectedQuestions[detectedQuestions.length - 1] : null;

  return (
    <div className="card question-panel">
      <div className="card-header">
        <div className="card-header-left">
          <HelpCircle className="w-4 h-4 text-amber-400" />
          <h2 className="card-title">Detected Questions</h2>
          <span className="badge-subtle">{detectedQuestions.length} detected</span>
        </div>
        <div className="text-xs text-slate-400 font-mono">
          Pause + Stability VAD
        </div>
      </div>

      <div className="card-body">
        {/* Sample Questions Quick Triggers */}
        <div className="preset-bar" style={{ marginBottom: '10px' }}>
          <span className="preset-label">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 inline mr-1" />
            Quick Test Questions:
          </span>
          {SAMPLE_QUESTIONS.map((sq) => (
            <button
              key={sq}
              type="button"
              className="btn-preset"
              onClick={() => onTriggerAnswer && onTriggerAnswer(sq)}
              title="Click to instantly stream answer for this question"
            >
              <Send className="w-2.5 h-2.5 inline mr-1" />
              {sq.length > 30 ? sq.substring(0, 30) + '...' : sq}
            </button>
          ))}
        </div>

        {!latestQuestion ? (
          <div className="empty-state-compact">
            <Sparkles className="w-6 h-6 text-slate-500 mb-2 stroke-1" />
            <p className="empty-title">Waiting for interview questions</p>
            <p className="empty-subtitle">
              Speak a question into your microphone or click one of the quick test questions above to see the answer stream.
            </p>
          </div>
        ) : (
          <div className="question-content">
            {/* Latest active question highlighted */}
            <div className="active-question-card">
              <div className="active-question-header">
                <span className="badge-highlight">Latest Detected Question</span>
                <span className="timestamp">
                  <Clock className="w-3 h-3 inline mr-1" />
                  {new Date(latestQuestion.timestamp * 1000).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
              </div>
              <h3 className="active-question-text">"{latestQuestion.question}"</h3>
            </div>

            {/* History of detected questions */}
            {detectedQuestions.length > 1 && (
              <div className="question-history">
                <div className="history-label">Previous Questions in Session:</div>
                <ul className="history-list">
                  {detectedQuestions.slice(0, -1).reverse().map((q) => (
                    <li key={q.id} className="history-item">
                      <span className="history-bullet">•</span>
                      <span className="history-text">{q.question}</span>
                      <span className="history-time">
                        {new Date(q.timestamp * 1000).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
