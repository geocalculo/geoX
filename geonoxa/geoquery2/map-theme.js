(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; root.GeoNoxaMapTheme = api; })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function entityStyle(kind, basemap, selected) {
    if (basemap === 'sat') return { color: '#eaff00', fillColor: '#eaff00', fillOpacity: selected ? 0.34 : 0.2, weight: selected ? 4 : 2 };
    const color = kind === 'relaves' ? '#f97316' : kind === 'latente' ? '#f4b400' : '#d81b60';
    return { color, fillColor: color, fillOpacity: selected ? 0.34 : 0.2, weight: selected ? 4 : 2 };
  }
  function clusterStyle(basemap) { return { color: basemap === 'sat' ? '#eaff00' : '#ff7a00', weight: 2, dashArray: '8 6', fill: false }; }
  function distanceStyleFor(basemap) { return { color: basemap === 'sat' ? '#22d3ee' : '#0891b2', weight: 3, dashArray: '7 6' }; }
  function restyle(layers, basemap) { layers.forEach(item => item.layer.setStyle(item.kind === 'cluster' ? clusterStyle(basemap) : item.kind === 'distance' ? distanceStyleFor(basemap) : entityStyle(item.kind, basemap, item.selected))); }
  return { entityStyle, clusterStyle, distanceStyleFor, restyle, distanceStyle: { color: '#22d3ee', weight: 3, dashArray: '7 6' } };
});
