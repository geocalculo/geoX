(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GeoQueryPDFPagination = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_AVOID = ['.report-card', '.summary', '.report-identity', '.map', '.chart', '.geoquery-list__item', 'tr'];
  const KEEP_WITH_NEXT = 'h1,h2,h3,h4,.report-card__header';

  function prepare(root, options = {}) {
    if (!root) throw new TypeError('GeoQueryPDFPagination.prepare requiere un elemento raíz');
    const selectors = options.avoid || DEFAULT_AVOID;
    root.classList.add('geoquery-pdf-export');
    root.querySelectorAll(selectors.join(',')).forEach(element => element.classList.add('pdf-avoid-break'));
    root.querySelectorAll(KEEP_WITH_NEXT).forEach(element => element.classList.add('pdf-keep-with-next'));
    return () => {
      root.classList.remove('geoquery-pdf-export');
      root.querySelectorAll('.pdf-avoid-break,.pdf-keep-with-next').forEach(element => element.classList.remove('pdf-avoid-break', 'pdf-keep-with-next'));
    };
  }

  function html2pdfOptions(options = {}) {
    return {
      margin: options.margin || [21, 10, 22, 10],
      html2canvas: { scale: options.scale || 2, useCORS: true, backgroundColor: '#ffffff', ...(options.html2canvas || {}) },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true, ...(options.jsPDF || {}) },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['.pdf-avoid-break', '.pdf-keep-with-next'], ...(options.pagebreak || {}) }
    };
  }

  return { DEFAULT_AVOID, prepare, html2pdfOptions };
});
