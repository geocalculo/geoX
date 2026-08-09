(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GeoQueryRenderStabilizer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const frame = () => new Promise(resolve => requestAnimationFrame(resolve));

  async function fonts(documentRef = document) {
    if (documentRef.fonts?.ready) await documentRef.fonts.ready;
  }

  async function images(root, timeout = 10000) {
    const pending = Array.from(root.querySelectorAll('img')).filter(image => !image.complete);
    await Promise.all(pending.map(image => new Promise(resolve => {
      const done = () => resolve();
      image.addEventListener('load', done, { once: true });
      image.addEventListener('error', done, { once: true });
      setTimeout(done, timeout);
    })));
  }

  async function layout(element, options = {}) {
    const stableFrames = options.stableFrames || 3;
    const timeout = options.timeout || 5000;
    const started = Date.now();
    let previous = '';
    let stable = 0;
    while (stable < stableFrames && Date.now() - started < timeout) {
      await frame();
      const rect = element.getBoundingClientRect();
      const signature = [rect.width, rect.height, element.scrollWidth, element.scrollHeight].map(Math.round).join(':');
      stable = signature === previous ? stable + 1 : 0;
      previous = signature;
    }
  }

  return { fonts, images, layout };
});
