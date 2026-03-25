import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { DailySummaryItem, InsightItem, TodayPaper, TodoItem } from '../types';
import OverlayPanel from './OverlayPanel';
import MarkdownEditor from './MarkdownEditor';

interface Props {
  items: DailySummaryItem[];
  onChange: (items: DailySummaryItem[]) => void;
  insights: InsightItem[];
  onChangeInsights: (items: InsightItem[]) => void;
  todayPapers: TodayPaper[];
  todos: TodoItem[];
  onPanelOpen?: () => void;
  closeSignal?: number;
  flashSignal?: number;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;
  return { startDow, totalDays: lastDay.getDate() };
}
function formatMonth(year: number, month: number) { return new Date(year, month).toLocaleString('en-US', { month: 'long', year: 'numeric' }); }
function dateStr(year: number, month: number, day: number) { return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; }

const proseClass = "prose prose-sm prose-invert max-w-none prose-headings:mt-2 prose-headings:mb-1 prose-headings:text-white prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-pre:my-2 prose-pre:bg-dark-600 prose-code:text-gray-300 prose-code:bg-dark-600 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-strong:text-white prose-a:text-gray-300";

export default function DailySummary({ items, onChange, insights, onChangeInsights, todayPapers, todos, onPanelOpen, closeSignal, flashSignal }: Props) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showMonthView, setShowMonthView] = useState(false);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    if (flashSignal) {
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), 3000);
      return () => clearTimeout(t);
    }
  }, [flashSignal]);

  // Close all internal panels when external signal fires
  useEffect(() => {
    if (closeSignal) {
      setSelectedDate(null);
      setShowMonthView(false);
      setEditingSection(null);
    }
  }, [closeSignal]);

  const { startDow, totalDays } = getMonthDays(viewYear, viewMonth);

  const allDatesWithContent = new Set<string>();
  items.forEach(i => allDatesWithContent.add(i.date));
  insights.forEach(i => allDatesWithContent.add(i.createdAt.slice(0, 10)));
  todayPapers.forEach(p => allDatesWithContent.add(p.addedAt.slice(0, 10)));
  todos.forEach(t => allDatesWithContent.add(t.createdAt.slice(0, 10)));

  function getDateInsights(date: string) { return insights.filter(i => i.createdAt.slice(0, 10) === date); }
  function getDatePapers(date: string) { return todayPapers.filter(p => p.addedAt.slice(0, 10) === date); }
  function getDateTodos(date: string) { return todos.filter(t => t.createdAt.slice(0, 10) === date); }
  function getDateSummary(date: string) { return items.find(i => i.date === date); }

  function getMonthDates() {
    const dates = new Set<string>();
    for (let d = 1; d <= totalDays; d++) { const ds = dateStr(viewYear, viewMonth, d); if (allDatesWithContent.has(ds)) dates.add(ds); }
    return [...dates].sort();
  }

  function prevMonth() { if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11); } else setViewMonth(viewMonth - 1); }
  function nextMonth() { if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0); } else setViewMonth(viewMonth + 1); }
  function handleDayClick(day: number) { const ds = dateStr(viewYear, viewMonth, day); if (allDatesWithContent.has(ds)) { setShowMonthView(false); setEditingSection(null); setSelectedDate(ds); onPanelOpen?.(); } }

  // Abstract edit/delete
  function removeAbstract(id: string) { onChange(items.filter(i => i.id !== id)); }
  function saveAbstract(id: string, content: string) {
    onChange(items.map(i => i.id === id ? { ...i, content } : i));
    setEditingSection(null);
  }

  // Insights edit/delete (all insights of a day as one block)
  function deleteInsightsForDate(date: string) {
    onChangeInsights(insights.filter(i => i.createdAt.slice(0, 10) !== date));
  }
  function saveInsightsForDate(date: string, content: string) {
    // Replace all insights of this date with one merged insight
    const otherInsights = insights.filter(i => i.createdAt.slice(0, 10) !== date);
    const existing = insights.find(i => i.createdAt.slice(0, 10) === date);
    if (existing) {
      onChangeInsights([...otherInsights, { ...existing, content }]);
    }
    setEditingSection(null);
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const todayStr = now.toISOString().slice(0, 10);

  function getFragments(summary: DailySummaryItem): string[] {
    if (summary.fragments && summary.fragments.length > 0) return summary.fragments;
    if (summary.content) return [summary.content];
    return [];
  }

  function renderDayContent(date: string) {
    const summary = getDateSummary(date);
    const dayInsights = getDateInsights(date);
    const dayPapers = getDatePapers(date);
    const dayTodos = getDateTodos(date);
    const pendingTodos = dayTodos.filter(t => !t.done);
    const doneTodos = dayTodos.filter(t => t.done);
    const fragments = summary ? getFragments(summary) : [];

    return (
      <div className="space-y-6">
        {fragments.length > 0 && (
          <div>
            <div className="flex items-center justify-between bg-cyan-400/10 rounded-lg px-3 py-1.5 mb-3">
              <h3 className="text-base font-bold text-cyan-400">Abstract</h3>
              <div className="flex gap-3">
                <button onClick={() => setEditingSection(`abstract:${date}`)} className="text-xs text-gray-400 hover:text-mint-400">Edit</button>
                <button onClick={() => removeAbstract(summary!.id)} className="text-xs text-gray-400 hover:text-red-400">Delete</button>
              </div>
            </div>
            <div className="space-y-3">
              {fragments.map((frag, i) => (
                <div key={i} className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3">
                  <div className={proseClass}><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{frag}</ReactMarkdown></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {dayInsights.length > 0 && (
          <div>
            <div className="flex items-center justify-between bg-violet-400/10 rounded-lg px-3 py-1.5 mb-3">
              <h3 className="text-base font-bold text-violet-400">Insights</h3>
              <div className="flex gap-3">
                <button onClick={() => setEditingSection(`insights:${date}`)} className="text-xs text-gray-400 hover:text-mint-400">Edit</button>
                <button onClick={() => deleteInsightsForDate(date)} className="text-xs text-gray-400 hover:text-red-400">Delete</button>
              </div>
            </div>
            <div className="space-y-3">
              {dayInsights.map(item => (
                <div key={item.id} className="rounded-xl border border-violet-400/20 bg-violet-400/5 px-4 py-3">
                  <div className={proseClass}><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{item.content}</ReactMarkdown></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {dayPapers.length > 0 && (
          <div>
            <div className="bg-sky-400/10 rounded-lg px-3 py-1.5 mb-3">
              <h3 className="text-base font-bold text-sky-400">Papers</h3>
            </div>
            <div className="space-y-2">
              {dayPapers.map(p => (
                <div key={p.id} className="rounded-xl border border-sky-400/20 bg-sky-400/5 px-4 py-3">
                  <span className="text-sm text-gray-300">{p.title}</span>
                  {p.link && <a href={p.link} target="_blank" rel="noopener noreferrer" className="text-mint-400 hover:underline ml-2 text-xs">link</a>}
                </div>
              ))}
            </div>
          </div>
        )}

        {dayTodos.length > 0 && (
          <div>
            <div className="bg-amber-400/10 rounded-lg px-3 py-1.5 mb-3">
              <h3 className="text-base font-bold text-amber-400">TODO</h3>
            </div>
            {pendingTodos.length > 0 && (
              <div className="mb-2">
                <span className="text-xs text-gray-500 uppercase tracking-wider">Pending</span>
                <ul className="space-y-0.5 mt-1">{pendingTodos.map(t => (<li key={t.id} className="text-sm text-gray-300">☐ {t.text}</li>))}</ul>
              </div>
            )}
            {doneTodos.length > 0 && (
              <div>
                <span className="text-xs text-gray-500 uppercase tracking-wider">Completed</span>
                <ul className="space-y-0.5 mt-1">{doneTodos.map(t => (<li key={t.id} className="text-sm line-through text-gray-600">☑ {t.text}</li>))}</ul>
              </div>
            )}
          </div>
        )}

        {!summary && dayInsights.length === 0 && dayPapers.length === 0 && dayTodos.length === 0 && (<p className="text-sm text-gray-500">No content for this day.</p>)}
      </div>
    );
  }

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between px-1 mb-2">
        <span className="flex items-center gap-2">
          <span className={`font-semibold text-sm transition-colors ${flashing ? 'animate-pulse text-mint-400' : 'text-white'}`}>Daily Summary</span>
          {flashing && <span className="animate-pulse text-lg text-[#00ff88]">✓</span>}
        </span>
        <button onClick={() => { setSelectedDate(null); setEditingSection(null); setShowMonthView(true); onPanelOpen?.(); }} className="text-xs text-mint-400 hover:text-mint-300 font-medium">View</button>
      </div>

      <div className="bg-dark-100 rounded-2xl border border-dark-50/30 p-3">
        <div className="flex items-center justify-between mb-2">
          <button onClick={prevMonth} className="text-gray-500 hover:text-white px-1 text-sm">&lt;</button>
          <span className="text-sm font-medium text-white">{formatMonth(viewYear, viewMonth)}</span>
          <button onClick={nextMonth} className="text-gray-500 hover:text-white px-1 text-sm">&gt;</button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {WEEKDAYS.map(d => (<div key={d} className="text-center text-[10px] text-gray-600 font-medium">{d}</div>))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((day, i) => {
            if (day === null) return <div key={i} />;
            const ds = dateStr(viewYear, viewMonth, day);
            const hasContent = allDatesWithContent.has(ds);
            const isToday = ds === todayStr;
            return (
              <button key={i} onClick={() => handleDayClick(day)}
                className={`w-full h-5 flex items-center justify-center text-xs transition-colors ${hasContent ? 'cursor-pointer' : ''} ${isToday && !hasContent ? 'text-mint-400 font-medium' : 'text-gray-500'}`}>
                {hasContent ? (
                  <span className="w-5 h-5 flex items-center justify-center rounded-full bg-mint-400/20 text-mint-400 font-bold text-[10px] hover:bg-mint-400/30 border border-mint-400/30">{day}</span>
                ) : day}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDate && !editingSection && (
        <OverlayPanel title={selectedDate} onClose={() => setSelectedDate(null)}>
          {renderDayContent(selectedDate)}
        </OverlayPanel>
      )}
      {showMonthView && !editingSection && (
        <OverlayPanel title={`Daily Summary — ${formatMonth(viewYear, viewMonth)}`} onClose={() => setShowMonthView(false)}>
          <div className="space-y-8">
            {getMonthDates().length > 0 ? getMonthDates().map(date => (
              <div key={date} className="pb-8">
                <div className="bg-mint-400/10 rounded-lg px-4 py-2 mb-4">
                  <span className="text-lg font-bold text-white">{date}</span>
                </div>
                {renderDayContent(date)}
              </div>
            )) : (<p className="text-gray-500 text-sm">No content this month.</p>)}
          </div>
        </OverlayPanel>
      )}

      {/* Standalone editor - replaces the view panel */}
      {editingSection?.startsWith('abstract:') && (() => {
        const date = editingSection.split(':')[1];
        const summary = getDateSummary(date);
        if (!summary) return null;
        return (
          <MarkdownEditor
            title={`Editing Abstract — ${date}`}
            value={summary.content}
            onSave={(v) => { saveAbstract(summary.id, v); }}
            onCancel={() => setEditingSection(null)}
          />
        );
      })()}

      {editingSection?.startsWith('insights:') && (() => {
        const date = editingSection.split(':')[1];
        const dayInsights = getDateInsights(date);
        const insightsText = dayInsights.map(i => i.content).join('\n\n---\n\n');
        return (
          <MarkdownEditor
            title={`Editing Insights — ${date}`}
            value={insightsText}
            onSave={(v) => { saveInsightsForDate(date, v); }}
            onCancel={() => setEditingSection(null)}
          />
        );
      })()}
    </div>
  );
}
