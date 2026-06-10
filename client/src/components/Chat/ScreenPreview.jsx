import { useEffect, useRef, useState, memo } from 'react';
import { X, Minimize2, Maximize2 } from 'lucide-react';

const ScreenPreview = memo(function ScreenPreview({ onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState('');
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function startCapture() {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        stream.getVideoTracks()[0]?.addEventListener('ended', () => {
          onClose?.();
        });
      } catch (err) {
        if (!cancelled) {
          setError(err.name === 'NotAllowedError' ? 'Screen preview cancelled.' : 'Failed to start preview.');
        }
      }
    }

    startCapture();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, [onClose]);

  if (error) return null;

  return (
    <div className={`screen-preview ${minimized ? 'minimized' : ''}`}>
      <div className="screen-preview-header">
        <span className="screen-preview-label">
          {minimized ? '📺 Screen' : 'Screen Preview'}
        </span>
        <div className="screen-preview-actions">
          <button
            onClick={() => setMinimized(!minimized)}
            title={minimized ? 'Expand' : 'Minimize'}
            aria-label={minimized ? 'Expand screen preview' : 'Minimize screen preview'}
          >
            {minimized ? <Maximize2 size={12} /> : <Minimize2 size={12} />}
          </button>
          <button onClick={onClose} title="Close preview" aria-label="Close screen preview">
            <X size={12} />
          </button>
        </div>
      </div>
      {!minimized && (
        <div className="screen-preview-video">
          <video ref={videoRef} autoPlay muted playsInline />
        </div>
      )}
    </div>
  );
});

export default ScreenPreview;
