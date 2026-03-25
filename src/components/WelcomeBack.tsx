import { useState, useRef, useEffect, useCallback } from 'react';
import type { TodayPaper, InsightItem } from '../types';

interface Props { papers: TodayPaper[]; insights: InsightItem[]; onClose: () => void; }

export default function WelcomeBack({ papers, insights, onClose }: Props) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setDragging(true);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    function onMouseMove(e: MouseEvent) { setPosition({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y }); }
    function onMouseUp() { setDragging(false); }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); };
  }, [dragging]);

  const panelStyle: React.CSSProperties = {};
  if (position) { panelStyle.position = 'fixed'; panelStyle.left = position.x; panelStyle.top = position.y; panelStyle.margin = 0; }

  return (
    <div className={`fixed inset-0 z-50 ${!position ? 'flex items-center justify-center' : ''} bg-black/50`}>
      <div ref={panelRef} className="bg-dark-300 rounded-2xl shadow-2xl w-[95%] max-w-[900px] max-h-[90vh] flex flex-col border border-dark-50/30" style={panelStyle}>
        <div
          onMouseDown={onMouseDown}
          className="flex items-center justify-between px-6 py-4 border-b border-dark-50/30 select-none cursor-grab active:cursor-grabbing"
        >
          <h2 className="text-lg font-bold text-white">Welcome Back</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none px-1">&times;</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {papers.length > 0 && (
            <div>
              <div className="bg-sky-400/10 rounded-lg px-3 py-1.5 mb-3">
                <h3 className="text-base font-bold text-sky-400">Today's Papers</h3>
              </div>
              <div className="space-y-2">
                {papers.map(p => (
                  <div key={p.id} className="rounded-xl border border-sky-400/20 bg-sky-400/5 px-4 py-3">
                    <span className="text-sm text-gray-300">{p.title}</span>
                    {p.link && <a href={p.link} target="_blank" rel="noopener noreferrer" className="text-mint-400 hover:underline ml-2 text-xs">link</a>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {insights.length > 0 && (
            <div>
              <div className="bg-violet-400/10 rounded-lg px-3 py-1.5 mb-3">
                <h3 className="text-base font-bold text-violet-400">Today's Insights</h3>
              </div>
              <div className="space-y-3">
                {insights.map(item => (
                  <div key={item.id} className="rounded-xl border border-violet-400/20 bg-violet-400/5 px-4 py-3">
                    <p className="text-sm text-gray-300 whitespace-pre-wrap">{item.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
