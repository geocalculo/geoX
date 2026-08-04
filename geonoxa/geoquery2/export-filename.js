(function (root) {
  'use strict';

  function buildExportFilename(moduleName, extension, date = new Date()) {
    const pad = value => String(value).padStart(2, '0');
    const timestamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
    const normalizedModuleName = String(moduleName).trim();
    const brandedModuleName = /^geonoxa$/i.test(normalizedModuleName) ? 'GeoNOXA' : normalizedModuleName.toLowerCase();
    const safeModuleName = brandedModuleName
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const safeExtension = String(extension)
      .toLowerCase()
      .replace(/^\./, '');

    return `${safeModuleName}_${timestamp}.${safeExtension}`;
  }

  root.buildExportFilename = buildExportFilename;
})(typeof window !== 'undefined' ? window : globalThis);
