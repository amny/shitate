import { useEditorState } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import type { ReactNode } from 'react';
import { findTableFigure } from '../extensions/tableFigure';

export interface TableMenuProps {
  editor: Editor;
  /**
   * Where the menu element is placed. Must be outside `.doc` so that theme CSS
   * does not reach the menu (by default BubbleMenu uses the editor's parent, i.e. `.doc`).
   */
  container: () => HTMLElement;
}

/** DOM element of the innermost table around the selection. */
function findTableElement(editor: Editor): HTMLElement | null {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === 'table') {
      const dom = editor.view.nodeDOM($from.before(depth));
      return dom instanceof HTMLElement ? dom : null;
    }
  }
  return null;
}

function selectTableMenuState({ editor }: { editor: Editor }) {
  const can = editor.can();
  return {
    addRow: can.addRowAfter(),
    addColumn: can.addColumnAfter(),
    deleteRow: can.deleteRow(),
    deleteColumn: can.deleteColumn(),
    mergeCells: can.mergeCells(),
    splitCell: can.splitCell(),
    toggleHeaderRow: can.toggleHeaderRow(),
    deleteTable: can.deleteTableWithCaption(),
    /** null when the table has no caption (only captioned tables can be landscape). */
    landscape: findTableFigure(editor.state)?.landscape ?? null,
  };
}

/** Operations bar shown at the top right of the table being edited. */
export function TableMenu({ editor, container }: TableMenuProps) {
  const state = useEditorState({ editor, selector: selectTableMenuState });
  const chain = () => editor.chain().focus();

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="tableMenu"
      appendTo={container}
      className="table-menu"
      role="toolbar"
      aria-label="表の操作"
      shouldShow={({ editor: current }) => current.isEditable && current.isActive('table')}
      getReferencedVirtualElement={() => findTableElement(editor)}
      options={{ placement: 'top-end', offset: 8, flip: true, shift: { padding: 8 } }}
    >
      <MenuGroupLabel>行</MenuGroupLabel>
      <MenuButton
        label="行を上に追加"
        disabled={!state.addRow}
        onClick={() => chain().addRowBefore().run()}
      >
        上に追加
      </MenuButton>
      <MenuButton
        label="行を下に追加"
        disabled={!state.addRow}
        onClick={() => chain().addRowAfter().run()}
      >
        下に追加
      </MenuButton>
      <MenuButton
        label="行を削除"
        danger
        disabled={!state.deleteRow}
        onClick={() => chain().deleteRow().run()}
      >
        削除
      </MenuButton>
      <MenuSeparator />
      <MenuGroupLabel>列</MenuGroupLabel>
      <MenuButton
        label="列を左に追加"
        disabled={!state.addColumn}
        onClick={() => chain().addColumnBefore().run()}
      >
        左に追加
      </MenuButton>
      <MenuButton
        label="列を右に追加"
        disabled={!state.addColumn}
        onClick={() => chain().addColumnAfter().run()}
      >
        右に追加
      </MenuButton>
      <MenuButton
        label="列を削除"
        danger
        disabled={!state.deleteColumn}
        onClick={() => chain().deleteColumn().run()}
      >
        削除
      </MenuButton>
      <MenuSeparator />
      <MenuButton
        label="セルを結合"
        disabled={!state.mergeCells}
        onClick={() => chain().mergeCells().run()}
      >
        結合
      </MenuButton>
      <MenuButton
        label="セルを分割"
        disabled={!state.splitCell}
        onClick={() => chain().splitCell().run()}
      >
        分割
      </MenuButton>
      <MenuButton
        label="見出し行の切替"
        disabled={!state.toggleHeaderRow}
        onClick={() => chain().toggleHeaderRow().run()}
      >
        見出し行
      </MenuButton>
      <MenuSeparator />
      <MenuButton
        label="PDFで横向き"
        title={
          state.landscape === null
            ? 'PDFで横向き（キャプションを付けた表で指定できます）'
            : 'PDFで横向き'
        }
        pressed={state.landscape === true}
        disabled={state.landscape === null}
        onClick={() => chain().toggleTableLandscape().run()}
      >
        PDFで横向き
      </MenuButton>
      <MenuSeparator />
      <MenuButton
        label="表を削除"
        danger
        disabled={!state.deleteTable}
        onClick={() => chain().deleteTableWithCaption().run()}
      >
        表を削除
      </MenuButton>
    </BubbleMenu>
  );
}

interface MenuButtonProps {
  /** Full name for assistive technology and the tooltip; contains the visible text. */
  label: string;
  disabled: boolean;
  danger?: boolean;
  /** Toggle buttons show their state. */
  pressed?: boolean;
  /** Tooltip; defaults to the label. */
  title?: string;
  onClick: () => void;
  children: ReactNode;
}

function MenuButton({
  label,
  disabled,
  danger,
  pressed,
  title,
  onClick,
  children,
}: MenuButtonProps) {
  return (
    <button
      type="button"
      className={danger ? 'table-menu-button is-danger' : 'table-menu-button'}
      aria-label={label}
      aria-pressed={pressed}
      title={title ?? label}
      disabled={disabled}
      // Keep the cell selection while clicking.
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function MenuGroupLabel({ children }: { children: ReactNode }) {
  return (
    <span className="table-menu-group-label" aria-hidden="true">
      {children}
    </span>
  );
}

function MenuSeparator() {
  return <span className="table-menu-separator" aria-hidden="true" />;
}
