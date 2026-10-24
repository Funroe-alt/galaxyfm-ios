// Persistent app state in localStorage (works in the browser, Android and PC app).
import { CONFIG } from './config.js';

const KEY = 'gfm2-state';

const defaults = () => ({
  tracks: {},        // id -> track
  order: [],         // library order, newest first
  playlists: [],     // { id, name, trackIds: [], createdAt }
  liked: [],         // track ids
  recent: [],        // track ids, newest first
  settings: { serverUrl: '', ytKeyIdx: 0 },
  cache: {},         // key -> { t: timestamp, v: value }
});

// Fix anything malformed so a bad backup can't break the app
function repair(s) {
  if (!s.tracks || typeof s.tracks !== 'object') s.tracks = {};
  if (!Array.isArray(s.playlists)) s.playlists = [];
  s.playlists.forEach(p => { if (!Array.isArray(p.trackIds)) p.trackIds = Array.isArray(p.tracks) ? p.tracks : []; });
  ['order', 'liked', 'recent'].forEach(k => { if (!Array.isArray(s[k])) s[k] = []; });
  if (!s.settings || typeof s.settings !== 'object') s.settings = { serverUrl: '', ytKeyIdx: 0 };
  return s;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    return repair(Object.assign(defaults(), JSON.parse(raw)));
  } catch (_) {
    return defaults();
  }
}

export const state = load();
const listeners = new Set();

let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
  }, 150);
  listeners.forEach(fn => { try { fn(); } catch (_) {} });
}
export function onChange(fn) { listeners.add(fn); }

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ── Tracks ──
// A track: { id, videoId, title, artist, thumb, art, url, addedAt }
export function findByVideoId(videoId) {
  return Object.values(state.tracks).find(t => t.videoId === videoId) || null;
}

export function addTrack(data) {
  const existing = data.videoId ? findByVideoId(data.videoId) : null;
  if (existing) {
    Object.assign(existing, Object.fromEntries(Object.entries(data).filter(([, v]) => v)));
    save();
    return existing;
  }
  const t = { id: uid(), addedAt: Date.now(), ...data };
  state.tracks[t.id] = t;
  state.order.unshift(t.id);
  save();
  return t;
}

export function updateTrack(id, patch) {
  if (!state.tracks[id]) return;
  Object.assign(state.tracks[id], patch);
  save();
}

export function removeTrack(id) {
  delete state.tracks[id];
  state.order = state.order.filter(x => x !== id);
  state.liked = state.liked.filter(x => x !== id);
  state.recent = state.recent.filter(x => x !== id);
  state.playlists.forEach(p => { p.trackIds = p.trackIds.filter(x => x !== id); });
  save();
}

export const libraryTracks = () => state.order.map(id => state.tracks[id]).filter(Boolean);
export const isLiked = id => state.liked.includes(id);
export function toggleLike(id) {
  state.liked = isLiked(id) ? state.liked.filter(x => x !== id) : [id, ...state.liked];
  save();
}
export function markPlayed(id) {
  state.recent = [id, ...state.recent.filter(x => x !== id)].slice(0, 30);
  save();
}

// ── Playlists ──
export function createPlaylist(name) {
  const p = { id: uid(), name: name.trim() || 'New playlist', trackIds: [], createdAt: Date.now() };
  state.playlists.unshift(p);
  save();
  return p;
}
export const getPlaylist = id => state.playlists.find(p => p.id === id);
export const findPlaylistByName = name =>
  state.playlists.find(p => p.name.toLowerCase() === name.trim().toLowerCase());
export function addToPlaylist(pid, tid) {
  const p = getPlaylist(pid);
  if (p && !p.trackIds.includes(tid)) { p.trackIds.push(tid); save(); return true; }
  return false;
}
export function removeFromPlaylist(pid, tid) {
  const p = getPlaylist(pid);
  if (p) { p.trackIds = p.trackIds.filter(x => x !== tid); save(); }
}
export function deletePlaylist(pid) {
  state.playlists = state.playlists.filter(p => p.id !== pid);
  save();
}
export function renamePlaylist(pid, name) {
  const p = getPlaylist(pid);
  if (p && name.trim()) { p.name = name.trim(); save(); }
}

// ── Cache (auto-expires after 30 days for YouTube API policy) ──
export function cacheGet(key) {
  const e = state.cache[key];
  if (!e) return undefined;
  if (Date.now() - e.t > CONFIG.CACHE_MAX_AGE_MS) { delete state.cache[key]; return undefined; }
  return e.v;
}
export function cacheSet(key, v) {
  state.cache[key] = { t: Date.now(), v };
  const keys = Object.keys(state.cache);
  if (keys.length > 400) {
    keys.sort((a, b) => state.cache[a].t - state.cache[b].t)
      .slice(0, keys.length - 400).forEach(k => delete state.cache[k]);
  }
  save();
}
export function purgeOldCache() {
  const now = Date.now();
  for (const k of Object.keys(state.cache)) {
    if (now - state.cache[k].t > CONFIG.CACHE_MAX_AGE_MS) delete state.cache[k];
  }
  save();
}

export function exportData() {
  const { cache, ...rest } = state;
  return JSON.stringify(rest, null, 2);
}
export function importData(json) {
  const data = JSON.parse(json);
  if (!data || typeof data.tracks !== 'object') throw new Error('Not a Galaxy.FM backup');
  Object.assign(state, defaults(), data, { cache: state.cache });
  repair(state);
  save();
}
export function clearAll() {
  Object.assign(state, defaults());
  save();
}
