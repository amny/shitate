import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { isMermaidLanguage, MERMAID_LANGUAGE } from '../../core/diagram';
import { CODE_LANGUAGES, lowlight, resolveCodeLanguage } from '../../core/highlight';
import { renderMermaid } from '../mermaid';

/** Picker label for a code block without a language (plain text, not highlighted). */
export const PLAIN_CODE_LABEL = 'テキスト';

/** Picker label for a Mermaid diagram (design.md §5.9). */
export const MERMAID_CODE_LABEL = 'Mermaid（図）';

/** The diagram preview follows the code this long after typing stops (design.md §5.9). */
export const DIAGRAM_PREVIEW_DELAY_MS = 400;

/** Numbers the editor's diagram previews, so that the ids in their SVGs are unique. */
let previewCount = 0;

type HighlightRoot = ReturnType<typeof lowlight.highlight>;

function plainRoot(value: string): HighlightRoot {
  return { type: 'root', children: [{ type: 'text', value }] };
}

/**
 * The lowlight API the CodeBlockLowlight plugin calls, narrowed to our languages
 * (design.md §5.7): ids and aliases resolve through CODE_LANGUAGES, and code without a
 * supported language stays plain instead of being auto-detected.
 */
const editorLowlight = {
  highlight: (language: string, value: string): HighlightRoot => {
    const resolved = resolveCodeLanguage(language);
    return resolved ? lowlight.highlight(resolved.id, value) : plainRoot(value);
  },
  highlightAuto: plainRoot,
  listLanguages: (): string[] => [],
  registered: (language: string): boolean => resolveCodeLanguage(language) !== null,
};

function createLanguageSelect(): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'code-language-select';
  select.setAttribute('aria-label', 'コードの言語');
  select.append(
    new Option(PLAIN_CODE_LABEL, ''),
    new Option(MERMAID_CODE_LABEL, MERMAID_LANGUAGE),
    ...CODE_LANGUAGES.map(({ id, label }) => new Option(label, id)),
  );
  return select;
}

/**
 * Shows `language` in the picker. An alias selects its language; an unsupported value
 * gets its own option so that it is shown (and kept) as it is.
 */
function showLanguage(select: HTMLSelectElement, language: string | null): void {
  select.querySelector('option[data-unsupported]')?.remove();
  if (isMermaidLanguage(language)) {
    select.value = MERMAID_LANGUAGE;
    return;
  }
  const resolved = resolveCodeLanguage(language);
  if (resolved || !language) {
    select.value = resolved?.id ?? '';
    return;
  }
  const option = new Option(`${language}（ハイライトなし）`, language);
  option.dataset.unsupported = '';
  select.append(option);
  select.value = language;
}

function languageOf(node: ProseMirrorNode): string | null {
  return typeof node.attrs.language === 'string' ? node.attrs.language : null;
}

/**
 * The diagram of a Mermaid code block in the editor (design.md §5.9): a preview below the
 * code that follows edits 0.4 s after typing stops and keeps the last diagram while the
 * code has an error, the error itself, and a button that hides the code. All of it is
 * editing UI: the document keeps only the source, and the hidden state is not saved.
 */
