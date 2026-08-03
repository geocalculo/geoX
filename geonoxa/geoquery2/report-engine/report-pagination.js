(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ReportPagination = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DEFAULT_AVOID = ['.report-card', '.summary', '.report-identity', '.map', '.chart', '.tailings-list__item', 'tr'];

  function prepare(root, options = {}) {
    if (!root) throw new TypeError('ReportPagination.prepare requiere un elemento raíz');
    const selectors = options.avoid || DEFAULT_AVOID;
    root.classList.add('report-export-root');
    root.querySelectorAll(selectors.join(',')).forEach(element => element.classList.add('report-keep-together'));
    root.querySelectorAll('h1,h2,h3,h4,.report-card__header').forEach(element => element.classList.add('report-keep-with-next'));
    return () => {
      root.classList.remove('report-export-root');
      root.querySelectorAll('.report-keep-together,.report-keep-with-next').forEach(element => element.classList.remove('report-keep-together', 'report-keep-with-next'));
    };
  }

  function html2pdfOptions(options = {}) {
    return {
      margin: options.margin || [21, 10, 22, 10],
      html2canvas: { scale: options.scale || 2, useCORS: true, backgroundColor: '#ffffff', ...(options.html2canvas || {}) },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true, ...(options.jsPDF || {}) },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['.report-keep-together', '.report-keep-with-next'] }
    };
  }
  return { DEFAULT_AVOID, prepare, html2pdfOptions };
});
