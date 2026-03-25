import { useState, useRef, useEffect, useCallback } from 'react';

interface Props {
  title: string;
  value: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}

export default function MarkdownEditor({ title, value, onSave, onCancel }: Props) {
  const [text, setText] = useState(value);
  const [showTips, setShowTips] = useState(false);
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
    function onMouseMove(e: MouseEvent) {
      setPosition({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
    }
    function onMouseUp() { setDragging(false); }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); };
  }, [dragging]);

  const panelClass = 'bg-dark-300 rounded-2xl shadow-2xl w-[95%] h-[90vh] flex flex-col border border-dark-50/30';

  const panelStyle: React.CSSProperties = {};
  if (position) {
    panelStyle.position = 'fixed';
    panelStyle.left = position.x;
    panelStyle.top = position.y;
    panelStyle.margin = 0;
  }

  return (
    <div className={`fixed inset-0 z-50 ${!position ? 'flex items-center justify-center' : ''} bg-black/50`}>
      <div ref={panelRef} className={panelClass} style={panelStyle}>
        {/* Header — draggable */}
        <div
          onMouseDown={onMouseDown}
          className="flex items-center justify-between px-6 py-4 border-b border-dark-50/30 shrink-0 select-none cursor-grab active:cursor-grabbing"
        >
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowTips(!showTips)} className="text-xs text-mint-400 hover:text-mint-300">
              {showTips ? 'Hide Tips' : 'Markdown Tips'}
            </button>
          </div>
        </div>
        {showTips && <Tips />}
        {/* Textarea fills remaining space */}
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          className="flex-1 w-full text-sm p-6 bg-dark-300 text-white placeholder-gray-600 focus:outline-none font-mono resize-none min-h-0"
          autoFocus
        />
        {/* Footer */}
        <div className="flex gap-2 px-6 py-3 border-t border-dark-50/30 shrink-0">
          <button onClick={() => onSave(text)} className="bg-mint-400 text-dark-600 px-4 py-1.5 rounded-lg text-xs font-semibold hover:opacity-80">Save</button>
          <button onClick={onCancel} className="text-gray-500 hover:text-white px-4 py-1.5 text-xs">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function Tips() {
  return (
    <div className="bg-dark-500 px-6 py-3 text-xs text-gray-400 font-mono border-b border-dark-50/20 shrink-0">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1">
        <div><span className="text-white">**bold**</span> → <strong className="text-white">bold</strong></div>
        <div><span className="text-white">*italic*</span> → <em className="text-white">italic</em></div>
        <div><span className="text-white">~~strike~~</span> → <s className="text-white">strike</s></div>
        <div><span className="text-white"># Heading</span> → large heading</div>
        <div><span className="text-white">- item</span> → bullet list</div>
        <div><span className="text-white">1. item</span> → numbered list</div>
        <div><span className="text-white">[text](url)</span> → link</div>
        <div><span className="text-white">`code`</span> → inline code</div>
        <div><span className="text-white">&gt; quote</span> → blockquote</div>
        <div><span className="text-white">```block```</span> → code block</div>
      </div>
    </div>
  );
}
