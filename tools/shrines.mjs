// 日本じゅうの神社の場所を OpenStreetMap（Overpass）から集め、1度ごとのマスに分けて shrines/ に置く。
// アプリは歩いている場所のマスだけを読むので、歩くたびに Overpass に聞かなくてよくなる。
// GitHub Actions（.github/workflows/shrines.yml）が月に1回うごかす。
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'shrines');
const URLS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const UA = 'osanpo-no-kuni shrine tiles (https://github.com/mario1367/-sodatsu)';
const STEP = 2; // 一度に聞く広さ（度）
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r5 = (x) => Math.round(x * 1e5) / 1e5;

// アプリの loadShrines と同じ条件
function query(s, w, n, e) {
  const bb = '(' + [s, w, n, e].join(',') + ')';
  return '[out:json][timeout:180];(nwr["religion"="shinto"]["amenity"="place_of_worship"]' + bb +
    ';nwr["religion"="shinto"]["building"]' + bb +
    ';nwr["religion"="shinto"]["historic"="wayside_shrine"]' + bb +
    ';nwr["building"="shrine"]' + bb +
    ';nwr["amenity"="place_of_worship"]["name"~"神社|神宮|大社|稲荷|八幡|天満宮|天神|明神|権現|神明|宮$|社$"]["religion"!~"buddhist|christian"]' + bb +
    ';nwr["building"]["name"~"神社|神宮|大社|稲荷社|八幡宮|天満宮"]' + bb + ';);out tags bb center;';
}

async function ask(q) {
  let wait = 20000;
  for (let t = 0; t < 8; t++) {
    const url = URLS[t % URLS.length];
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q), signal: AbortSignal.timeout(240000) });
      if (r.ok) {
        const j = await r.json();
        if (j.remark && /error/i.test(j.remark)) throw new Error('remark: ' + j.remark);
        return j.elements || [];
      }
      console.log('  ' + url + ' -> HTTP ' + r.status);
    } catch (e) { console.log('  ' + url + ' -> ' + e.message); }
    await sleep(wait);
    wait = Math.min(wait * 2, 180000);
  }
  return null;
}

function where(e) {
  const b = e.bounds;
  if (b) return { lat: (b.minlat + b.maxlat) / 2, lng: (b.minlon + b.maxlon) / 2, box: e.type === 'node' ? null : [b.minlat, b.minlon, b.maxlat, b.maxlon].map(r5) };
  if (e.center) return { lat: e.center.lat, lng: e.center.lon, box: null };
  if (e.lat != null) return { lat: e.lat, lng: e.lon, box: null };
  return null;
}

fs.mkdirSync(OUT, { recursive: true });
let failed = 0, total = 0, noPlace = 0;
for (let s = 24; s < 46; s += STEP) {
  for (let w = 122; w < 146; w += STEP) {
    const els = await ask(query(s, w, s + STEP, w + STEP));
    if (!els) { failed++; console.log(s + ',' + w + ': 取れなかった（前のデータを残す）'); continue; }
    const tiles = {};
    for (let a = s; a < s + STEP; a++) for (let o = w; o < w + STEP; o++) tiles[a + '_' + o] = new Map();
    for (const e of els) {
      const p = where(e);
      if (!p) { noPlace++; continue; }
      const k = Math.floor(p.lat) + '_' + Math.floor(p.lng);
      if (!tiles[k]) continue; // となりの範囲のマスは、そちらで数える
      const id = e.type[0] + e.id;
      const row = [id, (e.tags && e.tags.name) || '', r5(p.lat), r5(p.lng)];
      if (p.box) row.push(p.box);
      tiles[k].set(id, row);
    }
    for (const [k, m] of Object.entries(tiles)) {
      const f = path.join(OUT, k + '.json');
      if (m.size) fs.writeFileSync(f, JSON.stringify([...m.values()]).replace(/\],\[/g, '],\n['));
      else if (fs.existsSync(f)) fs.unlinkSync(f);
      total += m.size;
    }
    console.log(s + ',' + w + ': ' + els.length);
    await sleep(3000);
  }
}
const tiles = fs.readdirSync(OUT).filter((f) => /^-?\d+_-?\d+\.json$/.test(f)).map((f) => f.replace('.json', '')).sort();
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ updated: new Date().toISOString().slice(0, 10), tiles }));
console.log('神社 ' + total + ' か所、マス ' + tiles.length + '、場所なし ' + noPlace + '、取れなかった範囲 ' + failed);
if (failed > 20) process.exit(1);
