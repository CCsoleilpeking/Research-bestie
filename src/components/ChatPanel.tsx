import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { ChatMessage } from '../types';
import { genId } from '../utils/id';
import { sendChatMessage, getLLMConfig } from '../utils/llm';

interface Props {
  messages: ChatMessage[];
  onChange: (messages: ChatMessage[]) => void;
  onSelectText: (text: string, position: { x: number; y: number }) => void;
  onSave: (text: string, target: 'summary' | 'insight') => void;
  onNewChat: () => void;
}

function HighlightText({ text, query, activeIndex, startIndex }: { text: string; query: string; activeIndex: number; startIndex: number }) {
  if (!query) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);
  let matchIdx = startIndex;
  return (
    <>
      {parts.map((part, i) => {
        if (regex.test(part)) {
          const idx = matchIdx++;
          return <mark key={i} data-search-match={idx} className={`rounded-sm px-0.5 ${idx === activeIndex ? 'bg-orange-400 text-white' : 'bg-yellow-300 text-dark-600'}`}>{part}</mark>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function countMatches(text: string, query: string): number {
  if (!query) return 0;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (text.match(new RegExp(escaped, 'gi')) || []).length;
}

export default function ChatPanel({ messages, onChange, onSelectText, onSave, onNewChat }: Props) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editHeight, setEditHeight] = useState<number | null>(null);
  const [editWidth, setEditWidth] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const totalMatches = searchQuery
    ? messages.reduce((sum, m) => sum + countMatches(m.content, searchQuery), 0)
    : 0;

  useEffect(() => {
    if (!searchQuery || totalMatches === 0) return;
    const el = chatContainerRef.current?.querySelector(`[data-search-match="${activeMatchIndex}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeMatchIndex, searchQuery, totalMatches]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  useEffect(() => { setActiveMatchIndex(0); }, [searchQuery]);

  const goToNextMatch = useCallback(() => {
    if (totalMatches === 0) return;
    setActiveMatchIndex(prev => (prev + 1) % totalMatches);
  }, [totalMatches]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    console.log('[Chat] User sending:', text.slice(0, 100));
    const userMsg: ChatMessage = { id: genId(), role: 'user', content: text, timestamp: new Date().toISOString() };
    const newMessages = [...messages, userMsg];
    onChange(newMessages);
    setInput('');
    setLoading(true);
    setStreamingContent('');
    try {
      const config = getLLMConfig();
      console.log('[Chat] Config:', { provider: config.provider, model: config.model, hasKey: !!config.apiKey });
      const response = await sendChatMessage(newMessages, config, (chunk) => { setStreamingContent(chunk); });
      console.log('[Chat] Response received, length:', response.length);
      onChange([...newMessages, { id: genId(), role: 'assistant', content: response, timestamp: new Date().toISOString() }]);
    } catch (err) {
      console.error('[Chat] Error:', err);
      onChange([...newMessages, { id: genId(), role: 'assistant', content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`, timestamp: new Date().toISOString() }]);
    } finally {
      setLoading(false);
      setStreamingContent('');
    }
  }

  async function handleEditResend(msgId: string) {
    const text = editText.trim();
    if (!text || loading) return;
    setEditingMsgId(null);

    // Find the message index, update it, and remove everything after it
    const msgIndex = messages.findIndex(m => m.id === msgId);
    if (msgIndex === -1) return;

    const updatedMsg = { ...messages[msgIndex], content: text };
    const newMessages = [...messages.slice(0, msgIndex), updatedMsg];
    onChange(newMessages);

    // Re-send to LLM
    setLoading(true);
    setStreamingContent('');

    try {
      const config = getLLMConfig();
      console.log('[Chat] Edit resend:', text.slice(0, 100));
      const response = await sendChatMessage(newMessages, config, (chunk) => {
        setStreamingContent(chunk);
      });
      onChange([...newMessages, { id: genId(), role: 'assistant', content: response, timestamp: new Date().toISOString() }]);
    } catch (err) {
      console.error('[Chat] Edit resend error:', err);
      onChange([...newMessages, { id: genId(), role: 'assistant', content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`, timestamp: new Date().toISOString() }]);
    } finally {
      setLoading(false);
      setStreamingContent('');
    }
  }

  function handleContextMenu(e: React.MouseEvent) {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (text && text.length > 0) {
      e.preventDefault();
      onSelectText(text, { x: e.clientX, y: e.clientY });
    }
  }

  let globalMatchIndex = 0;

  return (
    <div className="flex flex-col h-full bg-dark-500">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-dark-200 border-b border-dark-50/30">
        <div>
          <h2 className="font-semibold text-white">Research Chat</h2>
          <p className="text-xs text-gray-500">Enter a paper title or ask research questions</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setSearchOpen(!searchOpen); setSearchQuery(''); setTimeout(() => searchRef.current?.focus(), 50); }}
            className="text-gray-500 hover:text-mint-400 p-1"
            title="Search"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
          <button
            onClick={onNewChat}
            className="bg-gradient-to-r from-mint-300 to-mint-600 text-dark-600 px-3 py-1.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            + New Chat
          </button>
        </div>
      </div>

      {/* Search bar */}
      {searchOpen && (
        <div className="px-4 py-2 bg-dark-300 border-b border-dark-50/30 flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={searchRef}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') goToNextMatch(); }}
            placeholder="Search in this chat... (Enter for next)"
            className="flex-1 text-sm border-none outline-none bg-transparent text-white placeholder-gray-600"
          />
          {searchQuery && (
            <span className="text-xs text-gray-500 shrink-0">
              {totalMatches > 0 ? `${activeMatchIndex + 1}/${totalMatches}` : '0 matches'}
            </span>
          )}
          <button onClick={() => { setSearchOpen(false); setSearchQuery(''); }} className="text-gray-500 hover:text-white text-sm">&times;</button>
        </div>
      )}

      {/* Messages */}
      <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4" onContextMenu={handleContextMenu}>
        {messages.length === 0 && !loading && (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">📚</div>
            <p className="text-gray-400 text-sm">Welcome to ResearchBestie!</p>
            <p className="text-gray-600 text-xs mt-1">Enter a paper title to get started, or ask any research question.</p>
            <div className="mt-4 space-y-1 text-xs text-gray-600">
              <p>Examples:</p>
              <p className="italic">"Attention is All You Need"</p>
              <p className="italic">"What are the key differences between BERT and GPT?"</p>
            </div>
          </div>
        )}

        {messages.map((msg) => {
          const q = searchQuery.toLowerCase();
          const isMatch = !q || msg.content.toLowerCase().includes(q);
          const dimmed = q && !isMatch;
          const msgStartIndex = globalMatchIndex;
          globalMatchIndex += countMatches(msg.content, searchQuery);

          return (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} ${dimmed ? 'opacity-20' : ''} transition-opacity`}
          >
            <div className={`max-w-[85%] ${msg.role === 'user' ? '' : 'w-full max-w-[85%]'}`}>
              {/* User message edit mode */}
              {msg.role === 'user' && editingMsgId === msg.id ? (
                <div style={{ width: editWidth ? `${editWidth}px` : undefined }}>
                  <div className="rounded-2xl px-4 py-2.5 bg-dark-100 border border-dark-50/30">
                    <textarea
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      className="w-full text-sm bg-transparent text-gray-200 resize-none focus:outline-none"
                      style={{ height: editHeight ? `${editHeight - 20}px` : undefined, minHeight: '2em' }}
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditResend(msg.id); } }}
                    />
                  </div>
                  <div className="flex gap-2 mt-1.5 justify-end">
                    <button onClick={() => setEditingMsgId(null)} className="text-xs text-gray-500 hover:text-white px-3 py-1">Cancel</button>
                    <button
                      onClick={() => handleEditResend(msg.id)}
                      disabled={loading}
                      className="bg-gradient-to-r from-mint-300 to-mint-600 text-dark-600 text-xs font-semibold px-4 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-30"
                    >
                      Send
                    </button>
                  </div>
                </div>
              ) : (
              <div
                data-msg-id={msg.id}
                className={`rounded-2xl px-4 py-2.5 group ${
                  msg.role === 'user'
                    ? 'bg-dark-100 text-gray-200 border border-dark-50/30'
                    : 'bg-gradient-to-br from-mint-300/10 to-mint-600/10 border border-mint-400/20 text-gray-200'
                } ${q && isMatch ? 'ring-2 ring-mint-400/50' : ''}`}
              >
                {msg.role === 'assistant' ? (
                  searchQuery ? (
                    <div className="text-sm whitespace-pre-wrap break-words">
                      <HighlightText text={msg.content} query={searchQuery} activeIndex={activeMatchIndex} startIndex={msgStartIndex} />
                    </div>
                  ) : (
                    <div className="text-sm prose prose-sm prose-invert max-w-none prose-headings:mt-2 prose-headings:mb-1 prose-headings:text-white prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-pre:my-2 prose-pre:bg-dark-600 prose-code:text-gray-300 prose-code:bg-dark-600 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-strong:text-white prose-a:text-gray-300">
                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{msg.content}</ReactMarkdown>
                    </div>
                  )
                ) : (
                  <div className="text-sm whitespace-pre-wrap break-words">
                    {searchQuery ? (
                      <HighlightText text={msg.content} query={searchQuery} activeIndex={activeMatchIndex} startIndex={msgStartIndex} />
                    ) : (
                      msg.content
                    )}
                  </div>
                )}
                <div className={`text-xs mt-1 flex items-center justify-between ${msg.role === 'user' ? 'text-gray-600' : 'text-gray-600'}`}>
                  <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                  {msg.role === 'user' && !loading && (
                    <button
                      onClick={() => {
                        const el = chatContainerRef.current?.querySelector(`[data-msg-id="${msg.id}"]`) as HTMLElement | null;
                        setEditHeight(el ? el.clientHeight : null);
                        setEditWidth(el ? el.clientWidth : null);
                        setEditingMsgId(msg.id);
                        setEditText(msg.content);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-mint-400 text-xs transition-opacity"
                    >
                      Edit
                    </button>
                  )}
                  {msg.role === 'assistant' && !msg.content.startsWith('Error:') && (
                    <div className="flex gap-1.5">
                      <button onClick={() => onSave(msg.content, 'summary')} className="bg-mint-400/20 text-mint-400 text-xs px-2 py-0.5 rounded-lg hover:bg-mint-400/30">Save to Summary</button>
                      <button onClick={() => onSave(msg.content, 'insight')} className="bg-mint-400/20 text-mint-400 text-xs px-2 py-0.5 rounded-lg hover:bg-mint-400/30">Save to Insights</button>
                    </div>
                  )}
                </div>
              </div>
              )}
            </div>
          </div>
          );
        })}

        {loading && streamingContent && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl px-4 py-2.5 bg-gradient-to-br from-mint-300/10 to-mint-600/10 border border-mint-400/20 text-gray-200">
              <div className="text-sm prose prose-sm prose-invert max-w-none prose-headings:text-white prose-code:text-gray-300 prose-code:bg-dark-600 prose-strong:text-white">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{streamingContent}</ReactMarkdown>
              </div>
              <div className="text-xs mt-1 text-gray-600">Typing...</div>
            </div>
          </div>
        )}

        {loading && !streamingContent && (
          <div className="flex justify-start">
            <div className="bg-dark-100 border border-dark-50/30 rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-mint-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-2 h-2 bg-mint-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-2 h-2 bg-mint-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 bg-dark-200 border-t border-dark-50/30">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Enter paper title or research question..."
            className="flex-1 border border-dark-50/30 rounded-xl px-4 py-2.5 text-sm bg-dark-400 text-white placeholder-gray-600 focus:ring-2 focus:ring-mint-400/30 focus:border-transparent focus:outline-none"
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="bg-gradient-to-r from-mint-300 to-mint-600 text-dark-600 px-5 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
