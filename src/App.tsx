import { useState, useEffect } from 'react';
import { useLocalStorage } from './hooks/useLocalStorage';
import type { ChatMessage, ChatSession, DailySummaryItem, TodoItem, InsightItem, TodayPaper } from './types';
import { genId } from './utils/id';
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

function createSession(): ChatSession {
  return { id: genId(), title: 'New Chat', messages: [], createdAt: new Date().toISOString() };
}

function migrateOrCreateSessions(): ChatSession[] {
  try {
    const old = localStorage.getItem('rb_chat');
    if (old) {
      const msgs: ChatMessage[] = JSON.parse(old);
      if (msgs.length > 0) {
        const session = createSession();
        session.messages = msgs;
        session.title = msgs[0]?.content.slice(0, 30) || 'New Chat';
        localStorage.removeItem('rb_chat');
        return [session];
      }
    }
  } catch { /* ignore */ }
  return [createSession()];
}

function App() {
  const [dailySummaries, setDailySummaries] = useLocalStorage<DailySummaryItem[]>('rb_daily', []);
  const [todos, setTodos] = useLocalStorage<TodoItem[]>('rb_todos', []);
  const [insights, setInsights] = useLocalStorage<InsightItem[]>('rb_insights', []);
  const [todayPapers, setTodayPapers] = useLocalStorage<TodayPaper[]>('rb_today_papers', []);
  const [sessions, setSessions] = useLocalStorage<ChatSession[]>('rb_sessions', migrateOrCreateSessions());
  const [activeId, setActiveId] = useLocalStorage<string>('rb_active_chat', sessions[0]?.id || '');

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

  const today = new Date().toISOString().slice(0, 10);
  const todayPapersFiltered = todayPapers.filter(p => p.addedAt.slice(0, 10) === today);
  const todayInsights = insights.filter(i => i.createdAt.slice(0, 10) === today);

  useEffect(() => {
    if (todayPapersFiltered.length > 0 || todayInsights.length > 0) {
      setShowWelcome(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!sessions.find(s => s.id === activeId)) {
      if (sessions.length > 0) {
        setActiveId(sessions[0].id);
      } else {
        const s = createSession();
        setSessions([s]);
        setActiveId(s.id);
      }
    }
  }, [sessions, activeId, setActiveId, setSessions]);

  const activeSession = sessions.find(s => s.id === activeId);
  const activeMessages = activeSession?.messages || [];

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

  function handleNewSession() {
    const s = createSession();
    setSessions(prev => [s, ...prev]);
    setActiveId(s.id);
  }

  function handleDeleteSession(id: string) {
    setSessions(prev => {
      const next = prev.filter(s => s.id !== id);
      if (next.length === 0) {
        const s = createSession();
        next.push(s);
        setActiveId(s.id);
      } else if (id === activeId) {
        setActiveId(next[0].id);
      }
      return next;
    });
  }

  function handleRenameSession(id: string, title: string) {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, title } : s));
  }

  function handleArchiveSession(id: string) {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, archived: !s.archived } : s));
  }

  function handleMessagesChange(messages: ChatMessage[]) {
    setSessions(prev => prev.map(s => {
      if (s.id !== activeId) return s;
      const updated = { ...s, messages };
      if (s.title === 'New Chat' && messages.length > 0) {
        const firstUser = messages.find(m => m.role === 'user');
        if (firstUser) {
          updated.title = firstUser.content.slice(0, 40) + (firstUser.content.length > 40 ? '...' : '');
        }
      }
      return updated;
    }));
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
            onSelect={(id) => { setActiveId(id); setOverlayPanel(null); }}
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
          onClose={() => setShowPopup(false)}
        />
      )}

    </div>
  );
}

export default App;
