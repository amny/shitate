import type { Editor } from '@tiptap/react';
import { useId, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { isAllowedLinkUrl } from '../createEditor';

export interface LinkPopoverProps {
  editor: Editor;
  onClose: () => void;
}

function currentHref(editor: Editor): string {
  const href: unknown = editor.getAttributes('link')['href'];
  return typeof href === 'string' ? href : '';
}

/** URL input for adding, changing or removing the link at the selection. */
export function LinkPopover({ editor, onClose }: LinkPopoverProps) {
  const [url, setUrl] = useState(() => currentHref(editor));
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();

  const close = () => {
    onClose();
    editor.commands.focus();
  };

  const apply = () => {
    const href = url.trim();
    if (href === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      onClose();
      return;
    }
    if (!isAllowedLinkUrl(href)) {
      setError('http://、https://、mailto:、# で始まるURLを入力してください');
      return;
    }
    const chain = editor.chain().focus();
    if (editor.state.selection.empty && !editor.isActive('link')) {
      // No text selected: insert the URL itself as the link text.
      chain.insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] });
    } else {
      chain.extendMarkRange('link').setLink({ href });
    }
    chain.run();
    onClose();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Ignore Enter/Escape that confirm or cancel IME conversion.
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      apply();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  return (
    <div className="link-popover" role="dialog" aria-label="リンクの編集">
      <label htmlFor={inputId}>リンク先URL</label>
      <input
        id={inputId}
        type="url"
        value={url}
        placeholder="https://"
        autoFocus
        aria-invalid={error !== null}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => {
          setUrl(event.target.value);
          setError(null);
        }}
        onKeyDown={handleKeyDown}
      />
      <button type="button" className="link-popover-apply" onClick={apply}>
        適用
      </button>
      <button type="button" onClick={close}>
        キャンセル
      </button>
      {error && (
        <p id={errorId} className="link-popover-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
