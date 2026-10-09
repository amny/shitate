import type { Extensions } from '@tiptap/core';
import type { DocNode, DocRoot } from '../model';
import { htmlToDoc } from './html';
import { jsonToDoc } from './json';
import { markdownToHtml } from './markdown';
import { findEmbeddedJson, readSelfFormat } from './selfFormat';
import type { ImportedFile, ImportResult } from './types';

export type { ImportedFile, ImportResult } from './types';

export interface ImportOptions {
  /** The editor's extensions, so imports use the same schema as the editor. */
  extensions: Extensions;
}

/** File extensions accepted by the open dialog. */
export const IMPORT_ACCEPT = ['.md', '.markdown', '.html', '.htm', '.json'];

type ImportFormat = 'markdown' | 'html' | 'json';

function detectFormat(name: string): ImportFormat | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
    return 'markdown';
  }
  if (lower.endsWith('.html') || lower.endsWith('.htm')) {
    return 'html';
  }
  if (lower.endsWith('.json')) {
    return 'json';
  }
  return null;
}

/**
 * Reads Markdown, external HTML, TipTap JSON or HTML exported by this app (design.md §6).
 */
export function importFile(file: ImportedFile, { extensions }: ImportOptions): ImportResult {
  const format = detectFormat(file.name);
  if (!format) {
    return {
      ok: false,
      error: `「${file.name}」は対応していないファイル形式です（${IMPORT_ACCEPT.join(' / ')}）`,
    };
  }

  try {
    const embeddedJson = format === 'html' ? findEmbeddedJson(file.text) : null;
    if (embeddedJson !== null) {
      // An exported file: restore from the embedded data, never from the rendered body.
      const restored = readSelfFormat(embeddedJson, extensions);
      if (!restored.ok) {
        return restored;
      }
      return {
        ok: true,
        kind: 'embedded',
        data: restored.data,
        warnings: collectWarnings(restored.data.state.doc),
      };
    }

    const doc = convert(format, file.text, extensions);
    if (!doc.ok) {
      return doc;
    }
    return { ok: true, kind: 'document', doc: doc.doc, warnings: collectWarnings(doc.doc) };
  } catch (error: unknown) {
    console.error(`Failed to import ${file.name}`, error);
    return {
      ok: false,
      error: `「${file.name}」を読み込めませんでした（${error instanceof Error ? error.message : String(error)}）`,
    };
  }
}

function convert(
  format: ImportFormat,
  text: string,
  extensions: Extensions,
): { ok: true; doc: DocRoot } | { ok: false; error: string } {
  switch (format) {
    case 'markdown':
      return { ok: true, doc: htmlToDoc(markdownToHtml(text), extensions) };
    case 'html':
      return { ok: true, doc: htmlToDoc(text, extensions) };
    case 'json':
      return jsonToDoc(text, extensions);
  }
}

function collectNodes(nodes: readonly DocNode[] | undefined): DocNode[] {
  return (nodes ?? []).flatMap((node) => [node, ...collectNodes(node.content)]);
}

function collectWarnings(doc: DocRoot): string[] {
  const externalImages = collectNodes(doc.content).filter((node) => {
    const src = node.attrs?.['src'];
    return node.type === 'image' && !(typeof src === 'string' && src.startsWith('data:'));
  });
  if (externalImages.length === 0) {
    return [];
  }
  return [
    `外部参照の画像が${String(externalImages.length)}件あります。このままエクスポートすると、HTMLが外部ファイルを参照します。画像を挿入し直してください。`,
  ];
}
