'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, X, Maximize2, Minimize2 } from 'lucide-react';

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
};

export default function AIChatPanel({
  messages,
  onSendMessage,
  isProcessing = false,
  isExpanded,
  onToggleExpand,
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
        isExpanded ? 'w-[420px]' : 'w-[280px]'
      }`}
      style={{ fontSize: '11px' }}
    >
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-slate-700 bg-slate-800/50">
        <div className="flex items-center gap-1.5">
          <div className="p-1 bg-purple-600 rounded-lg">
            <Bot className="w-3 h-3 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-white" style={{ fontSize: '11px' }}>AI Assistant</h3>
            <p className="text-slate-400" style={{ fontSize: '9px' }}>Powered by GPT-4</p>
          </div>
        </div>
        <button
          onClick={onToggleExpand}
          className="p-1 hover:bg-slate-700 rounded transition-colors"
          title={isExpanded ? 'Minimize' : 'Expand'}
        >
          {isExpanded ? (
            <Minimize2 className="w-3 h-3 text-slate-400" />
          ) : (
            <Maximize2 className="w-3 h-3 text-slate-400" />
          )}
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="p-2.5 bg-purple-600/10 rounded-full mb-3">
              <Sparkles className="w-5 h-5 text-purple-400" />
            </div>
            <h4 className="font-semibold text-white mb-1.5" style={{ fontSize: '12px' }}>
              AI Assistant Ready
            </h4>
            <p className="text-slate-400 max-w-xs" style={{ fontSize: '10px' }}>
              I'll help you build your workflow step by step. Just fill in your goal above and I'll guide you through the process.
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-2 ${
                message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
              }`}
            >
              {/* Avatar */}
              <div
                className={`shrink-0 w-6 h-6 rounded-lg flex items-center justify-center ${
                  message.role === 'user'
                    ? 'bg-slate-700'
                    : 'bg-purple-600'
                }`}
              >
                {message.role === 'user' ? (
                  <User className="w-3 h-3 text-white" />
                ) : (
                  <Bot className="w-3 h-3 text-white" />
                )}
              </div>

              {/* Message */}
              <div
                className={`flex-1 ${
                  message.role === 'user' ? 'flex justify-end' : ''
                }`}
              >
                <div
                  className={`inline-block rounded-lg px-2.5 py-1.5 max-w-[85%] ${
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
                  <p className="whitespace-pre-wrap" style={{ fontSize: '10px', lineHeight: '1.4' }}>
                    {message.content}
                  </p>

                  {/* Action Button */}
                  {message.metadata?.action && (
                    <button
                      onClick={message.metadata.action.onClick}
                      className="mt-2 w-full px-2 py-1 bg-purple-600 hover:bg-purple-700 rounded text-white font-medium transition-colors"
                      style={{ fontSize: '9px' }}
                    >
                      {message.metadata.action.label}
                    </button>
                  )}

                  {/* Timestamp */}
                  <p className="text-slate-500 mt-0.5" style={{ fontSize: '8px' }}>
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
          <div className="flex gap-2">
            <div className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center bg-purple-600">
              <Bot className="w-3 h-3 text-white" />
            </div>
            <div className="flex-1">
              <div className="inline-block rounded-lg px-2.5 py-1.5 bg-slate-800">
                <div className="flex items-center gap-1.5">
                  <div className="flex gap-0.5">
                    <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-slate-400" style={{ fontSize: '9px' }}>Thinking...</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-slate-700 p-2.5 bg-slate-800/50">
        <form onSubmit={handleSubmit} className="flex gap-1.5">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask me anything..."
            disabled={isProcessing}
            className="flex-1 px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/60 disabled:opacity-50"
            style={{ fontSize: '10px' }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isProcessing}
            className="p-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:hover:bg-purple-600 rounded-lg transition-colors"
          >
            <Send className="w-3 h-3 text-white" />
          </button>
        </form>
        <p className="text-slate-500 mt-1.5" style={{ fontSize: '8px' }}>
          Press Enter to send • AI responses may take a few seconds
        </p>
      </div>
    </div>
  );
}
