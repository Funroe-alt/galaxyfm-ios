import './styles.css';
import { isPcApp } from './config.js';
import {
  state, save, onChange, addTrack, removeTrack, updateTrack, findByVideoId, libraryTracks,
  isLiked, toggleLike, createPlaylist, getPlaylist, addToPlaylist, removeFromPlaylist,
  deletePlaylist, renamePlaylist, purgeOldCache, exportData, importData, clearAll,
} from './store.js';
import { search, trending } from './youtube.js';
import { fetchArt, fetchLyrics } from './meta.js';
import { serverUrl, serverOnline, download, listCloudSongs } from './cloud.js';
import { importPlaylist } from './importer.js';
import {
  player, playQueue, addNext, jumpTo, next, prev, toggle, currentTime, duration, seek,
  toggleShuffle, cycleRepeat,
} from './player.js';

const $ = s => document.querySelector(s);
const view = $('#view');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zm6 0h4v14h-4z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m9.5 16.2-4.2-4.2-1.4 1.4 5.6 5.6 11-11-1.4-1.4z"/></svg>',
  more: '<svg viewBox="0 0 24 24"><path d="M12 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20.5 10.6 19C5.4 14.4 2 11.3 2 7.5 2 4.4 4.4 2 7.5 2c1.7 0 3.4.8 4.5 2.1A6 6 0 0 1 16.5 2C19.6 2 22 4.4 22 7.5c0 3.8-3.4 6.9-8.6 11.5z"/></svg>',
  heartO: '<svg viewBox="0 0 24 24"><path d="M16.5 2A6 6 0 0 0 12 4.1 6 6 0 0 0 7.5 2C4.4 2 2 4.4 2 7.5c0 3.8 3.4 6.9 8.6 11.5L12 20.5l1.4-1.5C18.6 14.4 22 11.3 22 7.5 22 4.4 19.6 2 16.5 2zm-4.4 15.6-.1.1-.1-.1C7.1 13.3 4 10.5 4 7.5 4 5.5 5.5 4 7.5 4c1.5 0 3 1 3.6 2.4h1.8C13.5 5 15 4 16.5 4c2 0 3.5 1.5 3.5 3.5 0 3-3.1 5.8-7.9 10.1z"/></svg>',
  cloud: '<svg viewBox="0 0 24 24"><path d="M19.4 10A7 7 0 0 0 6.3 8 5.5 5.5 0 0 0 6.5 19h12.5a4.5 4.5 0 0 0 .4-9z"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24"><path d="M17 3h4v4l-1.4-1.4-3.8 3.8-1.4-1.4 3.8-3.8zM3 5.6 4.4 4.2l15.4 15.4V18h1.2v3h-4v-1.2h1.6z"/></svg>',
};

// ── Track lists: rows point at an array by key so actions know the context ──
const lists = {};
let dlProgress = {}; // videoId -> percent while downloading

function art(t) { return t.art || t.thumb || './icon-192.png'; }

function row(t, key, i, opts = {}) {
  const inLib = !!(t.id && state.tracks[t.id]) || !!findByVideoId(t.videoId);
  const playing = player.current && player.current.videoId === t.videoId;
  const dl = t.videoId in dlProgress ? `<span class="pill">${dlProgress[t.videoId]}%</span>` : '';
  const cloud = t.url ? `<span class="cloud" title="Downloaded">${ICON.cloud}</span>` : '';
  return `<div class="row${playing ? ' now' : ''}" data-l="${key}" data-i="${i}">
    ${opts.num ? `<span class="num">${i + 1}</span>` : ''}
    <img class="row-art" src="${esc(art(t))}" alt="" loading="lazy">
    <div class="row-text"><div class="row-title">${esc(t.title)}</div><div class="row-sub">${cloud}${esc(t.artist)}</div></div>
    ${dl}
    ${opts.noAdd ? '' : `<button class="icon-btn sm" data-act="add" aria-label="${inLib ? 'In library' : 'Add to library'}">${inLib ? ICON.check : ICON.plus}</button>`}
    <button class="icon-btn sm" data-act="menu" aria-label="More">${ICON.more}</button>
  </div>`;
}
function rows(tracks, key, opts) {
  lists[key] = tracks;
  return tracks.map((t, i) => row(t, key, i, opts)).join('');
}

