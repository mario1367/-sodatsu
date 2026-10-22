// 日本じゅうの神社の場所を OpenStreetMap のデータ（Geofabrik の日本の切り出し）から集め、
// 1度ごとのマスに分けて shrines/ に置く。アプリは歩いている場所のマスだけを読むので、
// 歩くたびに地図のサーバー（Overpass。こみあっていて答えが返ってこないことが多い）へ聞かなくてよくなる。
// GitHub Actions（.github/workflows/shrines.yml）が月に1回、osmium で絞りこんだ geojsonseq を渡してうごかす。
//   node tools/shrines.mjs shrines.geojsonseq
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'shrines');
const r5 = (x) => Math.round(x * 1e5) / 1e5;

// アプリの loadShrinesLive（Overpass に聞くとき）と同じ条件
const NAME_POW = /神社|神宮|大社|稲荷|八幡|天満宮|天神|明神|権現|神明|宮$|社$/;
const NAME_BUILDING = /神社|神宮|大社|稲荷社|八幡宮|天満宮/;
function isShrine(t) {
  if (t.religion === 'shinto' && (t.amenity === 'place_of_worship' || t.building || t.historic === 'wayside_shrine')) return true;
  if (t.building === 'shrine') return true;
  const name = t.name || '';
  if (t.amenity === 'place_of_worship' && NAME_POW.test(name) && !/buddhist|christian/.test(t.religion || '')) return true;
  if (t.building && NAME_BUILDING.test(name)) return true;
  return false;
}

function bounds(g) {
  let s = 90, w = 180, n = -90, e = -180;
  const walk = (c) => { if (typeof c[0] === 'number') { w = Math.min(w, c[0]); e = Math.max(e, c[0]); s = Math.min(s, c[1]); n = Math.max(n, c[1]); } else c.forEach(walk); };
  walk(g.coordinates);
  return [s, w, n, e];
}

const tiles = {};
let total = 0;
const rl = readline.createInterface({ input: fs.createReadStream(process.argv[2]) });
for await (let line of rl) {
  line = line.replace(/^\x1e/, '').trim();
  if (!line) continue;
  const f = JSON.parse(line);
  const t = f.properties || {};
  if (!isShrine(t) || !f.geometry) continue;
  const id = String(t['@type'] || 'n')[0] + t['@id'];
  const [s, w, n, e] = bounds(f.geometry);
  const lat = (s + n) / 2, lng = (w + e) / 2;
  const row = [id, t.name || '', r5(lat), r5(lng)];
  if (f.geometry.type !== 'Point') row.push([s, w, n, e].map(r5));
  const k = Math.floor(lat) + '_' + Math.floor(lng);
  (tiles[k] ||= new Map()).set(id, row);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const [k, m] of Object.entries(tiles)) {
  fs.writeFileSync(path.join(OUT, k + '.json'), JSON.stringify([...m.values()]).replace(/\],\[/g, '],\n['));
  total += m.size;
}
const keys = Object.keys(tiles).sort();
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ updated: new Date().toISOString().slice(0, 10), tiles: keys }));
console.log('神社 ' + total + ' か所、マス ' + keys.length);
if (total < 10000) { console.log('少なすぎるので、なにかおかしい'); process.exit(1); }