function createDiagramPreview(onToggleCode: (hidden: boolean) => void) {
  const id = `mermaid-view-${String(++previewCount)}`;
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'code-diagram-toggle';
  const error = document.createElement('div');
  error.className = 'mermaid-error';
  // Not an alert: the error comes and goes while the code is typed.
  error.setAttribute('role', 'status');
  const diagram = document.createElement('div');
  diagram.className = 'mermaid-diagram';
  diagram.contentEditable = 'false';

  let codeHidden = false;
  let source: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Increased for every render request, so that a late result of an older one is dropped. */
  let generation = 0;

  const showCodeHidden = (hidden: boolean) => {
    codeHidden = hidden;
    toggle.textContent = hidden ? 'コードを表示' : 'コードを隠す';
    toggle.setAttribute('aria-pressed', String(hidden));
    diagram.title = hidden ? 'クリックでコードを表示' : '';
  };
  const setCodeHidden = (hidden: boolean) => {
    showCodeHidden(hidden);
    onToggleCode(hidden);
  };

  const showError = (message: string | null) => {
    error.textContent = message === null ? '' : `図を描画できません：${message}`;
    error.hidden = message === null;
  };

  const render = async (text: string) => {
    const current = ++generation;
    if (text.trim() === '') {
      diagram.replaceChildren();
      showError(null);
      return;
    }
    try {
      const result = await renderMermaid(text, id);
      if (current !== generation) return;
      if (result.ok) {
        // Sanitized by normalizeMermaidSvg.
        diagram.innerHTML = result.svg;
      }
      showError(result.ok ? null : result.message);
    } catch (loadError: unknown) {
      if (current !== generation) return;
      console.error('Failed to load Mermaid', loadError);
      showError('Mermaidを読み込めませんでした');
    }
  };

  toggle.addEventListener('click', () => {
    setCodeHidden(!codeHidden);
  });
  diagram.addEventListener('click', () => {
    if (codeHidden) setCodeHidden(false);
  });

  showCodeHidden(false);
  showError(null);

  return {
    toggle,
    error,
    diagram,
    /** Follows the code: the first time at once, then after typing stops. */
    update(text: string) {
      if (text === source) return;
      const first = source === null;
      source = text;
      clearTimeout(timer);
      if (first) {
        void render(text);
        return;
      }
      timer = setTimeout(() => void render(text), DIAGRAM_PREVIEW_DELAY_MS);
    },
    destroy() {
      clearTimeout(timer);
      generation++;
    },
  };
}

/**
 * Code block with syntax highlighting (design.md §5.7) and Mermaid diagrams (§5.9).
 * Highlighting is decorations only; the document stores just `language`. The picker and
 * the diagram preview are editing UI and are not exported.
 *
 * A code block is shown as `pre > code` like in the export, so that theme rules such as
 * `td > pre` apply in the editor too. A Mermaid block also has the diagram, so it is wrapped
 * in a div instead; switching to or from Mermaid recreates the view.
 */
export const HighlightedCodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ({ node: initialNode, editor, getPos }) => {
      let node = initialNode;
      const isMermaid = isMermaidLanguage(languageOf(node));
      const pre = document.createElement('pre');
      const contentDOM = document.createElement('code');
      pre.append(contentDOM);
      const tools = document.createElement('div');
      tools.className = 'code-block-tools';
      tools.contentEditable = 'false';
      const select = createLanguageSelect();

      let dom: HTMLElement = pre;
      let preview: ReturnType<typeof createDiagramPreview> | null = null;
      if (isMermaid) {
        const wrapper = document.createElement('div');
        dom = wrapper;
        preview = createDiagramPreview((hidden) => {
          wrapper.classList.toggle('is-code-hidden', hidden);
          if (hidden) return;
          // Shown again: put the cursor at the end of the code.
          const pos = getPos();
          if (typeof pos === 'number') editor.commands.focus(pos + 1 + node.content.size);
        });
        tools.append(preview.toggle, select);
        wrapper.append(pre, tools, preview.error, preview.diagram);
      } else {
        pre.append(tools);
        tools.append(select);
      }
      dom.classList.add('code-block-view');
      dom.classList.toggle('is-mermaid', isMermaid);

      const render = () => {
        const language = languageOf(node);
        contentDOM.className = language ? `language-${language}` : '';
        showLanguage(select, language);
        select.disabled = !editor.isEditable;
        preview?.update(node.textContent);
      };
      render();

      select.addEventListener('change', () => {
        const pos = getPos();
        if (typeof pos !== 'number') return;
        editor
          .chain()
          .command(({ tr }) => {
            tr.setNodeAttribute(pos, 'language', select.value === '' ? null : select.value);
            return true;
          })
          .run();
      });

      /** Editing UI around the code, which handles its own events. */
      const isEditingUi = (target: EventTarget | null) =>
        target instanceof Node && dom.contains(target) && !contentDOM.contains(target);

      return {
        dom,
        contentDOM,
        update: (updated) => {
          if (updated.type !== node.type) return false;
          if (isMermaidLanguage(languageOf(updated)) !== isMermaid) return false;
          node = updated;
          render();
          return true;
        },
        // Let the picker, the button and the diagram handle their own clicks and keys.
        stopEvent: (event) =>
          event.target !== dom && event.target !== pre && isEditingUi(event.target),
        // Only the code is document content; the rest is editing UI.
        ignoreMutation: (mutation) =>
          mutation.type !== 'selection' && !contentDOM.contains(mutation.target),
        destroy: () => {
          preview?.destroy();
        },
      };
    };
  },
}).configure({ lowlight: editorLowlight });
