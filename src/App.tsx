import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocalStorage } from './hooks/useLocalStorage';
import type { ChatMessage, ChatSession, DailySummaryItem, TodoItem, InsightItem, TodayPaper } from './types';
import { genId } from './utils/id';
import { generateChatTitle, getLLMConfig } from './utils/llm';
import { fetchSessions, createSessionAPI, updateSessionAPI, deleteSessionAPI, fetchMessages, addMessageAPI, deleteMessagesAfterAPI, checkBackendHealth } from './utils/api';
import DailySummary from './components/DailySummary';
import TodoList from './components/TodoList';
import InsightsList from './components/InsightsList';
import TodayPapers from './components/TodayPapers';
import ChatPanel from './components/ChatPanel';
import ChatSessionList from './components/ChatSessionList';
import SettingsModal from './components/SettingsModal';
import SaveToModulePopup from './components/SaveToModulePopup';
import OverlayPanel from './components/OverlayPanel';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import MarkdownEditor from './components/MarkdownEditor';
import WelcomeBack from './components/WelcomeBack';
import './App.css';

function App() {
  // These stay in localStorage (not migrated to backend)
  const [dailySummaries, setDailySummaries] = useLocalStorage<DailySummaryItem[]>('rb_daily', []);
  const [todos, setTodos] = useLocalStorage<TodoItem[]>('rb_todos', []);
  const [insights, setInsights] = useLocalStorage<InsightItem[]>('rb_insights', []);
  const [todayPapers, setTodayPapers] = useLocalStorage<TodayPaper[]>('rb_today_papers', []);

  // Sessions & messages: backend API (with localStorage fallback)
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [activeMessages, setActiveMessages] = useState<ChatMessage[]>([]);
  const [backendReady, setBackendReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const syncingRef = useRef(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  const [showPopup, setShowPopup] = useState(false);
  const [overlayPanel, setOverlayPanel] = useState<'summary' | 'insights' | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [editingInsightId, setEditingInsightId] = useState<string | null>(null);
  const [summaryCloseSignal, setSummaryCloseSignal] = useState(0);
  const [summaryFlashSignal, setSummaryFlashSignal] = useState(0);
  const [insightsFlashSignal, setInsightsFlashSignal] = useState(0);
  const [papersFlashSignal, setPapersFlashSignal] = useState(0);
  const [quotedText, setQuotedText] = useState('');

  const today = new Date().toISOString().slice(0, 10);
  const todayPapersFiltered = todayPapers.filter(p => p.addedAt.slice(0, 10) === today);
  const todayInsights = insights.filter(i => i.createdAt.slice(0, 10) === today);

  // --- Initialize: load sessions from backend or create first session ---
  useEffect(() => {
    async function init() {
      const healthy = await checkBackendHealth();
      setBackendReady(healthy);

      if (healthy) {
        console.log('[App] Backend connected');
        try {
          const dbSessions = await fetchSessions();
          if (dbSessions.length > 0) {
            // Load sessions from DB, messages will be loaded on select
            const sessionsWithMessages = dbSessions.map((s: ChatSession) => ({ ...s, messages: [] }));
            setSessions(sessionsWithMessages);
            setActiveId(dbSessions[0].id);
            // Load messages for active session
            const msgs = await fetchMessages(dbSessions[0].id);
            setActiveMessages(msgs);
          } else {
            // No sessions in DB, create first one
            const s = { id: genId(), title: 'New Chat', messages: [] as ChatMessage[], createdAt: new Date().toISOString() };
            await createSessionAPI(s.id, s.title, s.createdAt);
            setSessions([s]);
            setActiveId(s.id);
            setActiveMessages([]);
          }
        } catch (err) {
          console.error('[App] Failed to load from backend:', err);
          initFallback();
        }
      } else {
        console.log('[App] Backend not available, using localStorage');
        initFallback();
      }
      setLoading(false);
    }

    function initFallback() {
      const stored = localStorage.getItem('rb_sessions');
      if (stored) {
        const parsed = JSON.parse(stored);
        setSessions(parsed);
        setActiveId(parsed[0]?.id || '');
        setActiveMessages(parsed[0]?.messages || []);
      } else {
        const s = { id: genId(), title: 'New Chat', messages: [] as ChatMessage[], createdAt: new Date().toISOString() };
        setSessions([s]);
        setActiveId(s.id);
        setActiveMessages([]);
      }
    }

    init();
  }, []);

  // Welcome back
  useEffect(() => {
    if (!loading && (todayPapersFiltered.length > 0 || todayInsights.length > 0)) {
      setShowWelcome(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // --- Load messages when switching session ---
  const handleSelectSession = useCallback(async (id: string) => {
    setActiveId(id);
    setOverlayPanel(null);
    if (backendReady) {
      try {
        const msgs = await fetchMessages(id);
        setActiveMessages(msgs);
      } catch (err) {
        console.error('[App] Failed to load messages:', err);
        const session = sessions.find(s => s.id === id);
        setActiveMessages(session?.messages || []);
      }
    } else {
      const session = sessions.find(s => s.id === id);
      setActiveMessages(session?.messages || []);
    }
  }, [backendReady, sessions]);

  // --- Popup close ---
  useEffect(() => {
    function handleClick() { setShowPopup(false); }
    if (showPopup) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [showPopup]);

  function handleSelectText(text: string, position: { x: number; y: number }) {
    setSelectedText(text);
    setPopupPosition(position);
    setShowPopup(true);
  }

  function handleSaveToModule(target: 'paper' | 'summary' | 'insight', overrideText?: string) {
    const text = (overrideText || selectedText).trim();
    if (!text) return;

    if (target === 'paper') {
      setTodayPapers(prev => [...prev, { id: genId(), title: text, addedAt: new Date().toISOString() }]);
      setPapersFlashSignal(s => s + 1);
    } else if (target === 'summary') {
      const existing = dailySummaries.find(s => s.date === today);
      if (existing) {
        const frags = existing.fragments || (existing.content ? [existing.content] : []);
        setDailySummaries(dailySummaries.map(s =>
          s.id === existing.id ? { ...s, content: [...frags, text].join('\n\n'), fragments: [...frags, text] } : s
        ));
      } else {
        setDailySummaries([{ id: genId(), date: today, content: text, fragments: [text] }, ...dailySummaries]);
      }
      setSummaryFlashSignal(s => s + 1);
    } else if (target === 'insight') {
      setInsights([{ id: genId(), content: text, createdAt: new Date().toISOString() }, ...insights]);
      setInsightsFlashSignal(s => s + 1);
    }

    setShowPopup(false);
    setSelectedText('');
  }

  // --- Session CRUD ---
  async function handleNewSession() {
    const s: ChatSession = { id: genId(), title: 'New Chat', messages: [], createdAt: new Date().toISOString() };
    setSessions(prev => [s, ...prev]);
    setActiveId(s.id);
    setActiveMessages([]);
    if (backendReady) {
      try { await createSessionAPI(s.id, s.title, s.createdAt); } catch (err) { console.error('[App] Create session error:', err); }
    }
  }

  async function handleDeleteSession(id: string) {
    setSessions(prev => {
      const next = prev.filter(s => s.id !== id);
      if (next.length === 0) {
        const s: ChatSession = { id: genId(), title: 'New Chat', messages: [], createdAt: new Date().toISOString() };
        next.push(s);
        setActiveId(s.id);
        setActiveMessages([]);
        if (backendReady) { createSessionAPI(s.id, s.title, s.createdAt).catch(console.error); }
      } else if (id === activeId) {
        setActiveId(next[0].id);
        if (backendReady) { fetchMessages(next[0].id).then(setActiveMessages).catch(console.error); }
        else { setActiveMessages(next[0].messages || []); }
      }
      return next;
    });
    if (backendReady) {
      try { await deleteSessionAPI(id); } catch (err) { console.error('[App] Delete session error:', err); }
    }
  }

  async function handleRenameSession(id: string, title: string) {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, title } : s));
    if (backendReady) {
      try { await updateSessionAPI(id, { title }); } catch (err) { console.error('[App] Rename error:', err); }
    }
  }

  function handleArchiveSession(id: string) {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, archived: !s.archived } : s));
    if (backendReady) {
      const session = sessions.find(s => s.id === id);
      updateSessionAPI(id, { archived: !session?.archived }).catch(console.error);
    }
  }

  // --- Messages change ---
  async function handleMessagesChange(messages: ChatMessage[]) {
    const prevMessages = activeMessages;
    setActiveMessages(messages);

    // Update session in state
    const currentSession = sessions.find(s => s.id === activeId);
    const needsTitle = currentSession?.title === 'New Chat' && messages.length > 0;
    const firstUser = needsTitle ? messages.find(m => m.role === 'user') : null;

    setSessions(prev => prev.map(s => {
      if (s.id !== activeId) return s;
      return { ...s, messages };
    }));

    // Sync new messages to backend (fire and forget, no lock)
    if (backendReady) {
      const prevIds = new Set(prevMessages.map(m => m.id));
      const newMsgs = messages.filter(m => !prevIds.has(m.id));

      // If messages were deleted (edit+resend), sync deletions first
      if (messages.length < prevMessages.length) {
        const currentIds = new Set(messages.map(m => m.id));
        const deletedMsg = prevMessages.find(m => !currentIds.has(m.id));
        if (deletedMsg) {
          deleteMessagesAfterAPI(activeId, deletedMsg.timestamp).catch(err => console.error('[App] Delete sync error:', err));
        }
      }

      // Add new messages
      for (const msg of newMsgs) {
        addMessageAPI(activeId, { id: msg.id, role: msg.role, content: msg.content, timestamp: msg.timestamp })
          .catch(err => console.error('[App] Add message sync error:', err));
      }
    }

    // Generate title asynchronously
    if (firstUser) {
      const config = getLLMConfig();
      generateChatTitle(firstUser.content, config).then(title => {
        setSessions(prev => prev.map(s => {
          if (s.id !== activeId) return s;
          if (s.title !== 'New Chat') return s;
          return { ...s, title };
        }));
        if (backendReady) { updateSessionAPI(activeId, { title }).catch(console.error); }
      });
    }
  }

  // --- Fallback: save to localStorage when backend not available ---
  useEffect(() => {
    if (!backendReady && sessions.length > 0) {
      localStorage.setItem('rb_sessions', JSON.stringify(sessions));
    }
  }, [sessions, backendReady]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-600">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-dark-600">
      {/* Left Sidebar */}
      <div className="w-[360px] bg-dark-400 border-r border-dark-50/30 flex flex-col h-screen">
        {/* Sidebar Header */}
        <div className="px-4 py-4 bg-dark-200 border-b border-dark-50/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📚</span>
            <div>
              <h1 className="font-bold text-lg text-white">ResearchBestie</h1>
              <p className="text-xs text-gray-500">Your research companion</p>
            </div>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="text-gray-500 hover:text-mint-400 flex flex-col items-center gap-0.5"
            title="Settings"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-[10px] text-gray-500">setup LLM</span>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-3">
          <ChatSessionList
            sessions={sessions}
            activeId={activeId}
            onSelect={handleSelectSession}
            onNew={handleNewSession}
            onDelete={handleDeleteSession}
            onRename={handleRenameSession}
          />
          <div className="border-t border-dark-50/20 my-3" />
          <InsightsList items={insights} onChange={setInsights} onShowPanel={() => { setOverlayPanel('insights'); setSummaryCloseSignal(s => s + 1); }} flashSignal={insightsFlashSignal} />
          <div className="border-t border-dark-50/20 my-3" />
          <DailySummary items={dailySummaries} onChange={setDailySummaries} insights={insights} onChangeInsights={setInsights} todayPapers={todayPapers} todos={todos} onPanelOpen={() => { setOverlayPanel(null); setEditingInsightId(null); }} closeSignal={summaryCloseSignal} flashSignal={summaryFlashSignal} />
          <div className="border-t border-dark-50/20 my-3" />
          <TodoList items={todos} onChange={setTodos} />
          <div className="border-t border-dark-50/20 my-3" />
          <TodayPapers items={todayPapers} onChange={setTodayPapers} flashSignal={papersFlashSignal} />
        </div>
      </div>

      {/* Right Chat Panel */}
      <div className="flex-1 h-screen relative">
        <ChatPanel
          messages={activeMessages}
          onChange={handleMessagesChange}
          onSelectText={handleSelectText}
          onSave={(text, target) => handleSaveToModule(target, text)}
          onNewChat={handleNewSession}
          sessionId={activeId}
          quotedText={quotedText}
          onQuoteClear={() => setQuotedText('')}
        />

        {overlayPanel === 'insights' && !editingInsightId && (
          <OverlayPanel title="Insights" onClose={() => setOverlayPanel(null)}>
            <div className="space-y-6">
              {insights.map(item => (
                <div key={item.id} className="border-b border-dark-50/20 pb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-600">{new Date(item.createdAt).toLocaleDateString()}</span>
                    <div className="flex gap-3">
                      <button onClick={() => setEditingInsightId(item.id)} className="text-xs text-gray-400 hover:text-mint-400">Edit</button>
                      <button onClick={() => setInsights(insights.filter(i => i.id !== item.id))} className="text-xs text-gray-400 hover:text-red-400">Delete</button>
                    </div>
                  </div>
                  <div className="prose prose-sm prose-invert max-w-none prose-headings:text-white prose-strong:text-white prose-code:text-gray-300 prose-a:text-gray-300">
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{item.content}</ReactMarkdown>
                  </div>
                </div>
              ))}
              {insights.length === 0 && <p className="text-gray-500 text-sm">No insights yet.</p>}
            </div>
          </OverlayPanel>
        )}

        {editingInsightId && (() => {
          const item = insights.find(i => i.id === editingInsightId);
          if (!item) return null;
          return (
            <MarkdownEditor
              title="Editing Insight"
              value={item.content}
              onSave={(v) => { setInsights(insights.map(i => i.id === editingInsightId ? { ...i, content: v } : i)); setEditingInsightId(null); }}
              onCancel={() => setEditingInsightId(null)}
            />
          );
        })()}
      </div>

      {/* Welcome Back */}
      {showWelcome && (
        <WelcomeBack
          papers={todayPapersFiltered}
          insights={todayInsights}
          onClose={() => setShowWelcome(false)}
        />
      )}

      {/* Settings Modal */}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Save to Module Popup */}
      {showPopup && (
        <SaveToModulePopup
          selectedText={selectedText}
          position={popupPosition}
          onSave={handleSaveToModule}
          onQuote={(text) => { setQuotedText(text); setShowPopup(false); }}
          onClose={() => setShowPopup(false)}
        />
      )}

    </div>
  );
}

export default App;
