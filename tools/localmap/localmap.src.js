// 検証環境専用: 外部に出られない環境で MapLibre を動かすための
//  - local:// ベクタータイル（GeoJSON を geojson-vt で切り出し → MVT）
//  - glyph:// フォント（TinySDF でブラウザ内生成）
import geojsonvt from 'geojson-vt';
import vtpbf from 'vt-pbf';
import { PbfWriter } from 'pbf';
import TinySDF from '@mapbox/tiny-sdf';

const LAYERS = ['water', 'waterway', 'park', 'landcover', 'landuse', 'building', 'transportation', 'boundary', 'place', 'poi', 'aerodrome_label'];
const indexes = {};
let ready = null;
function load() {
  if (!ready) ready = (async () => {
    const res = await fetch('basemap.json');
    const data = await res.json(); // { layerName: FeatureCollection }
    for (const name of LAYERS) {
      if (!data[name]) continue;
      indexes[name] = new geojsonvt(data[name], { maxZoom: 16, indexMaxZoom: 10, indexMaxPoints: 100000, tolerance: 3, extent: 4096, buffer: 64 });
    }
  })();
  return ready;
}
function tileFor(z, x, y) {
  const layers = {};
  for (const name of Object.keys(indexes)) {
    const t = indexes[name].getTile(z, x, y);
    if (t && t.features.length) layers[name] = t;
  }
  return vtpbf.fromGeojsonVt(layers, { version: 2, extent: 4096 });
}
// ---- glyphs ----
function encodeGlyphs(fontstack, range, glyphs) {
  const pbf = new PbfWriter();
  // glyphs { fontstack=1 { name=1, range=2, glyphs=3 { id=1, bitmap=2, width=3, height=4, left=5, top=6, advance=7 } } }
  pbf.writeMessage(1, (fs, p) => {
    p.writeStringField(1, fontstack);
    p.writeStringField(2, range);
    for (const g of glyphs) {
      p.writeMessage(3, (gl, q) => {
        q.writeVarintField(1, gl.id);
        q.writeBytesField(2, gl.bitmap);
        q.writeVarintField(3, gl.width);
        q.writeVarintField(4, gl.height);
        q.writeSVarintField(5, gl.left);
        q.writeSVarintField(6, gl.top);
        q.writeVarintField(7, gl.advance);
      }, g);
    }
  }, null);
  return pbf.finish();
}
const sdf = new TinySDF({ fontSize: 24, buffer: 3, radius: 8, cutoff: 0.25, fontFamily: '"Noto Sans CJK JP","IPAPGothic","IPAGothic",sans-serif', fontWeight: '500' });
function glyphRange(fontstack, range) {
  const [a, b] = range.split('-').map(Number);
  const glyphs = [];
  for (let id = a; id <= b; id++) {
    const ch = String.fromCodePoint(id);
    if (id < 32) continue;
    const g = sdf.draw(ch);
    if (!g.glyphWidth && id !== 32) continue;
    glyphs.push({ id, bitmap: g.data, width: g.glyphWidth, height: g.glyphHeight, left: g.glyphLeft, top: g.glyphTop - 24 + 17, advance: Math.round(g.glyphAdvance) });
  }
  return encodeGlyphs(fontstack, range, glyphs);
}
export function install(maplibregl) {
  maplibregl.addProtocol('local', async (params) => {
    try {
    await load();
    const m = params.url.match(/^local:\/\/tiles\/(\d+)\/(\d+)\/(\d+)/);
    const buf = tileFor(+m[1], +m[2], +m[3]);
    return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
    } catch (e) { console.error('local tile error', e && e.message); throw e; }
  });
  maplibregl.addProtocol('glyph', async (params) => {
    const m = params.url.match(/^glyph:\/\/([^/]+)\/(\d+-\d+)/);
    const buf = glyphRange(decodeURIComponent(m[1]), m[2]);
    return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  });
}
export async function debug(z, x, y) {
  await load();
  const info = {};
  for (const name of Object.keys(indexes)) { const t = indexes[name].getTile(z, x, y); info[name] = t ? t.features.length : 0; }
  const buf = tileFor(z, x, y);
  return { info, bytes: buf.byteLength, layers: Object.keys(indexes) };
}
export const tileJSON = { tilejson: '2.2.0', tiles: ['local://tiles/{z}/{x}/{y}'], minzoom: 0, maxzoom: 16 };
