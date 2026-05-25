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

  // Send a message
  const sendMessage = useCallback(async (text, screenshot) => {
    if ((!text.trim() && !screenshot) || isSending) return;

    // If there's no text but there's a screenshot, send a default prompt
    const messageText = text.trim() || 'What do you see on my screen?';

    let conversationId = activeConversationId;

    // Create a new conversation if none is active
    if (!conversationId) {
      const conversation = await createConversation();
      if (!conversation) return;
      conversationId = conversation.id;
    }

    setIsSending(true);
    setError(null);

    // Optimistically add user message
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

    // Reset searching state and check if search might be needed (for immediate indicator)
    const searchKeywords = ['latest', 'news', 'today', '2025', '2026', 'recent', 'current', 'weather', 'stock', 'price', 'what happened'];
    const mightNeedSearch = searchKeywords.some(keyword => messageText.toLowerCase().includes(keyword));
    setIsSearching(mightNeedSearch);

    try {
      const response = await api.sendMessage(conversationId, messageText, screenshot);

      // Add AI response
      const aiMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: response.message,
        isSearching: response.isSearching, // Store if search was used
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, aiMessage]);

      // Update rate limit
      if (response.rateLimit) {
        setRateLimit((prev) => ({
          ...prev,
          remaining: response.rateLimit.remaining,
          used: prev?.limit - response.rateLimit.remaining,
        }));
      }

      // Refresh conversations to update title/preview
      loadConversations();
      scrollToBottom();
      return response;
    } catch (err) {
      setError(err.data?.error || err.message);

      // If rate limited, refresh rate limit info
      if (err.status === 429) {
        loadRateLimit();
      }
    } finally {
      setIsSending(false);
      setIsSearching(false);
    }
  }, [activeConversationId, isSending, createConversation, loadConversations, scrollToBottom, loadRateLimit]);

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
    removeConversation,
    setError,
    loadRateLimit,
    setActiveConversationId,
  };
}
