import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NAV_COMMANDS } from './navConfig';

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return NAV_COMMANDS;
    return NAV_COMMANDS.filter((c) =>
      `${c.section} ${c.label} ${c.description} ${c.why} ${c.whatToDo}`.toLowerCase().includes(q),
    );
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open ]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!open) return null;

  function go(to: string) {
    onClose();
    navigate(to);
  }

  return (
    <div className="palette-overlay" onClick={onClose} role="presentation">
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Search pages, people, content… try “things worth talking about”"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            }
            if (e.key === 'Enter' && results[active]) {
              go(results[active].to);
            }
          }}
        />
        <ul className="palette-list">
          {results.length === 0 ? (
            <li className="palette-item" aria-disabled="true">No matching pages</li>
          ) : (
            results.map((c, i) => (
              <li key={c.to}>
                <button
                  type="button"
                  className={`palette-item${i === active ? ' active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(c.to)}
                  title={`${c.description}. ${c.whatToDo}`}
                >
                  <span className="tiny" style={{ minWidth: 92 }}>{c.section}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 600 }}>{c.label}</span>
                    <span className="tiny" style={{ display: 'block' }}>{c.description}</span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
