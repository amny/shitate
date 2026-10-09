import { useEditorState } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import type { ReactNode } from 'react';
import { getFileAdapter } from '../../adapters';
import { getLabels } from '../../editor/extensions/labels';
import { findToc } from '../../editor/extensions/toc';
import {
  BulletListIcon,
  CaptionIcon,
  CrossRefIcon,
  CodeBlockIcon,
  HorizontalRuleIcon,
  ImageIcon,
  LinkIcon,
  OrderedListIcon,
  QuoteIcon,
  RedoIcon,
  TableIcon,
  TocIcon,
  UndoIcon,
} from './icons';

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;
type HeadingLevel = (typeof HEADING_LEVELS)[number];

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];

export interface ToolbarProps {
  editor: Editor;
  onRequestLink: () => void;
  onRequestCrossRef: () => void;
  onError: (message: string) => void;
}

interface ToolbarState {
  block: string;
  inTableCell: boolean;
  /**
   * Numbering of the heading at the cursor: 'on' / 'off' (its own setting), 'inherited'
   * (unnumbered because a parent heading is unnumbered), or null when it does not apply.
   */
  headingNumbering: 'on' | 'off' | 'inherited' | null;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  code: boolean;
  link: boolean;
  bulletList: boolean;
  orderedList: boolean;
  blockquote: boolean;
  codeBlock: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** 'on' inside a captioned figure / table, 'off' on a captionable image / table. */
  caption: 'on' | 'off' | null;
  /** The document has a table of contents (always its first node). */
  toc: boolean;
}

function headingNumberingAt(
  editor: Editor,
  level: HeadingLevel | undefined,
): ToolbarState['headingNumbering'] {
  // H6 is never numbered (design.md §5.4).
  if (level === undefined || level > 5) return null;
  const attributes = editor.getAttributes('heading');
  if (attributes['numbered'] === false) return 'off';
  const id: unknown = attributes['id'];
  const label = typeof id === 'string' ? getLabels(editor.state).headings.get(id) : undefined;
  // Sub-headings of an unnumbered heading are not numbered either.
  return label?.number === '' ? 'inherited' : 'on';
}

function selectToolbarState({ editor }: { editor: Editor }): ToolbarState {
  const level = HEADING_LEVELS.find((l) => editor.isActive('heading', { level: l }));
  return {
    block: level ? `h${String(level)}` : editor.isActive('paragraph') ? 'paragraph' : 'other',
    // Headings are not allowed in table cells (design.md §5.2).
    inTableCell: editor.isActive('tableCell') || editor.isActive('tableHeader'),
    headingNumbering: headingNumberingAt(editor, level),
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    underline: editor.isActive('underline'),
    strike: editor.isActive('strike'),
    code: editor.isActive('code'),
    link: editor.isActive('link'),
    bulletList: editor.isActive('bulletList'),
    orderedList: editor.isActive('orderedList'),
    blockquote: editor.isActive('blockquote'),
    codeBlock: editor.isActive('codeBlock'),
    canUndo: editor.can().undo(),
    canRedo: editor.can().redo(),
    caption: !editor.can().toggleCaption()
      ? null
      : editor.isActive('figure') || editor.isActive('tableFigure')
        ? 'on'
        : 'off',
    toc: findToc(editor.state.doc) !== null,
  };
}

function fileNameWithoutExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

