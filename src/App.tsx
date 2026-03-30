import { useState, useEffect, useCallback, useRef } from 'react';
import type { ChatMessage, ChatSession, DailySummaryItem, TodoItem, InsightItem, TodayPaper } from './types';
import { genId } from './utils/id';
import { generateChatTitle, getLLMConfig } from './utils/llm';
import {
  fetchSessions, createSessionAPI, updateSessionAPI, deleteSessionAPI,
  fetchMessages, addMessageAPI, deleteMessagesAfterAPI, checkBackendHealth,
  fetchDailySummaries, upsertDailySummaryAPI, deleteDailySummaryAPI,
  fetchInsights, addInsightAPI, updateInsightAPI, deleteInsightAPI,
  fetchTodayPapers, addTodayPaperAPI, deleteTodayPaperAPI,
  fetchTodos, addTodoAPI, updateTodoAPI, deleteTodoAPI,
} from './utils/api';
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
  // All data from backend API
  const [dailySummaries, setDailySummaries] = useState<DailySummaryItem[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [insights, setInsights] = useState<InsightItem[]>([]);
  const [todayPapers, setTodayPapers] = useState<TodayPaper[]>([]);

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(360);
  const [isResizing, setIsResizing] = useState(false);
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
          // Load sessions
          const dbSessions = await fetchSessions();
          if (dbSessions.length > 0) {
            const sessionsWithMessages = dbSessions.map((s: ChatSession) => ({ ...s, messages: [] }));
            setSessions(sessionsWithMessages);
            setActiveId(dbSessions[0].id);
            const msgs = await fetchMessages(dbSessions[0].id);
            setActiveMessages(msgs);
          } else {
            const s = { id: genId(), title: 'New Chat', messages: [] as ChatMessage[], createdAt: new Date().toISOString() };
            await createSessionAPI(s.id, s.title, s.createdAt);
            setSessions([s]);
            setActiveId(s.id);
            setActiveMessages([]);
          }

          // Load all data from backend
          const [summaries, ins, papers, todoItems] = await Promise.all([
            fetchDailySummaries(),
            fetchInsights(),
            fetchTodayPapers(),
            fetchTodos(),
          ]);
          setDailySummaries(summaries);
          setInsights(ins);
          setTodayPapers(papers.map((p: TodayPaper) => ({ ...p, addedAt: p.addedAt || (p as any).added_at })));
          setTodos(todoItems.map((t: TodoItem) => ({ ...t, createdAt: t.createdAt || (t as any).created_at })));
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
      const id = genId();
      const addedAt = new Date().toISOString();
      setTodayPapers(prev => [...prev, { id, title: text, addedAt }]);
      setPapersFlashSignal(s => s + 1);
      if (backendReady) addTodayPaperAPI(id, text, addedAt).catch(console.error);
    } else if (target === 'summary') {
      const existing = dailySummaries.find(s => s.date === today);
      if (existing) {
        const frags = existing.fragments || (existing.content ? [existing.content] : []);
        const newFrags = [...frags, text];
        const newContent = newFrags.join('\n\n');
        setDailySummaries(dailySummaries.map(s =>
          s.id === existing.id ? { ...s, content: newContent, fragments: newFrags } : s
        ));
        if (backendReady) upsertDailySummaryAPI(existing.id, today, newContent, newFrags).catch(console.error);
      } else {
        const id = genId();
        setDailySummaries([{ id, date: today, content: text, fragments: [text] }, ...dailySummaries]);
        if (backendReady) upsertDailySummaryAPI(id, today, text, [text]).catch(console.error);
      }
      setSummaryFlashSignal(s => s + 1);
    } else if (target === 'insight') {
      const id = genId();
      const createdAt = new Date().toISOString();
      setInsights([{ id, content: text, createdAt }, ...insights]);
      setInsightsFlashSignal(s => s + 1);
      if (backendReady) addInsightAPI(id, text, createdAt).catch(console.error);
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

  // --- Sync wrappers for child component onChange ---
  function handleInsightsChange(newInsights: InsightItem[]) {
    if (backendReady) {
      // Detect deletions
      const newIds = new Set(newInsights.map(i => i.id));
      insights.filter(i => !newIds.has(i.id)).forEach(i => deleteInsightAPI(i.id).catch(console.error));
      // Detect additions
      const oldIds = new Set(insights.map(i => i.id));
      newInsights.filter(i => !oldIds.has(i.id)).forEach(i => addInsightAPI(i.id, i.content, i.createdAt).catch(console.error));
      // Detect updates
      newInsights.filter(i => oldIds.has(i.id)).forEach(i => {
        const old = insights.find(o => o.id === i.id);
        if (old && old.content !== i.content) updateInsightAPI(i.id, i.content).catch(console.error);
      });
    }
    setInsights(newInsights);
  }

  function handleDailySummariesChange(newSummaries: DailySummaryItem[]) {
    if (backendReady) {
      const newIds = new Set(newSummaries.map(s => s.id));
      dailySummaries.filter(s => !newIds.has(s.id)).forEach(s => deleteDailySummaryAPI(s.id).catch(console.error));
      newSummaries.forEach(s => upsertDailySummaryAPI(s.id, s.date, s.content, s.fragments || []).catch(console.error));
    }
    setDailySummaries(newSummaries);
  }

  function handleTodosChange(newTodos: TodoItem[]) {
    if (backendReady) {
      const newIds = new Set(newTodos.map(t => t.id));
      todos.filter(t => !newIds.has(t.id)).forEach(t => deleteTodoAPI(t.id).catch(console.error));
      const oldIds = new Set(todos.map(t => t.id));
      newTodos.filter(t => !oldIds.has(t.id)).forEach(t => addTodoAPI(t.id, t.text, t.createdAt).catch(console.error));
      newTodos.filter(t => oldIds.has(t.id)).forEach(t => {
        const old = todos.find(o => o.id === t.id);
        if (old && (old.text !== t.text || old.done !== t.done)) updateTodoAPI(t.id, { text: t.text, done: t.done }).catch(console.error);
      });
    }
    setTodos(newTodos);
  }

  function handleTodayPapersChange(newPapers: TodayPaper[]) {
    if (backendReady) {
      const newIds = new Set(newPapers.map(p => p.id));
      todayPapers.filter(p => !newIds.has(p.id)).forEach(p => deleteTodayPaperAPI(p.id).catch(console.error));
      const oldIds = new Set(todayPapers.map(p => p.id));
      newPapers.filter(p => !oldIds.has(p.id)).forEach(p => addTodayPaperAPI(p.id, p.title, p.addedAt, p.link, p.notes).catch(console.error));
    }
    setTodayPapers(newPapers);
  }

  // Sidebar resize handlers — must be before any conditional return
  useEffect(() => {
    if (!isResizing) return;
    function onMouseMove(e: MouseEvent) {
      setSidebarWidth(Math.max(240, Math.min(600, e.clientX)));
    }
    function onMouseUp() {
      setIsResizing(false);
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

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
      {!sidebarCollapsed && (
        <div className="bg-dark-400 border-r border-dark-50/30 flex flex-col h-screen shrink-0 relative" style={{ width: sidebarWidth }}>
          {/* Sidebar Header */}
          <div className="px-4 py-4 bg-dark-200 border-b border-dark-50/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">📚</span>
              <div>
                <h1 className="font-bold text-lg text-white">ResearchBestie</h1>
                <p className="text-xs text-gray-500">Your research companion</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
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
              <button
                onClick={() => setSidebarCollapsed(true)}
                className="text-mint-400 hover:text-mint-300 text-xl font-bold"
                title="Collapse sidebar"
              >
                &laquo;
              </button>
            </div>
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
            <InsightsList items={insights} onChange={handleInsightsChange} onShowPanel={() => { setOverlayPanel('insights'); setSummaryCloseSignal(s => s + 1); }} flashSignal={insightsFlashSignal} />
            <div className="border-t border-dark-50/20 my-3" />
            <DailySummary items={dailySummaries} onChange={handleDailySummariesChange} insights={insights} onChangeInsights={handleInsightsChange} todayPapers={todayPapers} todos={todos} onPanelOpen={() => { setOverlayPanel(null); setEditingInsightId(null); }} closeSignal={summaryCloseSignal} flashSignal={summaryFlashSignal} />
            <div className="border-t border-dark-50/20 my-3" />
            <TodoList items={todos} onChange={handleTodosChange} />
            <div className="border-t border-dark-50/20 my-3" />
            <TodayPapers items={todayPapers} onChange={handleTodayPapersChange} flashSignal={papersFlashSignal} />
          </div>

          {/* Resize handle */}
          <div
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-mint-400/30 active:bg-mint-400/50 z-10"
            onMouseDown={() => setIsResizing(true)}
          />
        </div>
      )}

      {/* Expand button when collapsed */}
      {sidebarCollapsed && (
        <div className="h-screen flex items-start pt-4 bg-dark-400 border-r border-dark-50/30">
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="text-mint-400 hover:text-mint-300 px-2 py-2 text-xl font-bold"
            title="Expand sidebar"
          >
            &raquo;
          </button>
        </div>
      )}

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
                      <button onClick={() => handleInsightsChange(insights.filter(i => i.id !== item.id))} className="text-xs text-gray-400 hover:text-red-400">Delete</button>
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
              onSave={(v) => { handleInsightsChange(insights.map(i => i.id === editingInsightId ? { ...i, content: v } : i)); setEditingInsightId(null); }}
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
