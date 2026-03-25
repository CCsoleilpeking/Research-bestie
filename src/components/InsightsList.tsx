import { useState, useEffect } from 'react';
import type { InsightItem } from '../types';

interface Props { items: InsightItem[]; onChange: (items: InsightItem[]) => void; onShowPanel: () => void; flashSignal?: number; }
const MAX_VISIBLE = 6;

export default function InsightsList({ items, onChange, onShowPanel, flashSignal }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    if (flashSignal) {
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), 3000);
      return () => clearTimeout(t);
    }
  }, [flashSignal]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [showAll, setShowAll] = useState(false);

  function startEdit(item: InsightItem) { setEditing(item.id); setEditText(item.content); setExpandedId(item.id); }
  function saveEdit(id: string) { onChange(items.map(i => i.id === id ? { ...i, content: editText } : i)); setEditing(null); }
  function remove(id: string) { onChange(items.filter(i => i.id !== id)); }
  function toggle(id: string) { setExpandedId(expandedId === id ? null : id); }

  const visible = showAll ? items : items.slice(0, MAX_VISIBLE);
  const hiddenCount = items.length - MAX_VISIBLE;

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between px-1 mb-2">
        <span className="flex items-center gap-2">
          <span className={`font-semibold text-sm transition-colors ${flashing ? 'animate-pulse text-mint-400' : 'text-white'}`}>Insights</span>
          {flashing && <span className="animate-pulse text-lg text-[#00ff88]">✓</span>}
        </span>
        <button onClick={onShowPanel} className="text-xs text-mint-400 hover:text-mint-300 font-medium">View</button>
      </div>
      <div className="space-y-1">
        {visible.map(item => {
          const isOpen = expandedId === item.id || hoveredId === item.id;
          return (
          <div key={item.id} className="bg-dark-100 rounded-2xl border border-dark-50/30 overflow-hidden"
            onMouseEnter={() => { if (!expandedId) setHoveredId(item.id); }}
            onMouseLeave={() => setHoveredId(null)}
          >
            <button onClick={() => toggle(item.id)} className="w-full px-3 py-2 hover:bg-dark-50/20 text-left text-sm text-gray-300 truncate">{item.content.slice(0, 60)}{item.content.length > 60 ? '...' : ''}</button>
            {isOpen && (
              <div className="px-3 pb-3 border-t border-dark-50/20 relative">
                <div className="absolute top-2 right-3 flex gap-2">
                  <span onClick={() => startEdit(item)} className="text-xs text-gray-400 hover:text-mint-400 cursor-pointer">Edit</span>
                  <span onClick={() => remove(item.id)} className="text-xs text-gray-400 hover:text-red-400 cursor-pointer">Delete</span>
                </div>
                {editing === item.id ? (
                  <div className="mt-6">
                    <textarea value={editText} onChange={e => setEditText(e.target.value)} className="w-full text-sm border border-dark-50/30 rounded-xl p-2 min-h-[80px] bg-dark-400 text-white focus:ring-1 focus:ring-mint-400/30 focus:outline-none" />
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => saveEdit(item.id)} className="bg-mint-400 text-dark-600 px-3 py-1 rounded-lg text-xs font-semibold">Save</button>
                      <button onClick={() => setEditing(null)} className="text-gray-500 px-3 py-1 text-xs">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-6">
                    <p className="text-sm text-gray-300 whitespace-pre-wrap">{item.content}</p>
                    <span className="text-xs text-gray-600 mt-1 block">{new Date(item.createdAt).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            )}
          </div>
          );
        })}
        {!showAll && hiddenCount > 0 && (<button onClick={() => setShowAll(true)} className="w-full text-left text-xs text-mint-400 hover:text-mint-300 px-2 py-1.5">Show {hiddenCount} more...</button>)}
        {showAll && hiddenCount > 0 && (<button onClick={() => setShowAll(false)} className="w-full text-left text-xs text-mint-400 hover:text-mint-300 px-2 py-1.5">Show less</button>)}
        {items.length === 0 && <p className="text-xs text-gray-600 italic px-1">No insights yet. Save from chat to add.</p>}
      </div>
    </div>
  );
}
