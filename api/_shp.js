// Minimal readers for NHC's GIS downloads: a .zip archive holding shapefiles (.shp geometry + .dbf attributes).
// No dependencies; enough for points, lines and polygons. Files starting with "_" in /api are not routes on Vercel.
const zlib = require('zlib');

// Returns a Map of file name -> Buffer.
function unzip(buf) {
  const files = new Map();
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    if (method === 0) files.set(name, raw);
    else if (method === 8) files.set(name, zlib.inflateRawSync(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

function readDbf(buf) {
  const n = buf.readUInt32LE(4), headLen = buf.readUInt16LE(8), recLen = buf.readUInt16LE(10);
  const fields = [];
  for (let i = 32; i < headLen - 1 && buf[i] !== 0x0d; i += 32) {
    fields.push({ name: buf.toString('latin1', i, i + 11).replace(/\0.*$/, '').toLowerCase(), type: String.fromCharCode(buf[i + 11]), len: buf[i + 16] });
  }
  const rows = [];
  for (let r = 0; r < n; r++) {
    let o = headLen + r * recLen + 1;
    const row = {};
    for (const f of fields) {
      const s = buf.toString('latin1', o, o + f.len).trim();
      o += f.len;
      row[f.name] = (f.type === 'N' || f.type === 'F') ? (s === '' ? null : Number(s)) : s;
    }
    rows.push(row);
  }
  return rows;
}

// Signed area: shapefile outer rings run clockwise (negative here), holes counter-clockwise.
const ringArea = (ring) => { let a = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]); return a / 2; };

function readShp(buf) {
  const shapes = [];
  let o = 100;
  while (o + 8 <= buf.length) {
    const len = buf.readInt32BE(o + 4) * 2;
    const c = o + 8;
    const type = buf.readInt32LE(c);
    let geom = null;
    if (type === 1 || type === 11 || type === 21) geom = { type: 'Point', coordinates: [buf.readDoubleLE(c + 4), buf.readDoubleLE(c + 12)] };
    else if ([3, 5, 13, 15, 23, 25].includes(type)) {
      const parts = buf.readInt32LE(c + 36), points = buf.readInt32LE(c + 40);
      const idx = [];
      for (let i = 0; i < parts; i++) idx.push(buf.readInt32LE(c + 44 + i * 4));
      const pt0 = c + 44 + parts * 4;
      const rings = idx.map((s, i) => {
        const e = i + 1 < parts ? idx[i + 1] : points;
        const ring = [];
        for (let k = s; k < e; k++) ring.push([buf.readDoubleLE(pt0 + k * 16), buf.readDoubleLE(pt0 + k * 16 + 8)]);
        return ring;
      });
      if (type % 10 === 3) geom = rings.length === 1 ? { type: 'LineString', coordinates: rings[0] } : { type: 'MultiLineString', coordinates: rings };
      else {
        const polys = [];
        for (const ring of rings) { if (ringArea(ring) <= 0 || !polys.length) polys.push([ring]); else polys[polys.length - 1].push(ring); }
        geom = polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
      }
    }
    shapes.push(geom);
    o = c + len;
  }
  return shapes;
}

// GeoJSON FeatureCollection for the first shapefile in the archive whose name matches `re`.
function layer(files, re) {
  const base = [...files.keys()].find((k) => re.test(k) && /\.shp$/i.test(k));
  if (!base) return { type: 'FeatureCollection', features: [] };
  const stem = base.replace(/\.shp$/i, '');
  const shapes = readShp(files.get(base));
  const dbf = files.get(`${stem}.dbf`) || files.get(`${stem}.DBF`);
  const rows = dbf ? readDbf(dbf) : [];
  return { type: 'FeatureCollection', features: shapes.map((g, i) => (g ? { type: 'Feature', geometry: g, properties: rows[i] || {} } : null)).filter(Boolean) };
}

module.exports = { unzip, readDbf, readShp, layer };
