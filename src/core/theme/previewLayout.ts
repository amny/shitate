/**
 * Layout of the theme editor's preview column (design.md §8.4): the width range the user can
 * drag it to, and how much the screen preview is scaled down to fit.
 */

/** Narrowest the preview column can be (px). */
export const PREVIEW_MIN_WIDTH = 280;
/** Width (px) always left to the central editing area. */
export const MAIN_MIN_WIDTH = 360;
/** Width change (px) per arrow key press on the separator. */
export const PREVIEW_KEY_STEP = 20;
/** The screen preview lays the document out on a viewport this wide (px), then scales it. */
export const PREVIEW_PAGE_WIDTH = 800;
export const PREVIEW_MIN_ZOOM = 0.3;
export const PREVIEW_MAX_ZOOM = 1;

export interface WidthRange {
  min: number;
  max: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/**
 * The widths the preview can take when the preview and the editing area share `sharedWidth` px.
 * The minimum wins when there is not enough room for both.
 */
export function previewWidthRange(sharedWidth: number): WidthRange {
  return {
    min: PREVIEW_MIN_WIDTH,
    max: Math.max(PREVIEW_MIN_WIDTH, sharedWidth - MAIN_MIN_WIDTH),
  };
}

export function clampPreviewWidth(width: number, range: WidthRange): number {
  return Math.round(clamp(width, range.min, range.max));
}

/**
 * The width after pressing `key` on the separator, or null when the key does nothing.
 * The separator is on the preview's left edge, so moving it left (ArrowLeft) widens the preview.
 */
export function previewWidthForKey(key: string, width: number, range: WidthRange): number | null {
  switch (key) {
    case 'ArrowLeft':
      return clampPreviewWidth(width + PREVIEW_KEY_STEP, range);
    case 'ArrowRight':
      return clampPreviewWidth(width - PREVIEW_KEY_STEP, range);
    case 'Home':
      return range.min;
    case 'End':
      return range.max;
    default:
      return null;
  }
}

/** Scale of the screen preview whose frame is `frameWidth` px wide. */
export function previewZoom(frameWidth: number): number {
  return clamp(frameWidth / PREVIEW_PAGE_WIDTH, PREVIEW_MIN_ZOOM, PREVIEW_MAX_ZOOM);
}