// ── Router ──
let route = { name: 'home' };
function go(name, arg) {
  route = { name, arg };
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('on', b.dataset.view === name ||
    (name === 'playlist' && b.dataset.view === 'library')));
  render();
  view.scrollTop = 0;
}
function render() {
  const r = { home, search: searchView, library, playlist, settings }[route.name] || home;
  r(route.arg);
}

// ── Home ──
let trendingCache = null;
function home() {
  const h = new Date().getHours();
  const hello = h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Good night';
  const recent = state.recent.map(id => state.tracks[id]).filter(Boolean).slice(0, 6);
  const pls = state.playlists.slice(0, 10);
  view.innerHTML = `
    <header class="page-head"><h1>${hello}</h1></header>
    ${recent.length ? `<h2 class="sec">Jump back in</h2><div class="tiles">${recent.map((t, i) => `
      <button class="tile" data-tile="${i}"><img src="${esc(art(t))}" alt=""><span>${esc(t.title)}</span></button>`).join('')}</div>` : `
      <div class="hero"><div><h2>Start your library</h2><p>Search for any song, tap + to save it.</p></div>
      <button class="btn primary" data-go="search">Search music</button></div>`}
    ${pls.length ? `<h2 class="sec">Your playlists</h2><div class="shelf">${pls.map(p => plCard(p)).join('')}</div>` : ''}
    <h2 class="sec">Trending now</h2>
    <div id="trend">${trendingCache ? rows(trendingCache, 'trend') : '<div class="muted pad">Loading…</div>'}</div>`;
  lists.recent = recent;
  view.querySelectorAll('[data-tile]').forEach(b => b.onclick = () => playQueue(recent, +b.dataset.tile));
  if (!trendingCache) trending().then(list => {
    trendingCache = list;
    if (route.name === 'home') $('#trend').innerHTML = rows(list, 'trend');
  }).catch(e => { const el = $('#trend'); if (el) el.innerHTML = `<div class="muted pad">${esc(e.message)}</div>`; });
}

function plCover(p) {
  const imgs = p.trackIds.map(id => state.tracks[id]).filter(Boolean).slice(0, 4).map(art);
  if (imgs.length < 4) return `<div class="cover one"><img src="${esc(imgs[0] || './icon-192.png')}" alt=""></div>`;
  return `<div class="cover">${imgs.map(s => `<img src="${esc(s)}" alt="">`).join('')}</div>`;
}
function plCard(p) {
  return `<button class="card" data-pl="${p.id}">${plCover(p)}<div class="card-title">${esc(p.name)}</div>
    <div class="card-sub">${p.trackIds.length} songs</div></button>`;
}

// ── Search ──
let lastQuery = '';
let lastResults = [];
let searchTimer = null;
function searchView() {
  view.innerHTML = `
    <header class="page-head"><h1>Search</h1></header>
    <div class="search-box">${'<svg viewBox="0 0 24 24"><path d="M10.5 3a7.5 7.5 0 0 1 5.9 12.1l4.8 4.8-1.4 1.4-4.8-4.8A7.5 7.5 0 1 1 10.5 3zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z"/></svg>'}
      <input id="q" type="search" placeholder="Songs or artists" value="${esc(lastQuery)}" autocomplete="off" enterkeyhint="search"></div>
    <div id="results">${lastResults.length ? rows(lastResults, 'results') : '<div class="muted pad">Find any song on YouTube.</div>'}</div>`;
  const q = $('#q');
  q.oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => runSearch(q.value), 450); };
  q.onkeydown = e => { if (e.key === 'Enter') { clearTimeout(searchTimer); runSearch(q.value); q.blur(); } };
  if (!lastQuery) setTimeout(() => q.focus(), 50);
}
async function runSearch(text) {
  lastQuery = text;
  const box = $('#results');
  if (!text.trim()) { lastResults = []; box.innerHTML = ''; return; }
  box.innerHTML = '<div class="muted pad">Searching…</div>';
  try {
    lastResults = await search(text);
    if (route.name !== 'search' || lastQuery !== text) return;
    box.innerHTML = lastResults.length ? rows(lastResults, 'results') : '<div class="muted pad">No results.</div>';
  } catch (e) {
    box.innerHTML = `<div class="muted pad">${esc(e.message)}</div>`;
  }
}

