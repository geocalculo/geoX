(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; root.GeoNoxaMapTheme = api; })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function entityStyle(kind, basemap, selected) {
    if (basemap === 'sat') return { color: '#eaff00', fillColor: '#eaff00', fillOpacity: selected ? 0.34 : 0.2, weight: selected ? 4 : 2 };
    const color = kind === 'relaves' ? '#f97316' : kind === 'latente' ? '#f4b400' : '#d81b60';
    return { color, fillColor: color, fillOpacity: selected ? 0.34 : 0.2, weight: selected ? 4 : 2 };
  }
  function restyle(layers, basemap) { layers.forEach(item => item.layer.setStyle(entityStyle(item.kind, basemap, item.selected))); }
  return { entityStyle, restyle, distanceStyle: { color: '#22d3ee', weight: 3, dashArray: '7 6' } };
});
