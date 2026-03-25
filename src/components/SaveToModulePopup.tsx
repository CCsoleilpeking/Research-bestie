interface Props { selectedText: string; position: { x: number; y: number }; onSave: (target: 'paper' | 'summary' | 'insight') => void; onClose: () => void; }

export default function SaveToModulePopup({ selectedText, position, onSave, onClose }: Props) {
  if (!selectedText) return null;
  return (
    <div className="fixed z-50 bg-dark-200 rounded-2xl shadow-xl border border-dark-50/30 py-1 min-w-[180px]" style={{ left: position.x, top: position.y }}>
      <div className="px-3 py-1.5 text-xs text-gray-500 border-b border-dark-50/20">Save to...</div>
      <button onClick={() => { onSave('paper'); onClose(); }} className="w-full text-left px-3 py-2 text-sm hover:bg-mint-400/10 text-gray-300">Add to Today's Paper</button>
      <button onClick={() => { onSave('summary'); onClose(); }} className="w-full text-left px-3 py-2 text-sm hover:bg-mint-400/10 text-gray-300">Daily Summary</button>
      <button onClick={() => { onSave('insight'); onClose(); }} className="w-full text-left px-3 py-2 text-sm hover:bg-mint-400/10 text-gray-300">Insights</button>
      <div className="border-t border-dark-50/20"><button onClick={onClose} className="w-full text-left px-3 py-1.5 text-xs text-gray-600 hover:text-gray-400">Cancel</button></div>
    </div>
  );
}
