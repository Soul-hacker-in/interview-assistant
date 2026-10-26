import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../app/store';
import { setResume, setJobDescription, setAnswerMode } from '../features/interview/interviewSlice';
import type { AnswerMode } from '../features/interview/interviewSlice';
import { FileText, Briefcase, ChevronDown, ChevronUp, Sparkles, Sliders } from 'lucide-react';

const PRESETS = [
  {
    name: 'Full-Stack React & Node',
    resume: `• Full-Stack Engineer with 4+ years specializing in React 18, TypeScript, Redux Toolkit, and Node.js.
• Built high-concurrency WebSocket dashboards supporting real-time data streaming with sub-50ms latency.
• Experienced with PostgreSQL, Redis caching, Tailwind/CSS modules, and automated Jest/Playwright testing.`,
    jd: `Role: Senior Frontend / Full-Stack Engineer
Requirements:
- Strong proficiency in modern React, TypeScript, and state management architectures.
- Experience with real-time bidirectional transports (WebSockets/SSE).
- Track record optimizing client-side performance, accessibility, and modular design systems.`,
  },
  {
    name: 'Python & AI Engineer',
    resume: `• AI/ML Systems Engineer with 5+ years experience in Python, FastAPI, PyTorch, and Hugging Face Transformers.
• Designed low-latency local inference pipelines with Whisper STT and quantized LLMs (vLLM, Ollama, ONNX).
• Implemented RAG architectures with vector embeddings (FAISS, ChromaDB) and async stream processing.`,
    jd: `Role: AI Software Engineer - Real-Time Systems
Requirements:
- Hands-on experience deploying open-source LLMs (Llama 3, Qwen) using Hugging Face or vLLM.
- Expert in FastAPI async event loops, WebSockets, and audio processing pipelines.
- Deep focus on end-to-end latency benchmarks and memory footprint optimization.`,
  },
];

export const ContextForm: React.FC = () => {
  const dispatch = useDispatch();
  const { resume, jobDescription, answerMode, interviewStatus } = useSelector(
    (state: RootState) => state.interview
  );
  const [isOpen, setIsOpen] = useState(true);

  const isLocked = interviewStatus === 'listening' || interviewStatus === 'thinking' || interviewStatus === 'answering';

  return (
    <div className="card context-card">
      <div className="card-header cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
        <div className="card-header-left">
          <FileText className="w-4 h-4 text-indigo-400" />
          <h2 className="card-title">Interview Context & Grounding</h2>
          <span className="badge-subtle">Resume & Target JD</span>
        </div>
        <div className="card-header-right">
          <button className="icon-btn" aria-label="Toggle Context Form">
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="card-body">
          {/* Preset Buttons */}
          <div className="preset-bar">
            <span className="preset-label">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 inline mr-1" />
              Quick Fill:
            </span>
            {PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                className="btn-preset"
                disabled={isLocked}
                onClick={() => {
                  dispatch(setResume(p.resume));
                  dispatch(setJobDescription(p.jd));
                }}
              >
                {p.name}
              </button>
            ))}
          </div>

          <div className="context-grid">
            {/* Resume Input */}
            <div className="form-group">
              <label htmlFor="candidate-resume" className="form-label">
                <FileText className="w-3.5 h-3.5 mr-1 inline" />
                Candidate Resume / Highlights
              </label>
              <textarea
                id="candidate-resume"
                className="textarea"
                rows={4}
                value={resume}
                disabled={isLocked}
                placeholder="Paste key achievements, skills, and past projects..."
                onChange={(e) => dispatch(setResume(e.target.value))}
              />
              <span className="char-count">{resume.length} chars</span>
            </div>

            {/* Job Description Input */}
            <div className="form-group">
              <label htmlFor="target-job-desc" className="form-label">
                <Briefcase className="w-3.5 h-3.5 mr-1 inline" />
                Target Job Description
              </label>
              <textarea
                id="target-job-desc"
                className="textarea"
                rows={4}
                value={jobDescription}
                disabled={isLocked}
                placeholder="Paste job description requirements and expectations..."
                onChange={(e) => dispatch(setJobDescription(e.target.value))}
              />
              <span className="char-count">{jobDescription.length} chars</span>
            </div>
          </div>

          {/* Answer Style Selector */}
          <div className="mode-selector-row">
            <div className="mode-label">
              <Sliders className="w-3.5 h-3.5 text-indigo-400 mr-1 inline" />
              Suggested Answer Style:
            </div>
            <div className="mode-options">
              {(['concise', 'star', 'bullet'] as AnswerMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`mode-btn ${answerMode === mode ? 'active' : ''}`}
                  disabled={isLocked}
                  onClick={() => dispatch(setAnswerMode(mode))}
                >
                  {mode === 'concise' && '⚡ Concise (60-90 words)'}
                  {mode === 'star' && '⭐ STAR Method'}
                  {mode === 'bullet' && '📌 3-4 Direct Bullets'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
