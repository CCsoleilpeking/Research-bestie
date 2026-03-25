import { useState, useEffect } from 'react';
import type { TodayPaper } from '../types';

interface Props { items: TodayPaper[]; onChange: (items: TodayPaper[]) => void; flashSignal?: number; }

export default function TodayPapers({ items, onChange, flashSignal }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    if (flashSignal) {
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), 3000);
      return () => clearTimeout(t);
    }
  }, [flashSignal]);
  function remove(id: string) { onChange(items.filter(i => i.id !== id)); }
  function toggle(id: string) { setExpandedId(expandedId === id ? null : id); }
  const today = new Date().toISOString().slice(0, 10);
  const todayPapers = items.filter(p => p.addedAt.slice(0, 10) === today);

  return (
    <div className="mb-3">
      <div className="px-1 mb-2">
        <span className="flex items-center gap-2">
          <span className={`font-semibold text-sm transition-colors ${flashing ? 'animate-pulse text-mint-400' : 'text-white'}`}>Today's Papers</span>
          {flashing && <span className="animate-pulse text-lg text-[#00ff88]">✓</span>}
        </span>
      </div>
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
