// Album art (Last.fm) and lyrics (LRCLIB).
import { CONFIG } from './config.js';
import { cacheGet, cacheSet } from './store.js';
import { cleanTitle } from './youtube.js';

const LASTFM_BLANK = '2a96cbd8b46e442fc41c2b86b821562f';

export async function fetchArt(title, artist) {
  const ck = 'art:' + (artist + '|' + title).toLowerCase();
  const hit = cacheGet(ck);
  if (hit !== undefined) return hit;
  let art = null;
  try {
    const url = `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&api_key=${CONFIG.LASTFM_KEY}` +
      `&artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(cleanTitle(title))}&autocorrect=1&format=json`;
    const d = await (await fetch(url)).json();
    const imgs = d?.track?.album?.image || [];
    const big = [...imgs].reverse().find(i => i['#text'] && !i['#text'].includes(LASTFM_BLANK));
    if (big) art = big['#text'].replace(/\/\d+x\d+\//, '/600x600/');
  } catch (_) {}
  cacheSet(ck, art);
  return art;
}

// Returns { synced: [{t, text}] } or { plain: string } or null
export async function fetchLyrics(title, artist, durationSec) {
  const t = cleanTitle(title);
  const ck = 'lyr:' + (artist + '|' + t).toLowerCase();
  const hit = cacheGet(ck);
  if (hit !== undefined) return hit;

  let rec = null;
  try {
    const p = new URLSearchParams({ track_name: t, artist_name: artist });
    if (durationSec) p.set('duration', Math.round(durationSec));
    const r = await fetch('https://lrclib.net/api/get?' + p);
    if (r.ok) rec = await r.json();
  } catch (_) {}
  if (!rec || (!rec.syncedLyrics && !rec.plainLyrics)) {
    try {
      const r = await fetch('https://lrclib.net/api/search?q=' + encodeURIComponent(`${artist} ${t}`));
      const list = r.ok ? await r.json() : [];
      rec = list.find(x => x.syncedLyrics) || list.find(x => x.plainLyrics) || null;
    } catch (_) {}
  }

  let out = null;
  if (rec?.syncedLyrics) {
    const lines = [];
    for (const line of rec.syncedLyrics.split('\n')) {
      const m = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
      if (m) lines.push({ t: +m[1] * 60 + +m[2], text: m[3] });
    }
    if (lines.length) out = { synced: lines };
  }
  if (!out && rec?.plainLyrics) out = { plain: rec.plainLyrics };
  cacheSet(ck, out);
  return out;
}
