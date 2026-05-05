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
  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || isSending) return;

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
    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: text.trim(),
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    scrollToBottom();

    try {
      const response = await api.sendMessage(conversationId, text.trim());

      // Add AI response
      const aiMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: response.message,
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
    } catch (err) {
      setError(err.data?.error || err.message);

      // If rate limited, refresh rate limit info
      if (err.status === 429) {
        loadRateLimit();
      }
    } finally {
      setIsSending(false);
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