// ── Library ──
let libTab = 'songs';
function library() {
  const songs = libraryTracks();
  const liked = state.liked.map(id => state.tracks[id]).filter(Boolean);
  view.innerHTML = `
    <header class="page-head row-head"><h1>Library</h1>
      <div class="head-actions">
        <label class="btn ghost">Import Spotify CSV<input type="file" accept=".csv" id="csv" hidden></label>
        <button class="btn ghost" data-act="sync">Sync cloud songs</button>
      </div></header>
    <div class="chips">
      <button class="chip${libTab === 'songs' ? ' on' : ''}" data-tab="songs">Songs ${songs.length}</button>
      <button class="chip${libTab === 'playlists' ? ' on' : ''}" data-tab="playlists">Playlists ${state.playlists.length}</button>
      <button class="chip${libTab === 'liked' ? ' on' : ''}" data-tab="liked">Liked ${liked.length}</button>
    </div>
    <div id="import-status"></div>
    <div id="lib-body"></div>`;
  const body = $('#lib-body');
  if (libTab === 'songs') {
    body.innerHTML = songs.length
      ? `<div class="list-actions"><button class="btn primary" data-playall="lib">${ICON.play} Play</button>
         <button class="btn ghost" data-shuffleall="lib">Shuffle</button></div>${rows(songs, 'lib')}`
      : '<div class="muted pad">No songs yet. Search and tap + to add them.</div>';
  } else if (libTab === 'liked') {
    body.innerHTML = liked.length ? rows(liked, 'liked') : '<div class="muted pad">Songs you like show up here.</div>';
  } else {
    body.innerHTML = `<div class="grid"><button class="card new" data-act="newpl"><div class="cover one plus">${ICON.plus}</div>
      <div class="card-title">New playlist</div></button>${state.playlists.map(plCard).join('')}</div>`;
  }
  view.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { libTab = b.dataset.tab; library(); });
  $('#csv').onchange = e => runImport(e.target.files[0]);
}

async function runImport(file) {
  if (!file) return;
  const status = $('#import-status');
  const text = await file.text();
  try {
    const res = await importPlaylist(file.name, text, (i, n, s) => {
      if (status) status.innerHTML = `<div class="progress-card"><div>Importing ${Math.min(i + 1, n)} of ${n}${s ? ' — ' + esc(s.title) : ''}</div>
        <div class="bar"><div style="width:${Math.round(i / Math.max(n, 1) * 100)}%"></div></div></div>`;
    });
    toast(`${res.playlist.name}: ${res.added} added, ${res.skipped} already there${res.failed.length ? `, ${res.failed.length} not found` : ''}`);
    libTab = 'playlists';
    go('playlist', res.playlist.id);
  } catch (e) {
    if (status) status.innerHTML = '';
    toast(e.message);
  }
}

async function syncCloud() {
  toast('Checking Cloudinary…');
  try {
    const songs = await listCloudSongs();
    let added = 0;
    for (const s of songs) {
      const existing = findByVideoId(s.videoId);
      if (existing) { if (existing.url !== s.url) updateTrack(existing.id, { url: s.url }); }
      else { addTrack(s); added++; }
    }
    toast(songs.length ? `${songs.length} cloud songs, ${added} new` : 'No songs in the cloud yet — download some from the PC app');
    render();
  } catch (e) { toast(e.message); }
}

// ── Playlist ──
function playlist(id) {
  const p = getPlaylist(id);
  if (!p) return go('library');
  const tracks = p.trackIds.map(t => state.tracks[t]).filter(Boolean);
  view.innerHTML = `
    <header class="pl-head">${plCover(p)}
      <div><div class="eyebrow">Playlist</div><h1>${esc(p.name)}</h1><div class="muted">${tracks.length} songs</div>
      <div class="list-actions">
        ${tracks.length ? `<button class="btn primary" data-playall="pl">${ICON.play} Play</button>
        <button class="btn ghost" data-shuffleall="pl">Shuffle</button>` : ''}
        <button class="btn ghost" data-act="renamepl">Rename</button>
        <button class="btn ghost danger" data-act="delpl">Delete</button>
      </div></div></header>
    ${tracks.length ? rows(tracks, 'pl', { num: true }) : '<div class="muted pad">Empty. Use ⋯ on any song to add it here.</div>'}`;
  lists.plId = id;
}

