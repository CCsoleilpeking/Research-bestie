import { useState, useRef, useEffect } from 'react';
import type { ChatSession } from '../types';

interface Props {
  sessions: ChatSession[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

const MAX_VISIBLE = 6;

export default function ChatSessionList({ sessions, activeId, onSelect, onNew, onDelete, onRename }: Props) {
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [expanded, setExpanded] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuId(null);
    }
    if (menuId) { document.addEventListener('mousedown', handleClick); return () => document.removeEventListener('mousedown', handleClick); }
  }, [menuId]);

  useEffect(() => { if (renamingId) renameRef.current?.focus(); }, [renamingId]);

  const activeSessions = sessions.filter(s => !s.archived);
  const sorted = [...activeSessions].sort((a, b) => { if (a.id === activeId) return -1; if (b.id === activeId) return 1; return 0; });
  const visible = expanded ? sorted : sorted.slice(0, MAX_VISIBLE);
  const hiddenCount = sorted.length - MAX_VISIBLE;

  function startRename(session: ChatSession) { setRenamingId(session.id); setRenameText(session.title); setMenuId(null); }
  function submitRename(id: string) { const text = renameText.trim(); if (text) onRename(id, text); setRenamingId(null); }

  function renderSession(session: ChatSession) {
    return (
      <div key={session.id} className={`group flex items-center rounded-xl cursor-pointer transition-colors ${session.id === activeId ? 'bg-mint-400/10 text-mint-400' : 'text-gray-400 hover:bg-dark-100/50'}`}>
        {renamingId === session.id ? (
          <input ref={renameRef} value={renameText} onChange={e => setRenameText(e.target.value)} onBlur={() => submitRename(session.id)} onKeyDown={e => { if (e.key === 'Enter') submitRename(session.id); if (e.key === 'Escape') setRenamingId(null); }} className="flex-1 text-sm px-2 py-1.5 bg-dark-100 border border-mint-400/30 rounded-xl outline-none text-white" />
        ) : (
          <>
            <button onClick={() => onSelect(session.id)} className="flex-1 text-left text-sm px-2 py-1.5 truncate" title={session.title}>{session.title || 'New Chat'}</button>
            <div className="relative shrink-0">
              <button onClick={(e) => { e.stopPropagation(); setMenuId(menuId === session.id ? null : session.id); }} className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-white px-1.5 py-1 text-xs">···</button>
              {menuId === session.id && (
                <div ref={menuRef} className="absolute right-0 top-7 z-50 bg-dark-200 rounded-xl shadow-xl border border-dark-50/30 py-1 min-w-[120px]">
                  <button onClick={() => startRename(session)} className="w-full text-left px-3 py-1.5 text-sm hover:bg-dark-100 text-gray-300">Rename</button>
                  <button onClick={() => { onDelete(session.id); setMenuId(null); }} className="w-full text-left px-3 py-1.5 text-sm hover:bg-red-500/10 text-red-400">Delete</button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-1 mb-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">ChatList</span>
        <button onClick={onNew} className="text-xs bg-gradient-to-r from-mint-300 to-mint-600 text-dark-600 w-5 h-5 flex items-center justify-center rounded-full hover:opacity-80 font-bold" title="New Chat">+</button>
      </div>
      <div className="space-y-0.5">
        {visible.map(renderSession)}
        {!expanded && hiddenCount > 0 && (<button onClick={() => setExpanded(true)} className="w-full text-left text-xs text-mint-400 hover:text-mint-300 px-2 py-1.5">Show {hiddenCount} more...</button>)}
        {expanded && hiddenCount > 0 && (<button onClick={() => setExpanded(false)} className="w-full text-left text-xs text-mint-400 hover:text-mint-300 px-2 py-1.5">Show less</button>)}
        {activeSessions.length === 0 && (<p className="text-xs text-gray-600 italic px-2">No chats yet.</p>)}
      </div>
    </div>
  );
}
