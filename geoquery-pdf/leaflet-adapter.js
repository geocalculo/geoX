(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GeoQueryLeafletAdapter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function waitForTiles(map, timeout = 10000) {
    const container = map.getContainer();
    const loaded = () => !container.querySelector('.leaflet-tile-loading');
    if (loaded()) return Promise.resolve();
    return new Promise(resolve => {
      let finished = false;
      const done = () => {
        if (finished || !loaded()) return;
        finished = true;
        map.off('tileload tileerror load', done);
        resolve();
      };
      map.on('tileload tileerror load', done);
      setTimeout(() => { finished = true; map.off('tileload tileerror load', done); resolve(); }, timeout);
    });
  }

  async function prepare(map, options = {}) {
    if (!map?.getContainer) return () => {};
    const center = map.getCenter();
    const zoom = map.getZoom();
    const bounds = map.getBounds?.();
    const container = map.getContainer();
    const dimensions = container.getBoundingClientRect();
    if (!dimensions.width || !dimensions.height) return () => {};
    map.closePopup?.();
    map.invalidateSize({ animate: false, pan: false });
    if (bounds?.isValid?.()) map.fitBounds(bounds, { animate: false, padding: [0, 0] });
    map.setView(center, zoom, { animate: false });
    await waitForTiles(map, options.tileTimeout);
    return () => {
      map.invalidateSize({ animate: false, pan: false });
      map.setView(center, zoom, { animate: false });
    };
  }

  return { prepare, waitForTiles };
});
