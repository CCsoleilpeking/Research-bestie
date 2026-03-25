import { useState, type ReactNode } from 'react';

interface Props {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
  headerRight?: ReactNode;
}

export default function CollapsibleSection({ title, count, defaultOpen = true, children, headerRight }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mb-3 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className={`text-xs text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}>&#9654;</span>
          <span className="font-semibold text-gray-800 text-sm">{title}</span>
          {count !== undefined && (
            <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full">{count}</span>
          )}
        </div>
        {headerRight && <div onClick={e => e.stopPropagation()}>{headerRight}</div>}
      </button>
      {open && <div className="px-4 pb-3 border-t border-gray-100">{children}</div>}
    </div>
  );
}
