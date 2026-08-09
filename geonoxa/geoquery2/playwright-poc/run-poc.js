#!/usr/bin/env node
'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const POC_DIR = __dirname;
const REPO_ROOT = path.resolve(POC_DIR, '../../..');
const DEFAULT_QUERY = 'queryLat=-30.25&queryLon=-71.08&site=GeoNOXA&basemap=osm';
const VIEWPORT = { width: 1440, height: 1100 };
const PDF_OPTIONS = { format: 'A4', landscape: false, printBackground: true, preferCSSPageSize: true, margin: { top: '12mm', right: '10mm', bottom: '14mm', left: '10mm' } };
const MIME = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.geojson': 'application/geo+json', '.png': 'image/png', '.svg': 'image/svg+xml' };

function argumentsFrom(argv) {
  const options = { output: path.join(POC_DIR, 'artifacts'), query: DEFAULT_QUERY, headed: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--output') options.output = path.resolve(argv[++index]);
    else if (argument === '--query') options.query = argv[++index];
    else if (argument === '--headed') options.headed = true;
    else throw new Error(`Argumento desconocido: ${argument}`);
  }
  return options;
}

function staticServer(root) {
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (file !== root && !file.startsWith(`${root}${path.sep}`)) throw new Error('Ruta fuera del repositorio');
      const contents = await fs.readFile(file);
      response.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      response.end(contents);
    } catch (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500);
      response.end(error.message);
    }
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function installMapProbe(page) {
  await page.addInitScript(() => {
    window.__playwrightPocMaps = [];
    window.__playwrightPocViewportCalls = [];
    let leaflet;
    Object.defineProperty(window, 'L', {
      configurable: true,
      get: () => leaflet,
      set(value) {
        leaflet = value;
        if (!value?.map || value.map.__playwrightPocWrapped) return;
        const original = value.map;
        const wrapped = function (...args) {
          const map = original.apply(this, args);
          const mapIndex = window.__playwrightPocMaps.push(map) - 1;
          ['fitBounds', 'setView'].forEach(method => {
            const implementation = map[method];
            map[method] = function (...callArgs) {
              if (!window.__playwrightPocReplaying) window.__playwrightPocViewportCalls.push({ mapIndex, method, args: callArgs });
              return implementation.apply(this, callArgs);
            };
          });
          return map;
        };
        Object.assign(wrapped, original);
        wrapped.__playwrightPocWrapped = true;
        value.map = wrapped;
      }
    });
  });
}

async function waitForReadiness(page) {
  await page.waitForLoadState('networkidle', { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('#query-grid')?.children.length > 0 && !document.querySelector('#hero-classification')?.textContent.includes('CURSO'), null, { timeout: 30000 });
  await page.evaluate(async () => {
    await document.fonts?.ready;
    await Promise.race([
      Promise.all(Array.from(document.images, image => image.complete ? undefined : new Promise(resolve => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      }))),
      new Promise(resolve => setTimeout(resolve, 10000))
    ]);
  });
}

async function readMapState(page, label) {
  return page.evaluate(stateLabel => ({
    label: stateLabel,
    maps: (window.__playwrightPocMaps || []).map((map, index) => {
      const container = map.getContainer();
      const bounds = map.getBounds();
      const pixelBounds = map.getPixelBounds?.();
      const pixelOrigin = map.getPixelOrigin?.();
      const point = value => value ? { x: value.x, y: value.y } : null;
      return {
        index,
        container: { width: container.clientWidth, height: container.clientHeight },
        center: { lat: map.getCenter().lat, lng: map.getCenter().lng },
        zoom: map.getZoom(),
        bounds: { north: bounds.getNorth(), east: bounds.getEast(), south: bounds.getSouth(), west: bounds.getWest() },
        pixelBounds: pixelBounds ? { min: point(pixelBounds.min), max: point(pixelBounds.max) } : null,
        pixelOrigin: point(pixelOrigin)
      };
    })
  }), label);
}

