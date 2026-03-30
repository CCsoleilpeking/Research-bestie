import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { ChatMessage } from '../types';
import { genId } from '../utils/id';
import { sendChatMessage, getLLMConfig, subscribeFigures } from '../utils/llm';
import type { FigureInfo } from '../utils/llm';
import { API_URL } from '../utils/api';

interface Props {
  messages: ChatMessage[];
  onChange: (messages: ChatMessage[]) => void;
  onSelectText: (text: string, position: { x: number; y: number }) => void;
  onSave: (text: string, target: 'summary' | 'insight') => void;
  onNewChat: () => void;
  sessionId?: string;
  quotedText?: string;
  onQuoteClear?: () => void;
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

export default function ChatPanel({ messages, onChange, onSelectText, onSave, onNewChat, sessionId, quotedText, onQuoteClear }: Props) {
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
  const isComposingRef = useRef(false);
  const [loadingHint, setLoadingHint] = useState('');
  const loadingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const usedHintsRef = useRef<Set<number>>(new Set());
  const [uploadedFiles, setUploadedFiles] = useState<{ filename: string; contentText: string; docId: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFigures, setPendingFigures] = useState(false);
  const [figures, setFigures] = useState<FigureInfo[]>([]);
  const [figuresForMsgId, setFiguresForMsgId] = useState<string | null>(null);
  const [searchStatus, setSearchStatus] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const MAX_FILES = 4;
  const MAX_SIZE_MB = 10;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const LOADING_HINTS = [
    "I'm on it — go play on your phone.",
    "I'm working here — scroll something fun.",
    "Busy working — phone break for you.",
    "Still working — go tap around a little.",
    "Hang tight-ish — go entertain yourself.",
    "I'm working — go grab a snack.",
    "Still busy — snack time?",
    "Let me work — you go find a treat.",
    "I'm doing the hard part — you grab chips.",
    "Working away — go reward yourself with a snack.",
    "I'm working very hard — a little water would be nice.",
    "I'm doing the hard part — where's my snack?",
    "I'm suffering for this — at least bring me a drink.",
    "I'm working overtime — a shoulder rub seems fair.",
    "I'm carrying this search — the least you can do is bring snacks.",
    "Doing my thing — go be adorable somewhere else.",
    "Working hard — please distract yourself.",
    "Cooking up results — go cause harmless chaos.",
    "Making progress — go poke at your phone.",
    "Searching in style — you go vibe for a minute.",
    "I'm fighting for my life in here — go get a snack.",
    "I'm working my little heart out — scroll something nice.",
    "I'm doing wizard stuff — you go chill.",
    "I'm out here suffering beautifully — bring me water.",
    "I'm giving this everything I've got — go snack responsibly.",
  ];

  function getRandomHint() {
    if (usedHintsRef.current.size >= LOADING_HINTS.length) usedHintsRef.current.clear();
    let idx: number;
    do { idx = Math.floor(Math.random() * LOADING_HINTS.length); } while (usedHintsRef.current.has(idx));
    usedHintsRef.current.add(idx);
    return LOADING_HINTS[idx];
  }

  useEffect(() => {
    if (loading && !streamingContent) {
      // After 3 seconds, start showing hints
      const timeout = setTimeout(() => {
        setLoadingHint(getRandomHint());
        // Then rotate every 5 seconds
        loadingTimerRef.current = setInterval(() => {
          setLoadingHint(getRandomHint());
        }, 5000);
      }, 3000);
      return () => {
        clearTimeout(timeout);
        if (loadingTimerRef.current) clearInterval(loadingTimerRef.current);
        setLoadingHint('');
      };
    } else {
      setLoadingHint('');
      if (loadingTimerRef.current) { clearInterval(loadingTimerRef.current); loadingTimerRef.current = null; }
    }
  }, [loading, streamingContent]);

  const totalMatches = searchQuery
    ? messages.reduce((sum, m) => sum + countMatches(m.content, searchQuery), 0)
    : 0;

  useEffect(() => {
    if (!searchQuery || totalMatches === 0) return;
    const el = chatContainerRef.current?.querySelector(`[data-search-match="${activeMatchIndex}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeMatchIndex, searchQuery, totalMatches]);

  // Auto-resize textarea when input changes
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 200) + 'px';
    }
  }, [input]);

  // Fill input with quoted text and position cursor after quote
  useEffect(() => {
    if (quotedText) {
      const quote = `${quotedText}\n\n`;
      setInput(quote);
      onQuoteClear?.();
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.selectionStart = quote.length;
          inputRef.current.selectionEnd = quote.length;
        }
      }, 50);
    }
  }, [quotedText, onQuoteClear]);

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

    // If files uploaded, display filenames but send content to LLM
    let displayContent = text;
    let llmContent = text;
    if (uploadedFiles.length > 0) {
      const fileNames = uploadedFiles.map(f => `📎 ${truncateFilename(f.filename)}`).join('\n');
      displayContent = `${fileNames}\n\n${text}`;
      const fileContents = uploadedFiles.map((f, i) =>
        `[File ${i + 1}: ${f.filename}, doc_id: ${f.docId}]\n${f.contentText.slice(0, 30000)}`
      ).join('\n\n---\n\n');
      llmContent = `${fileContents}\n\n---\nUser question: ${text}`;
      setUploadedFiles([]);
    }

    const userMsg: ChatMessage = { id: genId(), role: 'user', content: displayContent, timestamp: new Date().toISOString() };
    // For LLM, replace user message content with full file content
    const llmMessages = [...messages, { ...userMsg, content: llmContent }];
    const newMessages = [...messages, userMsg];
    onChange(newMessages);
    setInput('');
    if (inputRef.current) inputRef.current.style.height = '42px';
    setLoading(true);
    setStreamingContent('');
    try {
      const config = getLLMConfig();
      console.log('[Chat] Config:', { provider: config.provider, model: config.model, hasKey: !!config.apiKey });
      const statusMap: Record<string, string> = {
        searching: 'Searching the web...',
        crawling: 'Reading full content...',
        answering: 'Generating answer...',
      };
      const response = await sendChatMessage(
        llmMessages, config,
        (chunk) => { setStreamingContent(chunk); },
        sessionId,
        (status) => { setSearchStatus(statusMap[status] || ''); },
      );
      console.log('[Chat] Response received, length:', response.content.length, 'figures:', response.figures.length);
      const assistantMsgId = genId();
      onChange([...newMessages, { id: assistantMsgId, role: 'assistant', content: response.content, timestamp: new Date().toISOString() }]);

      // Show figures if any
      if (response.figures.length > 0) {
        console.log('[Chat] Setting figures for msgId:', assistantMsgId, 'count:', response.figures.length);
        setFiguresForMsgId(assistantMsgId);
        setFigures(response.figures);
      }
    } catch (err) {
      console.error('[Chat] Error:', err);
      onChange([...newMessages, { id: genId(), role: 'assistant', content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`, timestamp: new Date().toISOString() }]);
    } finally {
      setLoading(false);
      setStreamingContent('');
      setSearchStatus('');
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
      onChange([...newMessages, { id: genId(), role: 'assistant', content: response.content, timestamp: new Date().toISOString() }]);
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

  function truncateFilename(name: string, max = 20): string {
    if (name.length <= max) return name;
    const ext = name.lastIndexOf('.') >= 0 ? name.slice(name.lastIndexOf('.')) : '';
    const base = name.slice(0, name.lastIndexOf('.') >= 0 ? name.lastIndexOf('.') : name.length);
    return base.slice(0, max - ext.length - 3) + '...' + ext;
  }

  async function uploadSingleFile(file: File) {
    // Size check
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setUploadError(`File "${truncateFilename(file.name)}" is too large (max ${MAX_SIZE_MB}MB)`);
      return;
    }
    // Count check
    if (uploadedFiles.length >= MAX_FILES) {
      setUploadError(`Maximum ${MAX_FILES} files allowed`);
      return;
    }

    setUploadError('');
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (sessionId) formData.append('sessionId', sessionId);

      const response = await fetch(`${API_URL}/api/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Upload failed');
      }

      const data = await response.json();
      console.log('[Chat] File uploaded:', data.filename, data.contentLength, 'chars');
      setUploadedFiles(prev => [...prev, { filename: data.filename, contentText: data.contentText, docId: data.docId }]);
    } catch (err) {
      console.error('[Chat] Upload error:', err);
      setUploadError(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      await uploadSingleFile(files[i]);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    for (let i = 0; i < files.length; i++) {
      uploadSingleFile(files[i]);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
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
                      onCompositionStart={() => { isComposingRef.current = true; }}
                      onCompositionEnd={() => { isComposingRef.current = false; }}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !isComposingRef.current) { e.preventDefault(); handleEditResend(msg.id); } }}
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
                  {msg.role === 'assistant' && !msg.content.includes('Error') && (
                    <div className="flex gap-1.5">
                      <button onClick={() => onSave(msg.content, 'summary')} className="bg-mint-400/20 text-mint-400 text-xs px-2 py-0.5 rounded-lg hover:bg-mint-400/30">Save to Summary</button>
                      <button onClick={() => onSave(msg.content, 'insight')} className="bg-mint-400/20 text-mint-400 text-xs px-2 py-0.5 rounded-lg hover:bg-mint-400/30">Save to Insights</button>
                    </div>
                  )}
                </div>
              </div>
              )}

              {/* Figures for this message */}
              {msg.id === figuresForMsgId && figures.length > 0 && (
                <div className="mt-3 space-y-3">
                  <div className="text-xs text-mint-400 font-semibold">Paper Figures:</div>
                  <div className="grid grid-cols-2 gap-2">
                    {figures.map(fig => (
                      <div key={fig.id} className="bg-dark-400 rounded-lg overflow-hidden border border-dark-50/30">
                        <img src={fig.url} alt={fig.caption || 'Figure'} className="w-full cursor-pointer hover:opacity-80" onClick={() => window.open(fig.url, '_blank')} />
                        {fig.caption && <p className="text-xs text-gray-400 p-2">{fig.caption}</p>}
                      </div>
                    ))}
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
              {searchStatus && (
                <p className="text-xs text-mint-400 mt-2 font-medium">{searchStatus}</p>
              )}
              {!searchStatus && loadingHint && (
                <p className="text-xs text-gray-500 mt-2 italic transition-opacity duration-500">{loadingHint}</p>
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 bg-dark-500">
        <div
          className={`bg-dark-300 rounded-2xl border ${dragOver ? 'border-mint-400' : 'border-dark-50/30'} p-3 flex flex-col`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          {/* File tags + errors inside the box */}
          {uploadedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {uploadedFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 bg-mint-400/10 border border-mint-400/20 rounded-lg text-xs text-mint-400">
                  <span>📎 {truncateFilename(f.filename)}</span>
                  <button onClick={() => setUploadedFiles(prev => prev.filter((_, j) => j !== i))} className="text-gray-500 hover:text-white text-sm">&times;</button>
                </div>
              ))}
            </div>
          )}
          {uploading && (
            <div className="text-xs text-gray-400 mb-2">Uploading...</div>
          )}
          {uploadError && (
            <div className="flex items-center gap-2 mb-2 text-xs text-red-400">
              <span>{uploadError}</span>
              <button onClick={() => setUploadError('')} className="text-gray-500 hover:text-white">&times;</button>
            </div>
          )}
          {dragOver && (
            <div className="text-center py-2 mb-2 text-xs text-mint-400">Drop files here</div>
          )}

          {/* Textarea */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
            }}
            onCompositionStart={() => { isComposingRef.current = true; }}
            onCompositionEnd={() => { isComposingRef.current = false; }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !isComposingRef.current) { e.preventDefault(); handleSend(); } }}
            placeholder={uploadedFiles.length > 0 ? "Ask about the uploaded files..." : "Enter paper title or research question..."}
            className="w-full bg-transparent text-sm text-white placeholder-gray-600 focus:outline-none resize-none overflow-y-auto"
            style={{ minHeight: '24px', maxHeight: '200px' }}
            rows={1}
            disabled={loading}
          />

          {/* Bottom bar: attach left, send right */}
          <div className="flex items-center justify-between mt-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.pptx,.xlsx,.odt,.odp,.ods,.rtf,.txt,.md,.html,.htm,.csv"
              onChange={handleFileUpload}
              multiple
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading || uploading || uploadedFiles.length >= MAX_FILES}
              className="text-gray-500 hover:text-mint-400 text-lg disabled:opacity-30 transition-colors"
              title={uploadedFiles.length >= MAX_FILES ? `Maximum ${MAX_FILES} files` : 'Upload file'}
            >
              📎
            </button>
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-gradient-to-r from-mint-300 to-mint-600 text-dark-600 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity hover:opacity-90"
              title="Send"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
