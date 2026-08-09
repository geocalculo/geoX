#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { argumentsFrom, staticServer, VIEWPORT, PDF_OPTIONS } = require('./run-poc');

const POC_DIR = __dirname;
const REPO_ROOT = path.resolve(POC_DIR, '../../..');

async function waitForReport(page) {
  await page.waitForLoadState('networkidle', { timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('#geoquery-tailings-list > li').length === 10 && document.querySelector('#relaves-map')?._leaflet_id, null, { timeout: 30000 });
  await page.evaluate(async () => {
    await document.fonts?.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function auditPaginationTree(page) {
  return page.evaluate(() => {
    const properties = ['display', 'grid-template-columns', 'height', 'min-height', 'max-height', 'overflow', 'break-inside', 'page-break-inside', 'break-before', 'break-after', 'position', 'transform'];
    const audited = [];
    let element = document.querySelector('.tailings-related-layout');
    while (element && element !== document.body) {
      const styles = getComputedStyle(element);
      audited.push({ element: element.id ? `#${element.id}` : `.${Array.from(element.classList).join('.') || element.tagName.toLowerCase()}`, styles: Object.fromEntries(properties.map(property => [property, styles.getPropertyValue(property)])) });
      element = element.parentElement;
    }
    return audited;
  });
}

async function run(options) {
  const { chromium } = require('playwright');
  await fs.mkdir(options.output, { recursive: true });
  const server = await staticServer(REPO_ROOT);
  const query = new URLSearchParams(options.query);
  query.set('pdf', '1');
  const url = `http://127.0.0.1:${server.address().port}/geonoxa/geoquery2/geoquery.html?${query}`;
  const browser = await chromium.launch({ headless: !options.headed });
  const started = performance.now();
  try {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1, locale: 'es-CL' });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForReport(page);
    await page.addStyleTag({ path: path.join(POC_DIR, 'pdf-mode.css') });
    await page.addStyleTag({ path: path.join(POC_DIR, 'pagination-test.css') });
    await page.evaluate(() => document.documentElement.classList.add('playwright-pdf-mode', 'playwright-pagination-test'));
    const paginationTree = await auditPaginationTree(page);
    await page.screenshot({ path: path.join(options.output, 'pagination_test_before_pdf.png'), fullPage: true });
    await page.pdf({ path: path.join(options.output, 'pagination_test.pdf'), ...PDF_OPTIONS });
    return { url, elapsedMs: Math.round(performance.now() - started), paginationTree };
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

if (require.main === module) {
  run(argumentsFrom(process.argv.slice(2))).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error); process.exitCode = 1; });
}

module.exports = { auditPaginationTree, run, waitForReport };
