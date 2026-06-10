import { useState, useCallback, memo } from 'react';
import { Send, Loader2, Bot } from 'lucide-react';

const SUGGESTED_GOALS = [
  'Open Firefox browser',
  'Search Google for "weather today"',
  'Open the calculator app',
  'Minimize all windows and show the desktop',
];

const AgentInput = memo(function AgentInput({ onSendGoal, isSending, disabled }) {
  const [goal, setGoal] = useState('');

  const handleSubmit = useCallback(() => {
    if (!goal.trim() || isSending || disabled) return;
    onSendGoal(goal);
    setGoal('');
  }, [goal, isSending, disabled, onSendGoal]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  return (
    <div className="agent-input-container">
      <div className="agent-input-header">
        <Bot size={16} />
        <span>Desktop Agent Mode</span>
      </div>
      <div className="agent-input-body">
        <textarea
          className="agent-input-field"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe what you want the agent to do..."
          disabled={isSending || disabled}
          rows={2}
        />
        <button
          className="agent-send-btn"
          onClick={handleSubmit}
          disabled={!goal.trim() || isSending || disabled}
        >
          {isSending ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
        </button>
      </div>
      {!isSending && (
        <div className="agent-suggestions">
          {SUGGESTED_GOALS.map((s, i) => (
            <button
              key={i}
              className="agent-suggestion-chip"
              onClick={() => { setGoal(s); }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

export default AgentInput;
