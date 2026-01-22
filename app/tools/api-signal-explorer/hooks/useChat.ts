/**
 * Custom hook for managing chat state and operations
 */

import { useState, useEffect, useCallback } from 'react';
import type { ChatMessage } from '../AIChatPanel';
import type { AgentState } from '@/utils/ai/agent-rules';
import { getInitialAgentState } from '@/utils/ai/agent-rules';

type ConversationStep = 'goal' | 'constraints' | 'target' | 'complete' | null;

export function useChat(
  onStepLocked?: (stepNumber: number) => void
) {
  const [chatExpanded, setChatExpanded] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatProcessing, setChatProcessing] = useState(false);
  const [conversationStep, setConversationStep] = useState<ConversationStep>('goal');
  const [agentState, setAgentState] = useState<AgentState>(getInitialAgentState());
  
  // Goal/Constraints state
  const [userGoal, setUserGoal] = useState('');
  const [userConstraints, setUserConstraints] = useState('');
  const [targetData, setTargetData] = useState('');

  const addChatMessage = useCallback((role: 'user' | 'assistant', content: string, metadata?: ChatMessage['metadata']) => {
    const message: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random()}`,
      role, 
      content, 
      timestamp: Date.now(), 
      metadata,
    };
    setChatMessages(prev => [...prev, message]);
  }, []);

  const handleChatMessage = useCallback(async (userMessage: string) => {
    addChatMessage('user', userMessage);
    setChatProcessing(true);
    try {
      if (conversationStep && conversationStep !== 'complete') {
        // Handle setup steps
        if (conversationStep === 'goal') {
          setUserGoal(userMessage);
          addChatMessage('assistant', `✓ Goal locked: **"${userMessage}"**\n\n**What constraints should I know about?**`);
          setConversationStep('constraints');
        } else if (conversationStep === 'constraints') {
          setUserConstraints(userMessage);
          addChatMessage('assistant', `✓ Constraints locked.\n\n**What's your target data structure?**`);
          setConversationStep('target');
        } else if (conversationStep === 'target') {
          setTargetData(userMessage);
          addChatMessage('assistant', `✅ **Setup Complete**\n\nReady to capture API traffic. Launch a session to begin.`);
          setConversationStep('complete');
        }
      } else {
        addChatMessage('assistant', "I'm analyzing your current workspace. How can I help you optimize this workflow?");
      }
    } finally { 
      setChatProcessing(false); 
    }
  }, [conversationStep, addChatMessage]);

  // Initial welcome message
  useEffect(() => {
    if (chatMessages.length === 0) {
      addChatMessage('assistant', "**Specify your goal.** Use action verbs like 'Fetch', 'Search', or 'Create'.");
    }
  }, [chatMessages.length, addChatMessage]);

  return {
    chatExpanded,
    chatMessages,
    chatProcessing,
    conversationStep,
    agentState,
    userGoal,
    userConstraints,
    targetData,
    setChatExpanded,
    setAgentState,
    handleChatMessage,
    addChatMessage,
  };
}
