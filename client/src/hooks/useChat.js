import { useState, useCallback, useRef, useEffect } from 'react';
import * as api from '../utils/api.js';

/**
 * Custom hook for managing chat state and actions.
 */
export function useChat() {
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState(null);
  const [rateLimit, setRateLimit] = useState(null);

  const messagesEndRef = useRef(null);
  const sendingRef = useRef(false);

  // Scroll to bottom of messages
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  // Load conversations on mount
  const loadConversations = useCallback(async () => {
    try {
      const data = await api.getConversations();
      setConversations(data);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  }, []);

  useEffect(() => {
    loadConversations();
    loadRateLimit();
  }, [loadConversations]);

  // Load rate limit status
  const loadRateLimit = useCallback(async () => {
    try {
      const data = await api.getRateLimit();
      setRateLimit(data);
    } catch (err) {
      console.error('Failed to load rate limit:', err);
    }
  }, []);

  // Select a conversation and load its messages
  const selectConversation = useCallback(async (conversationId) => {
    setActiveConversationId(conversationId);
    setIsLoading(true);
    setError(null);

    try {
      const data = await api.getConversation(conversationId);
      setMessages(data.messages || []);
      scrollToBottom();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [scrollToBottom]);

  // Create a new conversation
  const createConversation = useCallback(async () => {
    try {
      const conversation = await api.createConversation();
      setConversations((prev) => [conversation, ...prev]);
      setActiveConversationId(conversation.id);
      setMessages([]);
      return conversation;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, []);

  // Send a message (non-streaming)
  const sendMessage = useCallback(async (text, screenshot) => {
    if ((!text.trim() && !screenshot) || isSending) return;

    const messageText = text.trim() || 'What do you see on my screen?';

    let conversationId = activeConversationId;

    if (!conversationId) {
      const conversation = await createConversation();
      if (!conversation) return;
      conversationId = conversation.id;
    }

    setIsSending(true);
    setError(null);

    const userContent = text.trim() + (screenshot ? '\n\n[📷 Screenshot attached]' : '');
    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: userContent,
      hasScreenshot: !!screenshot,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    scrollToBottom();

    const searchKeywords = ['latest', 'news', 'today', '2025', '2026', 'recent', 'current', 'weather', 'stock', 'price', 'what happened'];
    const mightNeedSearch = searchKeywords.some(keyword => messageText.toLowerCase().includes(keyword));
    setIsSearching(mightNeedSearch);

    try {
      const response = await api.sendMessage(conversationId, messageText, screenshot);

      const aiMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: response.message,
        isSearching: response.isSearching,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, aiMessage]);

      if (response.rateLimit) {
        setRateLimit((prev) => ({
          ...prev,
          remaining: response.rateLimit.remaining,
          limit: response.rateLimit.limit,
          used: (prev?.limit ?? response.rateLimit.limit) - response.rateLimit.remaining,
        }));
      }

      loadConversations();
      scrollToBottom();
      return response;
    } catch (err) {
      setError(err.data?.error || err.message);

      if (err.status === 429) {
        loadRateLimit();
      }
    } finally {
      setIsSending(false);
      setIsSearching(false);
    }
  }, [activeConversationId, isSending, createConversation, loadConversations, scrollToBottom, loadRateLimit]);

  // Send a message (streaming) — tokens update the AI message in real-time
  // `onDone` callback receives { emotion, animation, loopAnimation, mouthExpression, eyeExpression, message, isSearching }
  const sendMessageStream = useCallback((text, screenshot, callbacks = {}) => {
    if ((!text.trim() && !screenshot) || isSending || sendingRef.current) return null;
    sendingRef.current = true;

    const messageText = text.trim() || 'What do you see on my screen?';

    function done() { sendingRef.current = false; }

    (async () => {
      let conversationId = activeConversationId;

      if (!conversationId) {
        const conversation = await createConversation();
        if (!conversation) { done(); return; }
        conversationId = conversation.id;
      }

      setIsSending(true);
      setError(null);

      const userContent = text.trim() + (screenshot ? '\n\n[📷 Screenshot attached]' : '');
      const userMessage = {
        id: Date.now(),
        role: 'user',
        content: userContent,
        hasScreenshot: !!screenshot,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);
      scrollToBottom();

      const searchKeywords = ['latest', 'news', 'today', '2025', '2026', 'recent', 'current', 'weather', 'stock', 'price', 'what happened'];
      const mightNeedSearch = searchKeywords.some(keyword => messageText.toLowerCase().includes(keyword));
      setIsSearching(mightNeedSearch);

      const aiMessageId = Date.now() + 1;
      setMessages((prev) => [...prev, {
        id: aiMessageId,
        role: 'assistant',
        content: '',
        isStreaming: true,
        created_at: new Date().toISOString(),
      }]);

      let fullContent = '';

      function updatePlaceholder(updates) {
        setMessages((prev) => {
          const updated = [...prev];
          const idx = updated.findIndex(m => m.id === aiMessageId);
          if (idx !== -1) {
            updated[idx] = { ...updated[idx], ...updates };
          }
          return updated;
        });
      }

      function stripTags(text) {
        return text
          .replace(/\[animation:[^\]]+\]/gi, '')
          .replace(/\[(neutral|happy|angry|sad|relaxed|surprised|excited|embarrassed|nervous|affectionate|playful|tired|thoughtful|smug|loving|grateful|annoyed|curious|worried|proud|disgust|fear)\]/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
      }

      function finalizeResponse(response, content) {
        const cleanMessage = response.message || stripTags(content || '');

        updatePlaceholder({
          content: cleanMessage,
          isStreaming: false,
          isSearching: response.isSearching,
        });

        if (response.rateLimit) {
          setRateLimit((prev) => ({
            ...prev,
            remaining: response.rateLimit.remaining,
            limit: response.rateLimit.limit,
            used: (prev?.limit ?? response.rateLimit.limit) - response.rateLimit.remaining,
          }));
        }

        setIsSending(false);
        setIsSearching(false);
        loadConversations();
        scrollToBottom();
        done();
        callbacks.onDone?.({ ...response, message: cleanMessage });
      }

      try {
        await new Promise((resolve, reject) => {
          api.sendMessageStream(conversationId, messageText, screenshot, {
            onToken(text) {
              fullContent += text;
              updatePlaceholder({ content: fullContent });
              scrollToBottom();
            },
            onSearch(query) {
              setIsSearching(true);
            },
            onDone(response) {
              finalizeResponse(response, fullContent);
              resolve();
            },
            onError(err) {
              if (fullContent) {
                updatePlaceholder({ isStreaming: false });
                setIsSending(false);
                setIsSearching(false);
                done();
                callbacks.onDone?.({ message: fullContent });
                resolve();
                return;
              }

              api.sendMessage(conversationId, messageText, screenshot)
                .then(response => {
                  finalizeResponse(response, '');
                })
                .catch(fallbackErr => {
                  const errorMsg = fallbackErr.data?.error || fallbackErr.message || err;
                  setError(errorMsg);
                  updatePlaceholder({ isStreaming: false });
                  setIsSending(false);
                  setIsSearching(false);
                  done();
                  callbacks.onError?.(errorMsg);
                  reject(errorMsg);
                });
            },
          });
        });
      } catch {
        // handled in onError above
      }
    })();

    return null;
  }, [activeConversationId, isSending, createConversation, loadConversations, scrollToBottom]);

  // Delete a conversation
  const removeConversation = useCallback(async (conversationId) => {
    try {
      await api.deleteConversation(conversationId);
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));

      if (activeConversationId === conversationId) {
        setActiveConversationId(null);
        setMessages([]);
      }
    } catch (err) {
      setError(err.message);
    }
  }, [activeConversationId]);

  // Remove a specific message by ID
  const removeMessage = useCallback((messageId) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  return {
    conversations,
    activeConversationId,
    messages,
    isLoading,
    isSending,
    isSearching,
    error,
    rateLimit,
    messagesEndRef,
    selectConversation,
    createConversation,
    sendMessage,
    sendMessageStream,
    removeConversation,
    removeMessage,
    setError,
    loadRateLimit,
    setActiveConversationId,
  };
}