async function waitForTilesAndStableLayout(page) {
  await page.evaluate(async () => {
    const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    const maps = window.__playwrightPocMaps || [];
    const tiles = Promise.all(maps.map(map => new Promise(resolve => {
      const pending = [];
      map.eachLayer(layer => {
        if (layer.getTileUrl && layer.isLoading?.()) pending.push(new Promise(done => {
          layer.once('load', done);
          layer.once('tileerror', () => { if (!layer.isLoading?.()) done(); });
        }));
      });
      Promise.all(pending).then(resolve);
    })));
    await Promise.race([tiles, new Promise(resolve => setTimeout(resolve, 15000))]);
    let previous = '';
    let stable = 0;
    for (let frameIndex = 0; frameIndex < 120 && stable < 4; frameIndex += 1) {
      await frame();
      const report = document.querySelector('#report');
      const signature = `${report.scrollWidth}:${report.scrollHeight}:${document.body.scrollHeight}`;
      stable = signature === previous ? stable + 1 : 0;
      previous = signature;
    }
  });
}

async function runVariant(page, output, variant) {
  const states = [];
  states.push(await readMapState(page, 'ESTADO 0 — HTML normal'));
  await page.addStyleTag({ path: path.join(POC_DIR, 'pdf-mode.css') });
  await page.evaluate(async () => {
    document.documentElement.classList.add('playwright-pdf-mode');
    const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    await frame();
    await frame();
  });
  states.push(await readMapState(page, 'ESTADO 1 — layout PDF aplicado'));
  await page.evaluate(() => (window.__playwrightPocMaps || []).forEach(map => map.invalidateSize({ animate: false })));
  states.push(await readMapState(page, 'ESTADO 2 — invalidateSize ejecutado'));

  const replayedOperations = [];
  if (variant === 'B') {
    const operationCount = await page.evaluate(async () => {
      window.__playwrightPocReplaying = true;
      const calls = window.__playwrightPocViewportCalls || [];
      const latestByMap = new Map();
      calls.forEach(call => latestByMap.set(call.mapIndex, call));
      const replayed = [];
      latestByMap.forEach(call => {
        const map = window.__playwrightPocMaps[call.mapIndex];
        map[call.method](...call.args);
        replayed.push({ mapIndex: call.mapIndex, method: call.method });
      });
      window.__playwrightPocReplaying = false;
      window.__playwrightPocReplayed = replayed;
      return replayed.length;
    });
    if (!operationCount) throw new Error('La variante B no encontró una operación fitBounds/setView actual para reproducir');
    replayedOperations.push(...await page.evaluate(() => window.__playwrightPocReplayed));
  }

  await waitForTilesAndStableLayout(page);
  states.push(await readMapState(page, 'ESTADO 3 — justo antes de captura'));
  await page.screenshot({ path: path.join(output, `0${variant === 'A' ? 2 : 3}_playwright_${variant}_before_pdf.png`), fullPage: true });
  await page.pdf({ path: path.join(output, `GeoNOXA_Playwright_${variant}.pdf`), ...PDF_OPTIONS });
  return { variant, policy: variant === 'A' ? 'invalidateSize únicamente' : 'invalidateSize + última operación de encuadre actual por mapa', replayedOperations, states };
}

async function run(options) {
  const { chromium } = require('playwright');
  await fs.mkdir(options.output, { recursive: true });
  const server = await staticServer(REPO_ROOT);
  const query = new URLSearchParams(options.query);
  query.set('pdf', '1');
  const url = `http://127.0.0.1:${server.address().port}/geonoxa/geoquery2/geoquery.html?${query}`;
  const browser = await chromium.launch({ headless: !options.headed });
  const errors = [];
  const started = performance.now();
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, locale: 'es-CL' });
    const page = await context.newPage();
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await installMapProbe(page);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForReadiness(page);
    await page.screenshot({ path: path.join(options.output, '01_html_normal.png'), fullPage: true });

    const variants = [];
    for (const variant of ['A', 'B']) {
      if (variant === 'B') {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await waitForReadiness(page);
      }
      variants.push(await runVariant(page, options.output, variant));
    }
    const result = { url, elapsedMs: Math.round(performance.now() - started), viewport: VIEWPORT, deviceScaleFactor: 1, pdf: PDF_OPTIONS, variants, consoleErrors: errors };
    await fs.writeFile(path.join(options.output, 'leaflet-ab-states.json'), `${JSON.stringify(result, null, 2)}\n`);
    return result;
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

if (require.main === module) {
  run(argumentsFrom(process.argv.slice(2))).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error); process.exitCode = 1; });
}

module.exports = { argumentsFrom, staticServer, run, VIEWPORT, PDF_OPTIONS };
