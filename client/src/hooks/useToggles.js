import { useState, useCallback, useRef } from 'react';

const DEFAULT_TOGGLES = {
  trigger_image_search: false,
  share_screenshot: false,
  screen_preview: false,
  speech_to_text: false,
};

export function useToggles({ onCaptureScreenshot, onStartSTT, onStartScreenPreview, onStopScreenPreview }) {
  const [activeToggles, setActiveToggles] = useState({ ...DEFAULT_TOGGLES });
  const [images, setImages] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const prevTogglesRef = useRef({ ...DEFAULT_TOGGLES });

  const processToggles = useCallback((toggles, responseImages = [], responseSearchQuery = '') => {
    const merged = { ...DEFAULT_TOGGLES, ...toggles };
    const prev = prevTogglesRef.current;

    setActiveToggles(merged);
    setImages(responseImages || []);
    setSearchQuery(responseSearchQuery || '');

    if (merged.share_screenshot && !prev.share_screenshot) {
      onCaptureScreenshot?.();
    }

    if (merged.speech_to_text && !prev.speech_to_text) {
      onStartSTT?.();
    }

    if (merged.screen_preview && !prev.screen_preview) {
      onStartScreenPreview?.();
    } else if (!merged.screen_preview && prev.screen_preview) {
      onStopScreenPreview?.();
    }

    prevTogglesRef.current = merged;
  }, [onCaptureScreenshot, onStartSTT, onStartScreenPreview, onStopScreenPreview]);

  const clearToggles = useCallback(() => {
    setActiveToggles({ ...DEFAULT_TOGGLES });
    setImages([]);
    setSearchQuery('');
    prevTogglesRef.current = { ...DEFAULT_TOGGLES };
  }, []);

  return {
    activeToggles,
    images,
    searchQuery,
    processToggles,
    clearToggles,
  };
}
