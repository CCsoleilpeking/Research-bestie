import { useState } from 'react';
import type { TodoItem } from '../types';
import { genId } from '../utils/id';

interface Props { items: TodoItem[]; onChange: (items: TodoItem[]) => void; }
const MAX_VISIBLE = 6;

export default function TodoList({ items, onChange }: Props) {
  const [input, setInput] = useState('');
  const [showAll, setShowAll] = useState(false);
  function add() { const text = input.trim(); if (!text) return; onChange([...items, { id: genId(), text, done: false, createdAt: new Date().toISOString() }]); setInput(''); }
  function toggle(id: string) { onChange(items.map(i => i.id === id ? { ...i, done: !i.done } : i)); }
  function remove(id: string) { onChange(items.filter(i => i.id !== id)); }
  const pending = items.filter(i => !i.done).length;
  const visible = showAll ? items : items.slice(0, MAX_VISIBLE);
  const hiddenCount = items.length - MAX_VISIBLE;

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between px-1 mb-1.5">
        <span className="font-semibold text-white text-sm">TODO</span>
        {pending > 0 && <span className="bg-mint-400/20 text-mint-400 text-xs px-2 py-0.5 rounded-full">{pending}</span>}
      </div>
      <div className="flex gap-1 mb-1.5">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Add a task..." className="flex-1 text-xs border border-dark-50/30 rounded-xl px-2 py-1 bg-dark-100 text-white placeholder-gray-600 focus:ring-1 focus:ring-mint-400/30 focus:outline-none" />
        <button onClick={add} className="text-[10px] bg-mint-400 text-dark-600 px-2 py-1 rounded-lg font-semibold hover:opacity-80">Add</button>
      </div>
      <ul className="space-y-0.5">
        {visible.map(item => (
          <li key={item.id} className="flex items-center gap-1.5 group">
            <input type="checkbox" checked={item.done} onChange={() => toggle(item.id)} className="rounded border-dark-50 bg-dark-100 text-mint-400 focus:ring-mint-400/30 w-3.5 h-3.5" />
            <span className={`flex-1 text-xs ${item.done ? 'line-through text-gray-600' : 'text-gray-300'}`}>{item.text}</span>
            <button onClick={() => remove(item.id)} className="text-[10px] text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">x</button>
          </li>
        ))}
      </ul>
      {!showAll && hiddenCount > 0 && (<button onClick={() => setShowAll(true)} className="w-full text-left text-xs text-mint-400 hover:text-mint-300 px-2 py-1.5">Show {hiddenCount} more...</button>)}
      {showAll && hiddenCount > 0 && (<button onClick={() => setShowAll(false)} className="w-full text-left text-xs text-mint-400 hover:text-mint-300 px-2 py-1.5">Show less</button>)}
      {items.length === 0 && <p className="text-xs text-gray-600 italic px-1">No tasks yet.</p>}
    </div>
  );
}
