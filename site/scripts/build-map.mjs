// Draws the engraved world map as plain SVG path data, so the browser needs
// no map library. Output: src/data/generated/world-map.json
//
// The museum counts England and Scotland separately, while Natural Earth has
// one United Kingdom, so the inset splits that shape with two clip polygons.
// Run with: npm run data:map (only needed when a new country appears in COUNTRY_INFO)
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoPath, geoNaturalEarth1, geoConicConformal, geoGraticule, geoCentroid } from 'd3-geo';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/generated');
const bot = JSON.parse(readFileSync(resolve(OUT, 'bot-data.json'), 'utf8'));
const load = (name) => {
  const topo = JSON.parse(readFileSync(require.resolve(`world-atlas/${name}`), 'utf8'));
  return feature(topo, topo.objects.countries).features;
};
const round = (d, k = 10) => (d ?? '').replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n) * k) / k));
// the world sheet is drawn small, half pixels are enough there
const coarse = (d) => round(d, 2);

// museum place -> Natural Earth name
const ATLAS_NAME = { 'United States': 'United States of America', England: 'United Kingdom', Scotland: 'United Kingdom' };
const places = Object.keys(bot.countryInfo).filter((c) => c !== 'International');

// ---------------------------------------------------------------- world sheet
const W = 1000, H = 500;
const world110 = load('countries-110m.json').filter((f) => f.properties.name !== 'Antarctica');
const proj = geoNaturalEarth1().fitExtent([[10, 10], [W - 10, H - 10]], { type: 'FeatureCollection', features: world110 });
const path = geoPath(proj);
const INSET_BOX = { west: -11.5, east: 9.5, south: 41.5, north: 59.6 };
const inBox = ([lon, lat]) => lon > INSET_BOX.west && lon < INSET_BOX.east && lat > INSET_BOX.south && lat < INSET_BOX.north;

const world = { width: W, height: H, land: '', graticule: round(path(geoGraticule().step([30, 30])())), outline: round(path({ type: 'Sphere' })), places: {} };
const insetPlaces = [];
const highlighted = new Set();
for (const place of places) {
  const f = world110.find((x) => x.properties.name === (ATLAS_NAME[place] ?? place));
  if (!f) { console.warn(`[build-map] No shape for "${place}". It will only appear in the list.`); continue; }
  // mainland centroid decides the sheet (France's overseas regions would drag it out to sea)
  const main = f.geometry.type === 'MultiPolygon'
    ? { type: 'Polygon', coordinates: f.geometry.coordinates.reduce((a, b) => (b[0].length > a[0].length ? b : a)) }
    : f.geometry;
  if (inBox(geoCentroid(main))) { insetPlaces.push(place); continue; }
  highlighted.add(f);
  const [x, y] = path.centroid(main);
  world.places[place] = { d: coarse(path(f)), x: Math.round(x), y: Math.round(y) };
}
world.land = coarse(path({ type: 'FeatureCollection', features: world110.filter((f) => !highlighted.has(f)) }));
{
  const a = proj([INSET_BOX.west, INSET_BOX.north]);
  const b = proj([INSET_BOX.east, INSET_BOX.south]);
  world.insetFrame = { x: Math.round(a[0]), y: Math.round(a[1]), width: Math.round(b[0] - a[0]), height: Math.round(b[1] - a[1]) };
}

// ---------------------------------------------------------------- inset: the British Isles and France
const IW = 300, IH = 330;
const world50 = load('countries-50m.json');
const boxGeo = { type: 'Polygon', coordinates: [[[INSET_BOX.west, INSET_BOX.south], [INSET_BOX.west, INSET_BOX.north], [INSET_BOX.east, INSET_BOX.north], [INSET_BOX.east, INSET_BOX.south], [INSET_BOX.west, INSET_BOX.south]]] };
const iproj = geoConicConformal().parallels([45, 57]).rotate([1, 0]).fitExtent([[0, 0], [IW, IH]], { type: 'MultiPoint', coordinates: boxGeo.coordinates[0] }).clipExtent([[0, 0], [IW, IH]]);
const ipath = geoPath(iproj);
const poly = (pts) => pts.map(([lat, lon]) => iproj([lon, lat]).map((n) => Math.round(n * 10) / 10).join(',')).join(' ');

// [lat, lon] outlines that cut England and Scotland out of the United Kingdom
const ENGLAND = [[54.98, -3.05], [55.81, -2.03], [55.81, 2.6], [49.6, 2.6], [49.6, -6.6], [51.25, -6.6], [51.55, -2.7], [53.35, -3.0], [53.6, -4.2], [54.7, -4.2]];
const SCOTLAND = [[54.98, -3.05], [54.6, -4.0], [54.55, -5.2], [55.25, -5.9], [55.6, -7.6], [61.0, -8.6], [61.0, 0.0], [55.81, -2.03]];

const near = world50.filter((f) => { const d = ipath(f); return d && d.length > 0; });
const inset = { width: IW, height: IH, land: '', places: {} };
const used = new Set();
for (const place of insetPlaces) {
  const f = world50.find((x) => x.properties.name === (ATLAS_NAME[place] ?? place));
  if (!f) continue;
  const entry = { d: round(ipath(f)) };
  if (place === 'England') { entry.clip = poly(ENGLAND); [entry.x, entry.y] = iproj([-1.2, 52.6]).map(Math.round); }
  else if (place === 'Scotland') { entry.clip = poly(SCOTLAND); [entry.x, entry.y] = iproj([-4.2, 56.8]).map(Math.round); }
  else {
    used.add(f);
    const main = f.geometry.type === 'MultiPolygon'
      ? { type: 'Polygon', coordinates: f.geometry.coordinates.reduce((a, b) => (b[0].length > a[0].length ? b : a)) }
      : f.geometry;
    [entry.x, entry.y] = ipath.centroid(main).map(Math.round);
  }
  inset.places[place] = entry;
}
inset.land = round(ipath({ type: 'FeatureCollection', features: near.filter((f) => !used.has(f)) }));
inset.graticule = round(ipath(geoGraticule().step([5, 5])()));

writeFileSync(resolve(OUT, 'world-map.json'), JSON.stringify({ world, inset }) + '\n');
console.log(`[build-map] world sheet: ${Object.keys(world.places).join(', ')}; inset: ${Object.keys(inset.places).join(', ')}`);
