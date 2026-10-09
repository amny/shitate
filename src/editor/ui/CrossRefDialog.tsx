import type { Editor } from '@tiptap/react';
import { useId, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Labels } from '../../core/labels';
import { getLabels } from '../extensions/labels';

export interface CrossRefDialogProps {
  editor: Editor;
  onClose: () => void;
}

interface RefTarget {
  id: string;
  kind: '見出し' | '図' | '表';
  /** "2.1" / "図3" / "表2" / "" for an unnumbered heading. */
  number: string;
  text: string;
  /** Indent level for headings. */
  level: number;
}

function collectTargets(labels: Labels): RefTarget[] {
  return [
    ...labels.toc.map((entry) => ({
      id: entry.id,
      kind: '見出し' as const,
      number: entry.number,
      text: entry.text,
      level: entry.level,
    })),
    ...[...labels.figures].map(([id, figure]) => ({
      id,
      kind: '図' as const,
      number: `図${String(figure.number)}`,
      text: figure.caption,
      level: 1,
    })),
    ...[...labels.tables].map(([id, table]) => ({
      id,
      kind: '表' as const,
      number: `表${String(table.number)}`,
      text: table.caption,
      level: 1,
    })),
  ];
}

/** Picks a heading / figure / table and inserts a cross reference to it (design.md §5.6). */
export function CrossRefDialog({ editor, onClose }: CrossRefDialogProps) {
  const targets = useMemo(() => collectTargets(getLabels(editor.state)), [editor]);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const titleId = useId();
  const listId = useId();

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized === ''
      ? targets
      : targets.filter((t) => `${t.number} ${t.text}`.toLowerCase().includes(normalized));
  }, [targets, query]);
  const active = visible[Math.min(activeIndex, visible.length - 1)];

  const close = () => {
    onClose();
    editor.commands.focus();
  };

  const insert = (target: RefTarget) => {
    editor.chain().focus().insertCrossRef(target.id).run();
    onClose();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Ignore keys that confirm or cancel IME conversion.
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((index) =>
        visible.length === 0
          ? 0
          : (Math.min(index, visible.length - 1) + step + visible.length) % visible.length,
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (active) insert(active);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  const optionId = (target: RefTarget) => `${listId}-${target.id}`;

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="crossref-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>参照を挿入</h2>
        <input
          type="search"
          className="crossref-search"
          placeholder="番号や題名で絞り込み"
          aria-label="参照先の絞り込み"
          aria-controls={listId}
          aria-activedescendant={active ? optionId(active) : undefined}
          role="combobox"
          aria-expanded="true"
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
        />
        {visible.length === 0 ? (
          <p className="crossref-empty">
            {targets.length === 0
              ? '参照できる見出し・図・表がありません'
              : '一致する参照先がありません'}
          </p>
        ) : (
          <ul id={listId} className="crossref-list" role="listbox" aria-label="参照先">
            {visible.map((target) => (
              <li
                key={target.id}
                id={optionId(target)}
                role="option"
                aria-selected={target === active}
                className={target === active ? 'crossref-option is-active' : 'crossref-option'}
                style={{ paddingLeft: `${String(8 + (target.level - 1) * 16)}px` }}
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  insert(target);
                }}
              >
                <span className="crossref-kind">{target.kind}</span>
                {target.number && <span className="crossref-number">{target.number}</span>}
                <span className="crossref-text">{target.text || '（題名なし）'}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="crossref-actions">
          <button type="button" onClick={close}>
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
