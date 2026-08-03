(function (root, factory) {
  const api = factory(root.ReportPagination);
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./report-pagination'));
  root.ReportPrint = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Pagination) {
  'use strict';
  async function exportPDF(reportData, options = {}) {
    if (!reportData?.element) throw new TypeError('exportPDF requiere reportData.element');
    const pdfFactory = options.html2pdf || globalThis.html2pdf;
    if (typeof pdfFactory !== 'function') throw new Error('html2pdf no está disponible');
    const cleanup = Pagination.prepare(reportData.element, options.pagination);
    reportData.element.classList.add('pdf-export-root');
    try {
      if (reportData.beforeExport) await reportData.beforeExport('pdf');
      const settings = { ...Pagination.html2pdfOptions(options), filename: reportData.filename };
      const worker = pdfFactory().set(settings).from(reportData.element).toPdf();
      const pdf = await worker.get('pdf');
      addPageFurniture(pdf, reportData);
      await worker.save();
      return pdf;
    } finally {
      reportData.element.classList.remove('pdf-export-root');
      cleanup();
      if (reportData.afterExport) await reportData.afterExport('pdf');
    }
  }

  function addPageFurniture(pdf, data) {
    const pages = pdf.getNumberOfPages();
    const width = pdf.internal.pageSize.getWidth();
    const height = pdf.internal.pageSize.getHeight();
    const date = (data.generatedAt || new Date()).toLocaleDateString(data.locale || 'es-CL');
    for (let page = 1; page <= pages; page += 1) {
      pdf.setPage(page); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(14, 116, 144);
      pdf.text(data.header || data.title || 'GeoFactory Report', 10, 13);
      pdf.setDrawColor(220, 226, 235); pdf.line(10, 16, width - 10, 16);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(107, 114, 128);
      pdf.text(`Fecha de generación: ${date}`, 10, height - 12);
      pdf.text(`Página ${page} de ${pages}`, width - 35, height - 12);
    }
  }
  return { exportPDF, addPageFurniture };
});
