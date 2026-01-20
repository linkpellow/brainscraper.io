'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, X, Maximize2, Minimize2 } from 'lucide-react';
import AgentScratchpad from './AgentScratchpad';
import type { AgentState } from '@/utils/ai/agent-rules';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  metadata?: {
    type?: 'suggestion' | 'insight' | 'warning' | 'success';
    action?: {
      label: string;
      onClick: () => void;
    };
  };
};

type AIChatPanelProps = {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  isProcessing?: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  agentState: AgentState;
};

export default function AIChatPanel({
  messages,
  onSendMessage,
  isProcessing = false,
  isExpanded,
  onToggleExpand,
  agentState,
}: AIChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isProcessing) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  return (
    <div
      className={`fixed right-0 top-0 h-full bg-slate-900 border-l border-slate-700 shadow-2xl flex flex-col transition-all duration-300 z-50 ${
        isExpanded ? 'w-[600px]' : 'w-[400px]'
      }`}
    >
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-800/50">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-purple-600 rounded-lg">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">AI Assistant</h3>
            <p className="text-xs text-slate-400">Powered by GPT-4</p>
          </div>
        </div>
        <button
          onClick={onToggleExpand}
          className="p-1.5 hover:bg-slate-700 rounded transition-colors"
          title={isExpanded ? 'Minimize' : 'Expand'}
        >
          {isExpanded ? (
            <Minimize2 className="w-4 h-4 text-slate-400" />
          ) : (
            <Maximize2 className="w-4 h-4 text-slate-400" />
          )}
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="p-4 bg-purple-600/10 rounded-full mb-4">
              <Sparkles className="w-8 h-8 text-purple-400" />
            </div>
            <h4 className="text-lg font-semibold text-white mb-2">
              AI Assistant Ready
            </h4>
            <p className="text-sm text-slate-400 max-w-xs">
              I'll help you build your workflow step by step. Just fill in your goal above and I'll guide you through the process.
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${
                message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
              }`}
            >
              {/* Avatar */}
              <div
                className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                  message.role === 'user'
                    ? 'bg-slate-700'
                    : 'bg-purple-600'
                }`}
              >
                {message.role === 'user' ? (
                  <User className="w-4 h-4 text-white" />
                ) : (
                  <Bot className="w-4 h-4 text-white" />
                )}
              </div>

              {/* Message */}
              <div
                className={`flex-1 ${
                  message.role === 'user' ? 'flex justify-end' : ''
                }`}
              >
                <div
                  className={`inline-block rounded-lg px-4 py-2.5 max-w-[85%] ${
                    message.role === 'user'
                      ? 'bg-slate-700 text-white'
                      : message.metadata?.type === 'success'
                      ? 'bg-green-900/30 border border-green-600/30 text-green-100'
                      : message.metadata?.type === 'warning'
                      ? 'bg-amber-900/30 border border-amber-600/30 text-amber-100'
                      : message.metadata?.type === 'suggestion'
                      ? 'bg-purple-900/30 border border-purple-600/30 text-purple-100'
                      : 'bg-slate-800 text-slate-200'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">
                    {message.content}
                  </p>

                  {/* Action Button */}
                  {message.metadata?.action && (
                    <button
                      onClick={message.metadata.action.onClick}
                      className="mt-3 w-full px-3 py-1.5 bg-purple-600 hover:bg-purple-700 rounded text-xs text-white font-medium transition-colors"
                    >
                      {message.metadata.action.label}
                    </button>
                  )}

                  {/* Timestamp */}
                  <p className="text-xs text-slate-500 mt-1">
                    {new Date(message.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}

        {/* Processing Indicator */}
        {isProcessing && (
          <div className="flex gap-3">
            <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-purple-600">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1">
              <div className="inline-block rounded-lg px-4 py-2.5 bg-slate-800">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-xs text-slate-400">Thinking...</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Agent Scratchpad */}
      <AgentScratchpad state={agentState} />

      {/* Input */}
      <div className="shrink-0 border-t border-slate-700 p-4 bg-slate-800/50">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask me anything..."
            disabled={isProcessing}
            className="flex-1 px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/60 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isProcessing}
            className="p-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:hover:bg-purple-600 rounded-lg transition-colors"
          >
            <Send className="w-4 h-4 text-white" />
          </button>
        </form>
        <p className="text-xs text-slate-500 mt-2">
          Press Enter to send • AI responses may take a few seconds
        </p>
      </div>
    </div>
  );
}