// ── Settings ──
async function settings() {
  const pc = isPcApp();
  // Web version (GitHub Pages / iPhone): an https page can't talk to the PC's http server
  const web = !pc && location.protocol === 'https:' && !window.Capacitor;
  view.innerHTML = `
    <header class="page-head"><h1>Settings</h1></header>
    <section class="panel">
      <h2>Downloads</h2>
      ${pc ? `<p class="muted">This PC downloads songs and uploads them to Cloudinary, so they stream on your phone and Chromebook too.</p>`
           : web ? `<p class="muted">The web / iPhone version can't download songs (browsers block it). Download on the PC or Android app, then use Sync cloud songs here.</p>`
           : `<p class="muted">Downloading needs the Galaxy.FM PC app running. At home you can download from this device too — enter the address the PC app shows.</p>
              <div class="field"><input id="srv" placeholder="http://192.168.1.20:5000" value="${esc(state.settings.serverUrl)}"><button class="btn primary" id="srv-save">Save</button></div>`}
      <div class="status" id="srv-status">Checking…</div>
    </section>
    <section class="panel">
      <h2>Cloud songs</h2>
      <p class="muted">Pull every song the PC app has uploaded into this device's library.</p>
      <button class="btn ghost" data-act="sync">Sync cloud songs</button>
    </section>
    <section class="panel">
      <h2>Backup</h2>
      <p class="muted">Move your library and playlists between devices.</p>
      <div class="list-actions"><button class="btn ghost" id="exp">Export backup</button>
      <label class="btn ghost">Import backup<input type="file" accept=".json" id="imp" hidden></label>
      <button class="btn ghost danger" id="wipe">Clear all data</button></div>
    </section>
    <section class="panel">
      <h2>About</h2>
      <p class="muted">Galaxy.FM 2.0 · Uses YouTube API Services. By using Galaxy.FM you agree to the
        <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener">YouTube Terms of Service</a>.
        <a href="https://funroe-alt.github.io/Galaxy.FM/privacy.html" target="_blank" rel="noopener">Privacy policy</a> ·
        <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Google Privacy Policy</a>.</p>
    </section>`;
  const st = $('#srv-status');
  const check = async () => {
    const base = serverUrl();
    if (web) { st.textContent = ''; return; }
    if (!base) { st.textContent = 'No PC app connected'; st.className = 'status'; return; }
    if (pc) {
      try {
        const info = await (await fetch(base + '/ping')).json();
        const lan = (info.lan || [])[0];
        st.textContent = lan ? `Download server running · on your phone enter: ${lan}` : 'Download server running';
        st.className = 'status ok';
      } catch (_) { st.textContent = 'Download server is not running'; st.className = 'status bad'; }
      return;
    }
    const ok = await serverOnline();
    st.textContent = ok ? `Connected to ${base}` : `Can't reach ${base}`;
    st.className = 'status ' + (ok ? 'ok' : 'bad');
  };
  check();
  const save2 = $('#srv-save');
  if (save2) save2.onclick = () => {
    let v = $('#srv').value.trim();
    if (v && !/^https?:\/\//.test(v)) v = 'http://' + v;
    state.settings.serverUrl = v; save(); check();
  };
  $('#exp').onclick = () => {
    const blob = new Blob([exportData()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'galaxy-fm-backup.json'; a.click();
  };
  $('#imp').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { importData(await f.text()); toast('Backup restored'); go('library'); } catch (err) { toast(err.message); }
  };
  $('#wipe').onclick = () => { if (confirm('Delete your whole library and playlists on this device?')) { clearAll(); toast('Cleared'); go('home'); } };
}

// ── Track actions ──
function trackFrom(el) {
  const r = el.closest('.row');
  if (!r) return null;
  return { list: lists[r.dataset.l] || [], i: +r.dataset.i, key: r.dataset.l };
}
function libVersion(t) { return (t.id && state.tracks[t.id]) || findByVideoId(t.videoId) || t; }

function addToLibrary(t) {
  const saved = addTrack({ videoId: t.videoId, title: t.title, artist: t.artist, thumb: t.thumb, art: t.art, url: t.url });
  if (!saved.art) fetchArt(saved.title, saved.artist).then(a => { if (a) updateTrack(saved.id, { art: a }); });
  return saved;
}

async function downloadTrack(t) {
  const saved = addToLibrary(t);
  if (saved.url) return toast('Already downloaded');
  if (!isPcApp() && location.protocol === 'https:' && !window.Capacitor) return toast('Downloading works in the PC and Android apps');
  if (!(await serverOnline())) return toast(isPcApp() ? 'Download server is not running' : 'Connect the PC app in Settings to download');
  dlProgress[saved.videoId] = 0; render();
  try {
    const url = await download(saved, pct => { dlProgress[saved.videoId] = Math.round(pct); refreshRows(); });
    updateTrack(saved.id, { url });
    toast(`Downloaded ${saved.title}`);
  } catch (e) {
    toast(e.message);
  } finally {
    delete dlProgress[saved.videoId]; render();
  }
}
function refreshRows() {
  document.querySelectorAll('.row').forEach(r => {
    const t = (lists[r.dataset.l] || [])[+r.dataset.i];
    if (!t) return;
    let pill = r.querySelector('.pill');
    if (t.videoId in dlProgress) {
      if (!pill) { pill = document.createElement('span'); pill.className = 'pill'; r.querySelector('.row-text').after(pill); }
      pill.textContent = dlProgress[t.videoId] + '%';
    } else if (pill) pill.remove();
  });
}

function trackMenu(t, ctx) {
  const saved = libVersion(t);
  const inLib = !!state.tracks[saved.id];
  const liked = inLib && isLiked(saved.id);
  const inPl = ctx.key === 'pl' && lists.plId;
  sheet(`
    <div class="sheet-head"><img src="${esc(art(t))}" alt=""><div><div class="row-title">${esc(t.title)}</div><div class="row-sub">${esc(t.artist)}</div></div></div>
    <button class="sheet-item" data-m="next">Play next</button>
    <button class="sheet-item" data-m="like">${liked ? 'Unlike' : 'Like'}</button>
    <button class="sheet-item" data-m="pl">Add to playlist</button>
    <button class="sheet-item" data-m="dl">${saved.url ? 'Downloaded ✓' : 'Download to cloud'}</button>
    ${inPl ? '<button class="sheet-item" data-m="unpl">Remove from this playlist</button>' : ''}
    ${inLib ? '<button class="sheet-item danger" data-m="rm">Remove from library</button>' : '<button class="sheet-item" data-m="add">Add to library</button>'}
  `, m => {
    if (m === 'next') { addNext(saved); toast('Playing next'); }
    if (m === 'add') { addToLibrary(t); toast('Added to library'); render(); }
    if (m === 'like') { const s = addToLibrary(t); toggleLike(s.id); render(); syncNP(); }
    if (m === 'dl') downloadTrack(t);
    if (m === 'rm') { removeTrack(saved.id); toast('Removed'); render(); }
    if (m === 'unpl') { removeFromPlaylist(lists.plId, saved.id); render(); }
    if (m === 'pl') setTimeout(() => playlistPicker(t), 50);
  });
}

function playlistPicker(t) {
  sheet(`<div class="sheet-title">Add to playlist</div>
    <button class="sheet-item" data-m="__new">+ New playlist</button>
    ${state.playlists.map(p => `<button class="sheet-item" data-m="${p.id}">${esc(p.name)} <span class="muted">${p.trackIds.length}</span></button>`).join('')}`,
  m => {
    const s = addToLibrary(t);
    let p;
    if (m === '__new') {
      const name = prompt('Playlist name');
      if (!name) return;
      p = createPlaylist(name);
    } else p = getPlaylist(m);
    if (!p) return;
    toast(addToPlaylist(p.id, s.id) ? `Added to ${p.name}` : `Already in ${p.name}`);
    render();
  });
}

// ── Sheet + toast ──
function sheet(html, onPick) {
  const wrap = $('#sheet'), card = $('#sheet-card');
  card.innerHTML = html;
  wrap.classList.remove('hidden');
  const close = () => wrap.classList.add('hidden');
  wrap.onclick = e => {
    const b = e.target.closest('[data-m]');
    if (b) { close(); onPick(b.dataset.m); }
    else if (e.target === wrap) close();
  };
}
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ── Global click handling ──
view.addEventListener('click', e => {
  const goBtn = e.target.closest('[data-go]');
  if (goBtn) return go(goBtn.dataset.go);
  const pl = e.target.closest('[data-pl]');
  if (pl) return go('playlist', pl.dataset.pl);
  const act = e.target.closest('[data-act]');
  if (act) {
    const a = act.dataset.act;
    const ctx = trackFrom(act);
    if (a === 'add' && ctx) {
      const t = ctx.list[ctx.i];
      if (findByVideoId(t.videoId)) return trackMenu(t, ctx);
      addToLibrary(t); toast('Added to library'); return render();
    }
    if (a === 'menu' && ctx) return trackMenu(ctx.list[ctx.i], ctx);
    if (a === 'sync') return syncCloud();
    if (a === 'newpl') { const n = prompt('Playlist name'); if (n) { const p = createPlaylist(n); go('playlist', p.id); } return; }
    if (a === 'renamepl') { const p = getPlaylist(route.arg); const n = prompt('Rename playlist', p?.name); if (n) { renamePlaylist(p.id, n); render(); } return; }
    if (a === 'delpl') { if (confirm('Delete this playlist? Songs stay in your library.')) { deletePlaylist(route.arg); go('library'); } return; }
  }
  const pa = e.target.closest('[data-playall]');
  if (pa) return playQueue(lists[pa.dataset.playall], 0);
  const sa = e.target.closest('[data-shuffleall]');
  if (sa) { if (!player.shuffle) toggleShuffle(); return playQueue(lists[sa.dataset.shuffleall], Math.floor(Math.random() * lists[sa.dataset.shuffleall].length)); }
  const r = trackFrom(e.target);
  if (r) {
    const list = r.list.map(libVersion);
    playQueue(list, r.i);
  }
});

document.querySelectorAll('.nav-btn').forEach(b => b.onclick = () => go(b.dataset.view));

// ── Mini player + Now playing ──
const npEl = $('#np');
let npTab = 'art';
let lyrics = null;
let lyricsFor = null;

function setPlayIcons() {
  const ic = player.playing ? ICON.pause : ICON.play;
  $('#mini-play').innerHTML = ic;
  $('#np-play').innerHTML = ic;
}

function syncNP() {
  const t = player.current;
  $('#mini').classList.toggle('hidden', !t);
  document.body.classList.toggle('has-mini', !!t);
  if (!t) return;
  const saved = libVersion(t);
  const img = art(saved);
  $('#mini-art').src = img;
  $('#mini-title').textContent = t.title;
  $('#mini-artist').textContent = t.artist;
  $('#np-art').src = img;
  $('#np-bg').style.backgroundImage = `url("${img}")`;
  $('#np-title').textContent = t.title;
  $('#np-artist').textContent = t.artist;
  const liked = state.tracks[saved.id] && isLiked(saved.id);
  $('#np-like').innerHTML = liked ? ICON.heart : ICON.heartO;
  $('#np-like').classList.toggle('on', !!liked);
  $('#np-shuffle').classList.toggle('on', player.shuffle);
  $('#np-repeat').classList.toggle('on', player.repeat !== 'off');
  $('#np-repeat').dataset.mode = player.repeat;
  setPlayIcons();
  if (npTab === 'queue') renderQueue();
  if (lyricsFor !== t.videoId) loadLyrics(t);
  if (!saved.art) fetchArt(t.title, t.artist).then(a => {
    if (!a) return;
    t.art = a;
    if (state.tracks[saved.id]) updateTrack(saved.id, { art: a });
    if (player.current === t) { $('#mini-art').src = a; $('#np-art').src = a; $('#np-bg').style.backgroundImage = `url("${a}")`; }
  });
}

async function loadLyrics(t) {
  lyricsFor = t.videoId;
  lyrics = null;
  const box = $('#np-lyrics');
  box.innerHTML = '<div class="muted pad center">Finding lyrics…</div>';
  // wait a moment so duration is known for a better match
  await new Promise(r => setTimeout(r, 1200));
  if (lyricsFor !== t.videoId) return;
  const res = await fetchLyrics(t.title, t.artist, duration()).catch(() => null);
  if (lyricsFor !== t.videoId) return;
  lyrics = res;
  if (!res) box.innerHTML = '<div class="muted pad center">No lyrics found for this song.</div>';
  else if (res.synced) box.innerHTML = res.synced.map((l, i) => `<p class="ly" data-t="${l.t}" data-k="${i}">${esc(l.text) || '♪'}</p>`).join('');
  else box.innerHTML = `<div class="plain">${esc(res.plain).replace(/\n/g, '<br>')}</div>`;
}

function renderQueue() {
  const q = player.queue;
  $('#np-queue').innerHTML = q.map((t, i) => `<button class="q-item${i === player.index ? ' on' : ''}" data-q="${i}">
    <img src="${esc(art(libVersion(t)))}" alt=""><span><b>${esc(t.title)}</b><small>${esc(t.artist)}</small></span></button>`).join('');
}
$('#np-queue').onclick = e => { const b = e.target.closest('[data-q]'); if (b) jumpTo(+b.dataset.q); };
$('#np-lyrics').onclick = e => { const p = e.target.closest('.ly'); if (p) seek(+p.dataset.t); };

document.querySelectorAll('[data-np]').forEach(b => b.onclick = () => {
  npTab = b.dataset.np;
  document.querySelectorAll('[data-np]').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.np-pane').forEach(p => p.classList.remove('on'));
  ({ art: $('#np-art-wrap'), lyrics: $('#np-lyrics'), queue: $('#np-queue') })[npTab].classList.add('on');
  if (npTab === 'queue') renderQueue();
});

$('#mini-open').onclick = () => { npEl.classList.remove('hidden'); requestAnimationFrame(() => npEl.classList.add('open')); };
$('#np-close').onclick = () => { npEl.classList.remove('open'); setTimeout(() => npEl.classList.add('hidden'), 280); };
$('#mini-play').onclick = toggle;
$('#np-play').onclick = toggle;
$('#mini-next').onclick = () => next();
$('#np-next').onclick = () => next();
$('#mini-prev').onclick = prev;
$('#np-prev').onclick = prev;
$('#np-shuffle').onclick = toggleShuffle;
$('#np-repeat').onclick = cycleRepeat;
$('#np-like').onclick = () => {
  const t = player.current; if (!t) return;
  const s = addToLibrary(t); toggleLike(s.id); syncNP();
};

let seeking = false;
const range = $('#np-range');
range.oninput = () => { seeking = true; $('#np-cur').textContent = fmt(range.value / 1000 * duration()); };
range.onchange = () => { seek(range.value / 1000 * duration()); seeking = false; };

let lastLine = -1;
setInterval(() => {
  if (!player.current) return;
  const cur = currentTime(), dur = duration();
  const pct = dur ? cur / dur : 0;
  $('#mini-bar').style.width = (pct * 100).toFixed(2) + '%';
  if (!seeking) {
    range.value = Math.round(pct * 1000);
    $('#np-cur').textContent = fmt(cur);
  }
  $('#np-dur').textContent = fmt(dur);
  if (lyrics?.synced && npTab === 'lyrics' && !npEl.classList.contains('hidden')) {
    let k = -1;
    for (let i = 0; i < lyrics.synced.length; i++) if (lyrics.synced[i].t <= cur + 0.25) k = i; else break;
    if (k !== lastLine) {
      lastLine = k;
      document.querySelectorAll('#np-lyrics .ly').forEach((p, i) => { p.classList.toggle('on', i === k); p.classList.toggle('past', i < k); });
      const el = document.querySelector(`#np-lyrics .ly[data-k="${k}"]`);
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }
}, 250);

window.addEventListener('gfm-error', e => toast(e.detail));
player.on(() => { syncNP(); if (['home', 'search', 'library', 'playlist'].includes(route.name)) markNowRows(); });
function markNowRows() {
  document.querySelectorAll('.row').forEach(r => {
    const t = (lists[r.dataset.l] || [])[+r.dataset.i];
    r.classList.toggle('now', !!(t && player.current && t.videoId === player.current.videoId));
  });
}

// Android back button / browser back closes the player first
window.addEventListener('keydown', e => { if (e.key === 'Escape' && !npEl.classList.contains('hidden')) $('#np-close').click(); });
document.addEventListener('keydown', e => {
  if (e.code === 'Space' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); toggle(); }
});

onChange(() => {});
purgeOldCache();
go('home');
if (isPcApp()) document.body.classList.add('pc');