export function Toolbar({ editor, onRequestLink, onRequestCrossRef, onError }: ToolbarProps) {
  const state = useEditorState({ editor, selector: selectToolbarState });
  const chain = () => editor.chain().focus();

  const setBlock = (value: string) => {
    if (value === 'paragraph') {
      chain().setParagraph().run();
      return;
    }
    const level = HEADING_LEVELS.find((l) => value === `h${String(l)}`);
    if (level !== undefined) {
      chain().setHeading({ level }).run();
    }
  };

  const insertImage = async () => {
    try {
      const image = await getFileAdapter().openImage(IMAGE_TYPES);
      if (image) {
        chain()
          .setImage({ src: image.dataUri, alt: fileNameWithoutExtension(image.name) })
          .run();
      }
    } catch (error: unknown) {
      console.error('Failed to insert image', error);
      onError(
        `画像を挿入できませんでした。${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  return (
    <div className="toolbar" role="toolbar" aria-label="書式">
      <ToolButton
        label="元に戻す"
        shortcut="Mod-Z"
        disabled={!state.canUndo}
        onClick={() => chain().undo().run()}
      >
        <UndoIcon />
      </ToolButton>
      <ToolButton
        label="やり直す"
        shortcut="Mod-Shift-Z"
        disabled={!state.canRedo}
        onClick={() => chain().redo().run()}
      >
        <RedoIcon />
      </ToolButton>
      <Separator />
      <select
        className="toolbar-select"
        aria-label="段落の種類"
        value={state.block}
        onChange={(event) => {
          setBlock(event.target.value);
        }}
      >
        <option value="paragraph">本文</option>
        {HEADING_LEVELS.map((level) => (
          <option key={level} value={`h${String(level)}`} disabled={state.inTableCell}>
            見出し {level}
          </option>
        ))}
        <option value="other" hidden>
          —
        </option>
      </select>
      <ToolButton
        label="見出し番号"
        title={
          state.headingNumbering === 'inherited'
            ? '見出し番号（上位の見出しが採番しないため、この見出しも採番されません）'
            : undefined
        }
        active={state.headingNumbering === 'on'}
        disabled={state.headingNumbering === null || state.headingNumbering === 'inherited'}
        onClick={() =>
          chain()
            .updateAttributes('heading', { numbered: state.headingNumbering === 'off' })
            .run()
        }
      >
        <span className="toolbar-number">1.1</span>
      </ToolButton>
      <Separator />
      <ToolButton
        label="太字"
        shortcut="Mod-B"
        active={state.bold}
        onClick={() => chain().toggleBold().run()}
      >
        <b>B</b>
      </ToolButton>
      <ToolButton
        label="斜体"
        shortcut="Mod-I"
        active={state.italic}
        onClick={() => chain().toggleItalic().run()}
      >
        <i className="toolbar-italic">I</i>
      </ToolButton>
      <ToolButton
        label="下線"
        shortcut="Mod-U"
        active={state.underline}
        onClick={() => chain().toggleUnderline().run()}
      >
        <u>U</u>
      </ToolButton>
      <ToolButton
        label="取り消し線"
        shortcut="Mod-Shift-S"
        active={state.strike}
        onClick={() => chain().toggleStrike().run()}
      >
        <s>S</s>
      </ToolButton>
      <ToolButton
        label="インラインコード"
        shortcut="Mod-E"
        active={state.code}
        onClick={() => chain().toggleCode().run()}
      >
        <code className="toolbar-code">{'</>'}</code>
      </ToolButton>
      <Separator />
      <ToolButton
        label="箇条書き"
        shortcut="Mod-Shift-8"
        active={state.bulletList}
        onClick={() => chain().toggleBulletList().run()}
      >
        <BulletListIcon />
      </ToolButton>
      <ToolButton
        label="番号付きリスト"
        shortcut="Mod-Shift-7"
        active={state.orderedList}
        onClick={() => chain().toggleOrderedList().run()}
      >
        <OrderedListIcon />
      </ToolButton>
      <ToolButton
        label="引用"
        shortcut="Mod-Shift-B"
        active={state.blockquote}
        onClick={() => chain().toggleBlockquote().run()}
      >
        <QuoteIcon />
      </ToolButton>
      <ToolButton
        label="コードブロック"
        shortcut="Mod-Alt-C"
        active={state.codeBlock}
        onClick={() => chain().toggleCodeBlock().run()}
      >
        <CodeBlockIcon />
      </ToolButton>
      <ToolButton label="リンク" shortcut="Mod-K" active={state.link} onClick={onRequestLink}>
        <LinkIcon />
      </ToolButton>
      <Separator />
      <ToolButton
        label="画像"
        showLabel
        onClick={() => {
          void insertImage();
        }}
      >
        <ImageIcon />
      </ToolButton>
      <ToolButton
        label="キャプション"
        showLabel
        title={
          state.caption === null
            ? 'キャプション（本文の画像・表を選ぶと付けられます。表のセル内は不可）'
            : 'キャプション'
        }
        active={state.caption === 'on'}
        disabled={state.caption === null}
        onClick={() => chain().toggleCaption().run()}
      >
        <CaptionIcon />
      </ToolButton>
      <ToolButton label="参照を挿入" showLabel onClick={onRequestCrossRef}>
        <CrossRefIcon />
      </ToolButton>
      <ToolButton
        label="目次"
        showLabel
        title={state.toc ? '目次（文書の先頭の目次を削除）' : '目次（文書の先頭に挿入）'}
        active={state.toc}
        onClick={() => chain().toggleToc().run()}
      >
        <TocIcon />
      </ToolButton>
      <ToolButton
        label="表"
        showLabel
        onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      >
        <TableIcon />
      </ToolButton>
      <ToolButton label="水平線" onClick={() => chain().setHorizontalRule().run()}>
        <HorizontalRuleIcon />
      </ToolButton>
    </div>
  );
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

function formatShortcut(shortcut: string): string {
  return shortcut
    .replace('Mod', isMac ? '⌘' : 'Ctrl')
    .replace('Alt', isMac ? '⌥' : 'Alt')
    .replace('Shift', isMac ? '⇧' : 'Shift')
    .replaceAll('-', isMac ? '' : '+');
}

interface ToolButtonProps {
  label: string;
  /** Tooltip; defaults to the label with the shortcut. */
  title?: string | undefined;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  showLabel?: boolean;
  onClick: () => void;
  children: ReactNode;
}

function ToolButton({
  label,
  title,
  shortcut,
  active,
  disabled,
  showLabel,
  onClick,
  children,
}: ToolButtonProps) {
  return (
    <button
      type="button"
      className={showLabel ? 'toolbar-button has-label' : 'toolbar-button'}
      aria-label={showLabel ? undefined : label}
      aria-pressed={active}
      title={title ?? (shortcut ? `${label}（${formatShortcut(shortcut)}）` : label)}
      disabled={disabled}
      // Keep the editor selection while clicking.
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={onClick}
    >
      {children}
      {showLabel && <span>{label}</span>}
    </button>
  );
}

function Separator() {
  return <div className="toolbar-separator" aria-hidden="true" />;
}
