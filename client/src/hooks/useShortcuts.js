import { useEffect, useRef } from 'react';

export const DEFAULT_SHORTCUTS = {
  toggleMic: 'Ctrl+M',
  toggleSidebar: 'Ctrl+B',
  newChat: 'Ctrl+Shift+N',
  toggleSettings: 'Ctrl+,',
  toggleTTS: 'Ctrl+Shift+V',
  captureScreenshot: 'Ctrl+Shift+S',
};

const SHORTCUT_LABELS = {
  toggleMic: 'Toggle Microphone',
  toggleSidebar: 'Toggle Sidebar',
  newChat: 'New Chat',
  toggleSettings: 'Toggle Settings',
  toggleTTS: 'Toggle Voice Output',
  captureScreenshot: 'Capture Screen',
};

export { SHORTCUT_LABELS };

function isModifier(key) {
  return ['Control', 'Meta', 'Alt', 'Shift'].includes(key);
}

function formatCombo(e) {
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.metaKey) parts.push('Meta');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (!isModifier(e.key)) {
    parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
  }
  return parts.join('+');
}

export function parseShortcut(shortcut) {
  if (!shortcut) return null;
  const parts = shortcut.split('+');
  return {
    ctrl: parts.includes('Ctrl'),
    meta: parts.includes('Meta'),
    alt: parts.includes('Alt'),
    shift: parts.includes('Shift'),
    key: parts[parts.length - 1],
  };
}

export default function useShortcuts(shortcuts, callbacks) {
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    const handler = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const combo = formatCombo(e);
      if (!combo) return;

      for (const [action, shortcut] of Object.entries(shortcuts)) {
        if (shortcut && combo === shortcut) {
          e.preventDefault();
          e.stopPropagation();
          callbacksRef.current[action]?.();
          return;
        }
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [shortcuts]);
}
