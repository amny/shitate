import { generateJSON } from '@tiptap/core';
import type { Extensions } from '@tiptap/core';
import DOMPurify from 'dompurify';
import { docRootSchema } from '../model';
import type { DocRoot } from '../model';
import { normalizeImportedHtml } from './normalizeHtml';

/**
 * Removes scripts, embedded content, forms, event handlers and javascript: URLs.
 * Image data URIs are kept (DOMPurify allows data: on <img> by default).
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: [
      'style',
      'form',
      'input',
      'button',
      'textarea',
      'select',
      'iframe',
      'object',
      'embed',
    ],
    FORBID_ATTR: ['style'],
  });
}

/** External HTML → editor JSON using the editor's own schema (design.md §6). */
export function htmlToDoc(html: string, extensions: Extensions): DocRoot {
  const json: unknown = generateJSON(normalizeImportedHtml(sanitizeHtml(html)), extensions);
  return docRootSchema.parse(json);
}
