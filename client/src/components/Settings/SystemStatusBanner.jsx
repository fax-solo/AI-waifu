import { useState } from 'react';
import { CheckCircle, AlertTriangle, XCircle, ChevronDown, ChevronUp, Cpu, Mic, Key, Database, Volume2 } from 'lucide-react';

const STATUS_OK = 'ok';
const STATUS_WARN = 'warn';
const STATUS_ERR = 'error';

function getOverallStatus(items) {
  if (items.some(i => i.status === STATUS_ERR)) return STATUS_ERR;
  if (items.some(i => i.status === STATUS_WARN)) return STATUS_WARN;
  return STATUS_OK;
}

const STATUS_META = {
  ok: { icon: CheckCircle, color: 'var(--color-success)', label: 'All systems operational' },
  warn: { icon: AlertTriangle, color: 'var(--color-warning)', label: 'Some features may be limited' },
  error: { icon: XCircle, color: 'var(--color-error)', label: 'Issues detected — setup may be incomplete' },
};

const ICON_MAP = {
  python: Cpu,
  ttsModel: Database,
  ttsServer: Volume2,
  apiKey: Key,
  mic: Mic,
};

export default function SystemStatusBanner({ setupStatus, ttsStatus, hasCustomKey, hasGroqKey }) {
  const [expanded, setExpanded] = useState(false);
  const hasApiKey = hasCustomKey || hasGroqKey;

  const items = [];

  // Python env
  if (setupStatus) {
    items.push({
      id: 'pythonEnv',
      label: 'Python Environment',
      status: setupStatus.venvMissing ? STATUS_ERR : STATUS_OK,
      message: setupStatus.venvMissing ? 'Not set up' : 'Ready',
      icon: 'python',
    });
  }

  // TTS models
  if (setupStatus) {
    items.push({
      id: 'ttsModels',
      label: 'TTS Model Files',
      status: setupStatus.modelsMissing ? STATUS_ERR : STATUS_OK,
      message: setupStatus.modelsMissing ? 'Not downloaded' : 'Downloaded',
      icon: 'ttsModel',
    });
  }

  // TTS server
  const ttsOnline = ttsStatus?.status === 'ok';
  items.push({
    id: 'ttsServer',
    label: 'TTS Server',
    status: ttsOnline ? STATUS_OK : (ttsStatus?.status === 'unknown' ? STATUS_WARN : STATUS_ERR),
    message: ttsOnline ? `Running (${ttsStatus.device || 'cpu'})` : (ttsStatus?.status === 'unknown' ? 'Checking...' : 'Offline'),
    icon: 'ttsServer',
  });

  // API key
  items.push({
    id: 'apiKey',
    label: 'API Key',
    status: hasApiKey ? STATUS_OK : STATUS_WARN,
    message: hasApiKey ? 'Configured' : 'Not set — chat requires an API key',
    icon: 'apiKey',
  });

  // GPU info
  if (setupStatus?.gpuInfo?.hasNvidia) {
    items.push({
      id: 'gpu',
      label: 'GPU Acceleration',
      status: STATUS_OK,
      message: `${setupStatus.gpuInfo.name || 'NVIDIA GPU'} available`,
      icon: 'cpu',
    });
  }

  const overall = getOverallStatus(items);
  const { icon: OverallIcon, color, label } = STATUS_META[overall];

  return (
    <div className={`system-status system-status--${overall}`}>
      <button className="system-status-bar" onClick={() => setExpanded(!expanded)}>
        <OverallIcon size={16} style={{ color, flexShrink: 0 }} />
        <span className="system-status-label" style={{ color }}>{label}</span>
        <span className="system-status-count">
          {items.filter(i => i.status !== STATUS_OK).length} issue{items.filter(i => i.status !== STATUS_OK).length !== 1 ? 's' : ''}
        </span>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {expanded && (
        <div className="system-status-details">
          {items.map(item => {
            const Icon = ICON_MAP[item.icon] || Cpu;
            const dotColor = item.status === STATUS_ERR ? 'var(--color-error)'
              : item.status === STATUS_WARN ? 'var(--color-warning)'
              : 'var(--color-success)';

            return (
              <div key={item.id} className="system-status-item">
                <Icon size={14} style={{ opacity: 0.6 }} />
                <span className="system-status-item-label">{item.label}</span>
                <span className="system-status-item-dot" style={{ background: dotColor }} />
                <span className="system-status-item-message" style={{ color: dotColor }}>{item.message}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
