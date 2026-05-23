import { CheckCircle, XCircle, X } from 'lucide-react';

export default function Toast({ message, type = 'success', onDismiss }) {
  if (!message) return null;

  return (
    <div className={`settings-toast settings-toast--${type}`}>
      {type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
      <span>{message}</span>
      <button className="settings-toast-close" onClick={onDismiss}>
        <X size={14} />
      </button>
    </div>
  );
}
