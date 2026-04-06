import { useState, useEffect, useRef } from 'react';
import type { TodayPaper } from '../types';
import { genId } from '../utils/id';

interface Props { items: TodayPaper[]; onChange: (items: TodayPaper[]) => void; flashSignal?: number; }

export default function TodayPapers({ items, onChange, flashSignal }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [flashing, setFlashing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newLink, setNewLink] = useState('');
  const addRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (flashSignal) {
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), 3000);
      return () => clearTimeout(t);
    }
  }, [flashSignal]);
  useEffect(() => { if (adding && addRef.current) addRef.current.focus(); }, [adding]);
  function remove(id: string) { onChange(items.filter(i => i.id !== id)); }
  function toggle(id: string) { setExpandedId(expandedId === id ? null : id); }
  function addPaper() {
    const title = newTitle.trim();
    if (!title) return;
    onChange([...items, { id: genId(), title, link: newLink.trim() || undefined, addedAt: new Date().toISOString() }]);
    setNewTitle('');
    setNewLink('');
    setAdding(false);
  }
  const today = new Date().toISOString().slice(0, 10);
  const todayPapers = items.filter(p => p.addedAt.slice(0, 10) === today);

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between px-1 mb-2">
        <span className="flex items-center gap-2">
          <span className={`font-semibold text-sm transition-colors ${flashing ? 'animate-pulse text-mint-400' : 'text-white'}`}>Today's Papers</span>
          {flashing && <span className="animate-pulse text-lg text-[#00ff88]">✓</span>}
        </span>
        <button onClick={() => setAdding(true)} className="text-mint-400 hover:text-mint-300 text-lg font-bold leading-none" title="Add paper">+</button>
      </div>
      {adding && (
        <div className="mb-2 bg-dark-100 rounded-2xl border border-mint-400/30 p-3 space-y-2">
          <input
            ref={addRef}
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="Paper title..."
            className="w-full text-sm bg-transparent text-white placeholder-gray-600 focus:outline-none border-b border-dark-50/30 pb-1"
          />
          <input
            value={newLink}
            onChange={e => setNewLink(e.target.value)}
            placeholder="Link (optional)..."
            className="w-full text-xs bg-transparent text-gray-400 placeholder-gray-600 focus:outline-none"
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setAdding(false); setNewTitle(''); setNewLink(''); }} className="text-xs text-gray-500 hover:text-white px-3 py-1">Cancel</button>
            <button onClick={addPaper} disabled={!newTitle.trim()} className="bg-mint-400 text-dark-600 px-3 py-1 rounded-lg text-xs font-semibold hover:opacity-80 disabled:opacity-30">Save</button>
          </div>
        </div>
      )}
      <div className="space-y-1">
        {todayPapers.map(paper => (
          <div key={paper.id} className="bg-dark-100 rounded-2xl border border-dark-50/30 overflow-hidden">
            <button onClick={() => toggle(paper.id)} className="w-full px-3 py-2 hover:bg-dark-50/20 text-left text-xs text-gray-300 break-words">{paper.title}</button>
            {expandedId === paper.id && (
              <div className="px-3 pb-3 border-t border-dark-50/20 relative">
                <div className="absolute top-2 right-3"><span onClick={() => remove(paper.id)} className="text-xs text-gray-400 hover:text-red-400 cursor-pointer">Delete</span></div>
                {paper.link ? (<a href={paper.link} target="_blank" rel="noopener noreferrer" className="text-sm text-mint-400 hover:underline mt-6 block break-all">{paper.link}</a>) : (<p className="text-xs text-gray-600 mt-6 italic">No link provided</p>)}
                <span className="text-xs text-gray-600 mt-1 block">Added {new Date(paper.addedAt).toLocaleTimeString()}</span>
              </div>
            )}
          </div>
        ))}
        {todayPapers.length === 0 && <p className="text-xs text-gray-600 italic px-1">No papers read today. Select a title in chat to add.</p>}
      </div>
    </div>
  );
}
