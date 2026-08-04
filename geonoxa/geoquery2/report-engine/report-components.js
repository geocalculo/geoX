(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ReportComponents = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const escapeHtml = value => String(value ?? 'Sin información').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const present = value => value !== null && value !== undefined && String(value).trim() !== '';

  function renderDefinitionCard({ title, fields, className = '' }) {
    return `<div class="report-definition-card ${className}"><strong>${escapeHtml(title)}</strong><dl>${fields.filter(([, value]) => present(value)).map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl></div>`;
  }

  function renderHeader({ eyebrow, title, description = '', meta = '' }) {
    return `<header class="report-card__header"><div><span class="eyebrow">${escapeHtml(eyebrow)}</span><h2>${escapeHtml(title)}</h2>${description ? `<p>${escapeHtml(description)}</p>` : ''}</div>${meta ? `<div class="report-card__meta">${meta}</div>` : ''}</header>`;
  }

  const renderSummary = fields => `<div class="query-grid">${fields.map(([label, value]) => `<div class="datum"><b>${escapeHtml(label)}</b>${escapeHtml(value)}</div>`).join('')}</div>`;
  const renderMapPanel = ({ id, label, className = 'map' }) => `<div id="${escapeHtml(id)}" class="${escapeHtml(className)}" aria-label="${escapeHtml(label)}"></div>`;
  const renderIndicator = ({ code, value, interpretation, color = '#64748b' }) => `<div class="index" style="background:${escapeHtml(color)}"><small>${escapeHtml(code)}</small><strong>${value}</strong>${interpretation ? `<span>${escapeHtml(interpretation)}</span>` : ''}</div>`;
  const renderChart = content => `<div class="chart">${content}</div>`;
  const renderTable = ({ headings, rows }) => `<div class="table-wrap"><table><thead><tr>${headings.map(item => `<th>${escapeHtml(item)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  const renderFooter = text => `<footer class="report-footer">${escapeHtml(text)}</footer>`;
  const renderCluster = content => `<section class="report-card report-cluster">${content}</section>`;

  return { escapeHtml, renderHeader, renderSummary, renderMapPanel, renderCluster, renderIndicator, renderChart, renderTable, renderFooter, renderDefinitionCard };
});
