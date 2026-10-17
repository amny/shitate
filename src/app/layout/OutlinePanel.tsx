import { useEditorState } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import type { EditorState } from '@tiptap/pm/state';
import { useId, useMemo, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { hasCover } from '../../core/export';
import type { Labels } from '../../core/labels';
import { buildOutline } from '../../core/outline';
import type { OutlineFrontKind } from '../../core/outline';
import { getLabels } from '../../editor/extensions/labels';
import { findToc } from '../../editor/extensions/toc';
import { scrollToNode, scrollToNodeAt } from '../../editor/scrollToNode';
import { useDocumentStore } from '../store/documentStore';

type OutlineTab = 'outline' | 'captions';

const OUTLINE_TABS: readonly { id: OutlineTab; label: string }[] = [
  { id: 'outline', label: 'アウトライン' },
  { id: 'captions', label: '図表' },
];

interface OutlineEditorState {
  labels: Labels;
  hasToc: boolean;
  /** The heading whose section holds the cursor. */
  currentHeadingId: string | null;
}

/** The last heading that starts before the cursor (design.md §5.8). */
function currentHeadingId(state: EditorState): string | null {
  const ids: string[] = [];
  state.doc.nodesBetween(0, state.selection.from, (node) => {
    if (node.type.name !== 'heading') return true;
    const id: unknown = node.attrs['id'];
    if (typeof id === 'string') ids.push(id);
    return false;
  });
  return ids.at(-1) ?? null;
}

function selectOutlineState({ editor }: { editor: Editor }): OutlineEditorState {
  return {
    labels: getLabels(editor.state),
    hasToc: findToc(editor.state.doc) !== null,
    currentHeadingId: currentHeadingId(editor.state),
  };
}

// Labels are recomputed only when the document changes, so identity is enough.
function sameOutlineState(a: OutlineEditorState, b: OutlineEditorState | null): boolean {
  return (
    b !== null &&
    a.labels === b.labels &&
    a.hasToc === b.hasToc &&
    a.currentHeadingId === b.currentHeadingId
  );
}

/** Cover and revision history are previews outside the editor: scroll only. */
function scrollToPreface(kind: Exclude<OutlineFrontKind, 'toc'>): void {
  document.querySelector(`[data-preface="${kind}"]`)?.scrollIntoView({ block: 'start' });
}

interface OutlinePanelProps {
  editor: Editor;
}

/** Left-hand outline of headings and figures / tables (design.md §5.8). */
export function OutlinePanel({ editor }: OutlinePanelProps) {
  const [tab, setTab] = useState<OutlineTab>('outline');
  const state = useEditorState({
    editor,
    selector: selectOutlineState,
    equalityFn: sameOutlineState,
  });
  const meta = useDocumentStore((s) => s.meta);
  const revisions = useDocumentStore((s) => s.revisions);
  const outline = useMemo(
    () =>
      buildOutline({
        labels: state.labels,
        hasCover: hasCover(meta),
        hasRevisions: revisions.length > 0,
        hasToc: state.hasToc,
      }),
    [state.labels, state.hasToc, meta, revisions],
  );

  const baseId = useId();
  const tabId = (id: OutlineTab) => `${baseId}-tab-${id}`;
  const panelId = `${baseId}-panel`;

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const next = tab === 'outline' ? 'captions' : 'outline';
    event.preventDefault();
    setTab(next);
    document.getElementById(tabId(next))?.focus();
  };

  // Items are links (to the heading's id) so they read as navigation; the editor does the move.
  const openFront = (event: MouseEvent, kind: OutlineFrontKind) => {
    event.preventDefault();
    if (kind !== 'toc') {
      scrollToPreface(kind);
      return;
    }
    // The TOC is always the first node of the document (design.md §5.1).
    if (findToc(editor.state.doc)) scrollToNodeAt(editor.view, 0);
  };

  const openNode = (event: MouseEvent, id: string) => {
    event.preventDefault();
    scrollToNode(editor.view, id);
  };

  return (
    <nav className="outline-panel" aria-label="アウトライン">
      <div className="settings-tabs" role="tablist" aria-label="表示" onKeyDown={onTabKeyDown}>
        {OUTLINE_TABS.map((t) => (
          <button
            key={t.id}
            id={tabId(t.id)}
            type="button"
            role="tab"
            className="settings-tab"
            aria-selected={t.id === tab}
            aria-controls={panelId}
            tabIndex={t.id === tab ? 0 : -1}
            onClick={() => {
              setTab(t.id);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div id={panelId} className="outline-list" role="tabpanel" aria-labelledby={tabId(tab)}>
        {tab === 'outline' && (
          <>
            {outline.front.map((item) => (
              <a
                key={item.kind}
                href={`#${item.kind}`}
                className="outline-item is-front"
                onClick={(event) => {
                  openFront(event, item.kind);
                }}
              >
                {item.label}
              </a>
            ))}
            {outline.front.length > 0 && <div className="outline-divider" aria-hidden="true" />}
            {outline.headings.length === 0 && (
              <p className="outline-empty">見出しを追加すると、ここに表示されます</p>
            )}
            {outline.headings.map((heading) => (
              <a
                key={heading.id}
                href={`#${heading.id}`}
                className={`outline-item outline-level-${String(heading.level)}`}
                aria-current={heading.id === state.currentHeadingId ? 'location' : undefined}
                onClick={(event) => {
                  openNode(event, heading.id);
                }}
              >
                {heading.number !== '' && <span className="outline-number">{heading.number}</span>}
                <span className={heading.text === '' ? 'outline-text is-empty' : 'outline-text'}>
                  {heading.text === '' ? '（無題の見出し）' : heading.text}
                </span>
              </a>
            ))}
          </>
        )}
        {tab === 'captions' && (
          <>
            {outline.captions.length === 0 && (
              <p className="outline-empty">図・表にキャプションを付けると、ここに表示されます</p>
            )}
            {outline.captions.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="outline-item"
                onClick={(event) => {
                  openNode(event, item.id);
                }}
              >
                <span className="outline-number">{item.number}</span>
                <span className={item.caption === '' ? 'outline-text is-empty' : 'outline-text'}>
                  {item.caption === '' ? '（キャプションなし）' : item.caption}
                </span>
              </a>
            ))}
          </>
        )}
      </div>
    </nav>
  );
}
