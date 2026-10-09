/**
 * Image viewer of the exported HTML (design.md §7.3): clicking a body image that is shown
 * smaller than its natural size opens it at the natural size, with its figure caption.
 * Images larger than the window are scaled down to fit it (with the caption).
 *
 * Both strings are constants (no document data), so they need no escaping. The viewer
 * elements are created at runtime outside `.doc`, where the theme CSS does not reach.
 */

export const IMAGE_VIEWER_STYLE_ID = 'image-viewer';

export const IMAGE_VIEWER_CSS = `
html:has(.doc-image-viewer[open]) { overflow: hidden; }
.doc-image-viewer {
  box-sizing: border-box; width: 100vw; height: 100vh; max-width: none; max-height: none;
  margin: 0; padding: 0; border: 0; overflow: auto; background: transparent; color: #ffffff;
}
.doc-image-viewer::backdrop { background: rgba(0, 0, 0, 0.8); }
.doc-image-viewer-figure {
  box-sizing: border-box; display: flex; flex-direction: column; align-items: center;
  justify-content: center; width: 100%; min-height: 100%; margin: 0; padding: 56px 24px 32px;
}
.doc-image-viewer-figure img {
  display: block; max-width: none; max-height: none; background: #ffffff; cursor: zoom-out;
}
.doc-image-viewer-figure figcaption {
  max-width: 100%; margin-top: 12px; font: 14px/1.6 sans-serif; text-align: center;
}
.doc-image-viewer-figure figcaption:empty { display: none; }
.doc-image-viewer-figure .caption-number { margin-right: 0.5em; }
.doc-image-viewer-figure a { color: inherit; }
.doc-image-viewer-close {
  position: fixed; top: 12px; right: 12px; width: 36px; height: 36px; padding: 0;
  border: 0; border-radius: 50%; background: rgba(255, 255, 255, 0.2); color: #ffffff;
  font: 22px/36px sans-serif; cursor: pointer;
}
.doc-image-viewer-close:hover, .doc-image-viewer-close:focus-visible { background: rgba(255, 255, 255, 0.35); }
`;

export const IMAGE_VIEWER_SCRIPT = `
(() => {
  const body = document.querySelector('.doc-body');
  if (!body || typeof HTMLDialogElement !== 'function') return;

  const dialog = document.createElement('dialog');
  dialog.className = 'doc-image-viewer';
  dialog.setAttribute('aria-label', '画像の拡大表示');
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'doc-image-viewer-close';
  close.setAttribute('aria-label', '閉じる');
  close.textContent = '×';
  const figure = document.createElement('figure');
  figure.className = 'doc-image-viewer-figure';
  const image = document.createElement('img');
  const caption = document.createElement('figcaption');
  figure.append(image, caption);
  let natural = { width: 0, height: 0 };
  dialog.append(close, figure);
  document.body.append(dialog);

  const isReduced = (img) =>
    img.complete && img.naturalWidth > 0 && img.getBoundingClientRect().width < img.naturalWidth;

  const update = (img) => {
    const reduced = isReduced(img);
    img.style.cursor = reduced ? 'zoom-in' : '';
    if (reduced) {
      img.tabIndex = 0;
    } else {
      img.removeAttribute('tabindex');
    }
  };
  const updateAll = () => body.querySelectorAll('img').forEach(update);

  // The natural size, scaled down to fit the window together with the caption.
  const fit = () => {
    if (!dialog.open || natural.width === 0 || natural.height === 0) return;
    const box = getComputedStyle(figure);
    const captionBox = getComputedStyle(caption);
    const captionHeight =
      caption.childNodes.length > 0
        ? caption.getBoundingClientRect().height + parseFloat(captionBox.marginTop)
        : 0;
    const width =
      dialog.clientWidth - parseFloat(box.paddingLeft) - parseFloat(box.paddingRight);
    const height =
      dialog.clientHeight -
      parseFloat(box.paddingTop) -
      parseFloat(box.paddingBottom) -
      captionHeight;
    const scale = Math.max(
      0,
      Math.min(1, width / natural.width, height / natural.height),
    );
    image.style.width = Math.floor(natural.width * scale) + 'px';
    image.style.height = Math.floor(natural.height * scale) + 'px';
  };

  const open = (img) => {
    natural = { width: img.naturalWidth, height: img.naturalHeight };
    image.src = img.currentSrc || img.src;
    image.alt = img.alt;
    const source = img.closest('figure')?.querySelector('figcaption');
    caption.replaceChildren(
      ...(source ? Array.from(source.childNodes, (node) => node.cloneNode(true)) : []),
    );
    dialog.showModal();
    fit();
    dialog.scrollTo(0, 0);
  };

  const zoomableTarget = (target) => {
    const img = target instanceof Element ? target.closest('img') : null;
    return img && body.contains(img) && isReduced(img) ? img : null;
  };

  body.addEventListener('click', (event) => {
    const img = zoomableTarget(event.target);
    if (img) open(img);
  });
  body.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const img = zoomableTarget(event.target);
    if (!img) return;
    event.preventDefault();
    open(img);
  });
  // Any click closes the viewer, except on caption text (links in it still close it).
  dialog.addEventListener('click', (event) => {
    const target = event.target;
    if (target instanceof Element && caption.contains(target) && !target.closest('a')) return;
    dialog.close();
  });

  body.querySelectorAll('img').forEach((img) => {
    if (!img.complete) img.addEventListener('load', () => update(img));
  });
  window.addEventListener('resize', () => {
    updateAll();
    fit();
  });
  updateAll();
})();
`;
