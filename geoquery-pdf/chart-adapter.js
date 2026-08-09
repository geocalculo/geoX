(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GeoQueryChartAdapter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  async function prepare(chart) {
    if (!chart) return () => {};
    const animation = chart.options?.animation;
    const animations = chart.options?.animations;
    if (chart.options) { chart.options.animation = false; chart.options.animations = false; }
    chart.resize?.();
    chart.update?.('none');
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return () => {
      if (chart.options) { chart.options.animation = animation; chart.options.animations = animations; }
      chart.resize?.();
      chart.update?.('none');
    };
  }

  return { prepare };
});
