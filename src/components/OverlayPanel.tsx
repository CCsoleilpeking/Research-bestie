import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export default function OverlayPanel({ title, onClose, children }: Props) {
  const [maximized, setMaximized] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // Reset position when toggling maximize
  useEffect(() => {
    if (maximized) setPosition(null);
  }, [maximized]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (maximized) return;
    e.preventDefault();
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setDragging(true);
  }, [maximized]);

  useEffect(() => {
    if (!dragging) return;
    function onMouseMove(e: MouseEvent) {
      setPosition({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
    }
    function onMouseUp() { setDragging(false); }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); };
  }, [dragging]);

  const panelClass = maximized
    ? 'bg-dark-300 rounded-2xl shadow-2xl w-[95%] h-[90vh] flex flex-col border border-dark-50/30'
    : 'bg-dark-300 rounded-2xl shadow-2xl w-[90%] max-w-[700px] max-h-[80vh] flex flex-col border border-dark-50/30';

  const panelStyle: React.CSSProperties = {};
  if (!maximized && position) {
    panelStyle.position = 'fixed';
    panelStyle.left = position.x;
    panelStyle.top = position.y;
    panelStyle.margin = 0;
  }

  return (
    <div className={`fixed inset-0 z-40 ${maximized || !position ? 'flex items-center justify-center' : ''} bg-black/50`}>
      <div ref={panelRef} className={panelClass} style={panelStyle}>
        {/* Header — draggable */}
        <div
          onMouseDown={onMouseDown}
          className={`flex items-center justify-between px-6 py-4 border-b border-dark-50/30 select-none ${!maximized ? 'cursor-grab active:cursor-grabbing' : ''}`}
        >
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <div className="flex items-center gap-2">
            {/* Maximize / Restore */}
            <button
              onClick={() => setMaximized(!maximized)}
              className="text-gray-500 hover:text-white text-sm px-1"
              title={maximized ? 'Restore' : 'Maximize'}
            >
              {maximized ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V5a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2h-4M15 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-8a2 2 0 012-2h4" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
                </svg>
              )}
            </button>
            {/* Close */}
            <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none px-1">&times;</button>
          </div>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {children}
        </div>
      </div>
    </div>
  );
}
