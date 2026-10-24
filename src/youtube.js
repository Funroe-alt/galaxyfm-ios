// YouTube Data API v3 — search and trending, with key rotation and 30-day cache.
import { CONFIG } from './config.js';
import { state, save, cacheGet, cacheSet } from './store.js';

const decode = s => {
  const el = document.createElement('textarea');
  el.innerHTML = s || '';
  return el.value;
};

function key() {
  const i = state.settings.ytKeyIdx || 0;
  return CONFIG.YOUTUBE_KEYS[i % CONFIG.YOUTUBE_KEYS.length];
}
function rotate() {
  state.settings.ytKeyIdx = ((state.settings.ytKeyIdx || 0) + 1) % CONFIG.YOUTUBE_KEYS.length;
  save();
}

async function ytFetch(path) {
  let lastErr = 'YouTube request failed';
  for (let i = 0; i < CONFIG.YOUTUBE_KEYS.length; i++) {
    const url = `https://www.googleapis.com/youtube/v3/${path}&key=${key()}`;
    let res;
    try { res = await fetch(url); } catch (_) { throw new Error('No internet connection'); }
    if (res.ok) return res.json();
    const body = await res.json().catch(() => ({}));
    const reason = body?.error?.errors?.[0]?.reason || '';
    lastErr = body?.error?.message || `HTTP ${res.status}`;
    if (res.status === 403 || res.status === 429 || /quota|rateLimit/i.test(reason)) { rotate(); continue; }
    break;
  }
  throw new Error(lastErr);
}

// Splits "Artist - Song (Official Video)" style titles.
export function cleanTitle(t) {
  return (t || '')
    .replace(/\s*[\(\[][^\)\]]*(official|lyric|audio|video|visualizer|music video|hd|4k|remaster|live)[^\)\]]*[\)\]]/gi, '')
    .replace(/\s*\|.*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}
export function splitArtist(rawTitle, channel) {
  const t = cleanTitle(rawTitle);
  const m = t.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (m) return { artist: m[1].trim(), title: m[2].trim() };
  return { artist: (channel || '').replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim(), title: t };
}

function toResult(id, sn) {
  const { title, artist } = splitArtist(decode(sn.title), decode(sn.channelTitle));
  const th = sn.thumbnails || {};
  return {
    videoId: id,
    title,
    artist,
    thumb: (th.high || th.medium || th.default || {}).url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  };
}

export async function search(q, max = 12) {
  q = q.trim();
  if (!q) return [];
  const ck = 'yt:s:' + q.toLowerCase() + ':' + max;
  const hit = cacheGet(ck);
  if (hit) return hit;
  const data = await ytFetch(
    `search?part=snippet&type=video&videoCategoryId=10&maxResults=${max}&q=${encodeURIComponent(q)}`
  );
  const out = (data.items || []).filter(i => i.id?.videoId).map(i => toResult(i.id.videoId, i.snippet));
  cacheSet(ck, out);
  return out;
}

export async function trending(region = 'US') {
  const ck = 'yt:trend:' + region;
  const hit = cacheGet(ck);
  // trending changes daily — refresh after 6 hours
  if (hit && Date.now() - state.cache[ck].t < 6 * 3600 * 1000) return hit;
  const data = await ytFetch(
    `videos?part=snippet&chart=mostPopular&videoCategoryId=10&maxResults=20&regionCode=${region}`
  );
  const out = (data.items || []).map(i => toResult(i.id, i.snippet));
  cacheSet(ck, out);
  return out;
}
