import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { CODE_LANGUAGES, lowlight, resolveCodeLanguage } from '../../core/highlight';

/** Picker label for a code block without a language (plain text, not highlighted). */
export const PLAIN_CODE_LABEL = 'テキスト';

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
  select.contentEditable = 'false';
  select.setAttribute('aria-label', 'コードの言語');
  select.append(
    new Option(PLAIN_CODE_LABEL, ''),
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

/**
 * Code block with syntax highlighting (design.md §5.7). Highlighting is decorations only;
 * the document stores just `language`. The picker is editing UI and is not exported.
 */
export const HighlightedCodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ({ node: initialNode, editor, getPos }) => {
      let node = initialNode;
      const dom = document.createElement('pre');
      dom.className = 'code-block-view';
      const contentDOM = document.createElement('code');
      const select = createLanguageSelect();
      dom.append(contentDOM, select);

      const render = () => {
        const language = typeof node.attrs.language === 'string' ? node.attrs.language : null;
        contentDOM.className = language ? `language-${language}` : '';
        showLanguage(select, language);
        select.disabled = !editor.isEditable;
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

      return {
        dom,
        contentDOM,
        update: (updated) => {
          if (updated.type !== node.type) return false;
          node = updated;
          render();
          return true;
        },
        // Let the picker handle its own clicks and keys; ProseMirror ignores its DOM.
        stopEvent: (event) => event.target === select,
        ignoreMutation: (mutation) =>
          mutation.target === select || select.contains(mutation.target),
      };
    };
  },
}).configure({ lowlight: editorLowlight });
