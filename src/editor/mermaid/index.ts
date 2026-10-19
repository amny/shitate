import type mermaidApi from 'mermaid';
import { customAlphabet } from 'nanoid';
import { collectMermaidSources, normalizeMermaidSvg, replaceDiagramId } from '../../core/diagram';
import type { DocNode } from '../../core/model';

/** The result of rendering one Mermaid diagram (design.md §5.9). */
export type MermaidRenderResult = { ok: true; svg: string } | { ok: false; message: string };

type Mermaid = typeof mermaidApi;

/** The font the diagrams are measured and drawn with: the PDF font (design.md §10). */
const DIAGRAM_FONT_FAMILY = '"Noto Sans JP", sans-serif';
const CACHE_SIZE = 100;
/** Prefix of the ids the export gives its diagrams, numbered in document order (§5.9). */
const EXPORT_ID_PREFIX = 'mermaid-';

/** Temporary render ids: random, so that replacing them cannot hit other text in the SVG. */
const temporaryId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 16);

interface CachedResult {
  /** The id the SVG was rendered with; replaced by the caller's id when used. */
  temporaryId: string;
  result: MermaidRenderResult;
}

let loading: Promise<Mermaid> | null = null;
/** Mermaid renders one diagram at a time; calls are chained here. */
let queue: Promise<unknown> = Promise.resolve();
/** Rendered diagrams by source, oldest first (least recently used is evicted). */
const cache = new Map<string, CachedResult>();

/** Loads Mermaid and the diagram font on first use, so the editor's own chunk stays small. */
function loadMermaid(): Promise<Mermaid> {
  loading ??= (async () => {
    await Promise.all([
      import('@fontsource/noto-sans-jp/400.css'),
      import('@fontsource/noto-sans-jp/700.css'),
    ]);
    const { default: mermaid } = await import('mermaid');
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'neutral',
      // Pure SVG without foreignObject (S-2).
      htmlLabels: false,
      fontFamily: DIAGRAM_FONT_FAMILY,
    });
    return mermaid;
  })().catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}

/**
 * With htmlLabels off, Mermaid measures the labels with the font at render time, so the
 * subsets of the font that the source needs are loaded first.
 */
async function loadFont(source: string): Promise<void> {
  await Promise.all([
    document.fonts.load(`400 16px ${DIAGRAM_FONT_FAMILY}`, source),
    document.fonts.load(`700 16px ${DIAGRAM_FONT_FAMILY}`, source),
  ]);
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.trim() || '図を描画できませんでした';
}

async function renderUncached(source: string, id: string): Promise<MermaidRenderResult> {
  if (source.trim() === '') return { ok: false, message: '図のコードが空です' };
  const mermaid = await loadMermaid();
  await loadFont(source);
  try {
    const { svg } = await mermaid.render(id, source);
    return { ok: true, svg: normalizeMermaidSvg(svg) };
  } catch (error: unknown) {
    return { ok: false, message: errorMessage(error) };
  } finally {
    // Mermaid leaves its temporary container behind when rendering fails.
    document.getElementById(`d${id}`)?.remove();
  }
}

function remember(source: string, entry: CachedResult): void {
  cache.delete(source);
  cache.set(source, entry);
  for (const oldest of cache.keys()) {
    if (cache.size <= CACHE_SIZE) break;
    cache.delete(oldest);
  }
}

async function renderCached(source: string): Promise<CachedResult> {
  const cached = cache.get(source);
  if (cached) {
    remember(source, cached);
    return cached;
  }
  const id = `m${temporaryId()}`;
  const rendering = queue.then(() => renderUncached(source, id));
  queue = rendering.catch(() => undefined);
  const entry = { temporaryId: id, result: await rendering };
  remember(source, entry);
  return entry;
}

/**
 * Renders a Mermaid diagram as a normalized SVG whose ids start with `id` (design.md §5.9).
 * Results are cached by source. A syntax error is returned as Mermaid's message; failing
 * to load Mermaid itself rejects.
 */
export async function renderMermaid(source: string, id: string): Promise<MermaidRenderResult> {
  const { temporaryId: renderedId, result } = await renderCached(source);
  return result.ok ? { ok: true, svg: replaceDiagramId(result.svg, renderedId, id) } : result;
}

/** The diagrams of a document for the export (ExportOptions.diagrams). */
export interface PreparedDiagrams {
  /** Normalized SVGs in document order; null where the diagram could not be rendered. */
  diagrams: (string | null)[];
  /** Number of diagrams that could not be rendered (exported as code). */
  failedCount: number;
}

/**
 * Renders the Mermaid diagrams of `doc` in document order with the ids `mermaid-1`,
 * `mermaid-2`, … (design.md §7). Mermaid is not loaded for a document without diagrams.
 */
export async function prepareDiagrams(doc: DocNode): Promise<PreparedDiagrams> {
  const diagrams: (string | null)[] = [];
  for (const [index, source] of collectMermaidSources(doc).entries()) {
    const result = await renderMermaid(source, `${EXPORT_ID_PREFIX}${String(index + 1)}`);
    diagrams.push(result.ok ? result.svg : null);
  }
  return { diagrams, failedCount: diagrams.filter((svg) => svg === null).length };
}

/** Warning shown when an export leaves some diagrams as code (design.md §7). */
export function diagramFailureMessage(failedCount: number): string | null {
  return failedCount > 0
    ? `Mermaidの図${String(failedCount)}件を描画できなかったため、コードのまま出力しました`
    : null;
}
