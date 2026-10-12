import {
  MAIN_MIN_WIDTH,
  PREVIEW_KEY_STEP,
  PREVIEW_MAX_ZOOM,
  PREVIEW_MIN_WIDTH,
  PREVIEW_MIN_ZOOM,
  PREVIEW_PAGE_WIDTH,
  clampPreviewWidth,
  previewWidthForKey,
  previewWidthRange,
  previewZoom,
} from './previewLayout';

describe('previewWidthRange', () => {
  it('leaves the minimum width to the editing area', () => {
    expect(previewWidthRange(1200)).toEqual({ min: PREVIEW_MIN_WIDTH, max: 1200 - MAIN_MIN_WIDTH });
  });

  it('keeps the preview at its minimum when there is not enough room', () => {
    expect(previewWidthRange(400)).toEqual({ min: PREVIEW_MIN_WIDTH, max: PREVIEW_MIN_WIDTH });
  });
});

describe('clampPreviewWidth', () => {
  const range = { min: 280, max: 700 };

  it('keeps widths inside the range and rounds them', () => {
    expect(clampPreviewWidth(100, range)).toBe(280);
    expect(clampPreviewWidth(900, range)).toBe(700);
    expect(clampPreviewWidth(450.6, range)).toBe(451);
  });
});

describe('previewWidthForKey', () => {
  const range = { min: 280, max: 700 };

  it('widens with ArrowLeft and narrows with ArrowRight', () => {
    expect(previewWidthForKey('ArrowLeft', 400, range)).toBe(400 + PREVIEW_KEY_STEP);
    expect(previewWidthForKey('ArrowRight', 400, range)).toBe(400 - PREVIEW_KEY_STEP);
  });

  it('stops at the ends of the range', () => {
    expect(previewWidthForKey('ArrowLeft', 695, range)).toBe(700);
    expect(previewWidthForKey('ArrowRight', 285, range)).toBe(280);
  });

  it('jumps to the minimum with Home and the maximum with End', () => {
    expect(previewWidthForKey('Home', 400, range)).toBe(280);
    expect(previewWidthForKey('End', 400, range)).toBe(700);
  });

  it('ignores other keys', () => {
    expect(previewWidthForKey('Enter', 400, range)).toBeNull();
  });
});

describe('previewZoom', () => {
  it('scales the page width to the frame width', () => {
    expect(previewZoom(PREVIEW_PAGE_WIDTH / 2)).toBe(0.5);
  });

  it('stays within the zoom limits', () => {
    expect(previewZoom(10)).toBe(PREVIEW_MIN_ZOOM);
    expect(previewZoom(PREVIEW_PAGE_WIDTH * 2)).toBe(PREVIEW_MAX_ZOOM);
  });
});
