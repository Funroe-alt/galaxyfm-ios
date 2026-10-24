// One player for two sources: downloaded songs (audio file URL) play in an
// <audio> element; everything else streams through the YouTube player.
import { markPlayed } from './store.js';

const audio = document.getElementById('audio');
const listeners = new Set();
const emit = () => listeners.forEach(fn => { try { fn(); } catch (_) {} });
// Errors are shown as a toast by main.js
const report = msg => window.dispatchEvent(new CustomEvent('gfm-error', { detail: msg }));

export const player = {
  queue: [],
  index: -1,
  playing: false,
  shuffle: false,
  repeat: 'off', // off | all | one
  source: null,  // 'audio' | 'yt'
  current: null,
  on(fn) { listeners.add(fn); },
};

// ── YouTube IFrame player (loaded on first use) ──
let yt = null;
let ytReady = null;
let ytPending = null;

function loadYT() {
  if (ytReady) return ytReady;
  ytReady = new Promise(resolve => {
    window.onYouTubeIframeAPIReady = () => {
      yt = new window.YT.Player('yt-player', {
        width: '200', height: '200',
        playerVars: { autoplay: 1, controls: 0, playsinline: 1, origin: location.origin },
        events: {
          onReady: () => resolve(),
          onStateChange: e => {
            const S = window.YT.PlayerState;
            if (player.source !== 'yt') return;
            if (e.data === S.PLAYING) { player.playing = true; emit(); }
            else if (e.data === S.PAUSED) { player.playing = false; emit(); }
            else if (e.data === S.ENDED) ended();
          },
          onError: e => {
            if (player.source !== 'yt') return;
            const why = { 2: 'bad video id', 5: 'player error', 100: 'video removed or private', 101: 'owner blocked playing outside YouTube', 150: 'owner blocked playing outside YouTube', 152: 'player blocked (embed error)', 153: 'player blocked (missing referrer)' }[e.data] || 'error ' + e.data;
            report(`Can't play "${player.current?.title || 'song'}": ${why}`);
            if (player.queue.length > 1) next(true); else { player.playing = false; emit(); }
          },
        },
      });
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { report("Couldn't load the YouTube player — check your internet"); ytReady = null; resolve(); };
    document.head.appendChild(s);
  });
  return ytReady;
}

audio.addEventListener('play', () => { if (player.source === 'audio') { player.playing = true; emit(); } });
audio.addEventListener('pause', () => { if (player.source === 'audio') { player.playing = false; emit(); } });
audio.addEventListener('ended', () => { if (player.source === 'audio') ended(); });
audio.addEventListener('error', () => {
  // If a downloaded file fails, fall back to streaming from YouTube.
  const t = player.current;
  if (player.source === 'audio' && t?.videoId) startYT(t.videoId);
});

function stopAll() {
  audio.pause();
  if (yt?.stopVideo) try { yt.stopVideo(); } catch (_) {}
}

let kickTimer = null;
async function startYT(videoId) {
  player.source = 'yt';
  audio.pause();
  await loadYT();
  if (!yt?.loadVideoById) return;
  yt.loadVideoById(videoId);
  yt.playVideo?.();
  // If autoplay got blocked, nudge it once more
  clearTimeout(kickTimer);
  kickTimer = setTimeout(() => {
    if (player.source !== 'yt' || player.current?.videoId !== videoId) return;
    const st = yt.getPlayerState?.();
    if (st === -1 || st === 5) yt.playVideo?.();
  }, 2500);
}

// Load the YouTube player as soon as the app opens, so tapping a song
// starts it instantly (browsers block playback that starts too long after a tap).
setTimeout(loadYT, 300);

function startAudio(url) {
  player.source = 'audio';
  if (yt?.stopVideo) try { yt.stopVideo(); } catch (_) {}
  audio.src = url;
  audio.play().catch(e => { if (e.name === 'NotAllowedError') report('Tap play to start'); });
}

function playCurrent() {
  const t = player.queue[player.index];
  if (!t) return;
  player.current = t;
  stopAll();
  if (t.url) startAudio(t.url);
  else if (t.videoId) startYT(t.videoId);
  if (t.id) markPlayed(t.id);
  updateMediaSession(t);
  emit();
}

function ended() {
  if (player.repeat === 'one') { seek(0); resume(); return; }
  next(true);
}

export function playQueue(tracks, startIndex = 0) {
  if (!tracks.length) return;
  player.queue = tracks.slice();
  player.index = Math.max(0, Math.min(startIndex, tracks.length - 1));
  if (player.shuffle) shuffleRest();
  playCurrent();
}

export function playOne(track) { playQueue([track], 0); }

export function addNext(track) {
  if (player.index < 0) return playOne(track);
  player.queue.splice(player.index + 1, 0, track);
  emit();
}

export function jumpTo(i) {
  if (i < 0 || i >= player.queue.length) return;
  player.index = i;
  playCurrent();
}

export function next(auto = false) {
  if (!player.queue.length) return;
  if (player.index < player.queue.length - 1) player.index++;
  else if (player.repeat === 'all' || !auto) player.index = 0;
  else { player.playing = false; emit(); return; }
  playCurrent();
}

export function prev() {
  if (currentTime() > 3) { seek(0); return; }
  if (player.index > 0) { player.index--; playCurrent(); }
  else seek(0);
}

export function toggle() {
  if (!player.current) return;
  player.playing ? pause() : resume();
}
export function pause() {
  if (player.source === 'audio') audio.pause();
  else if (yt?.pauseVideo) yt.pauseVideo();
}
export function resume() {
  if (player.source === 'audio') audio.play().catch(() => {});
  else if (yt?.playVideo) yt.playVideo();
}

export function currentTime() {
  if (player.source === 'audio') return audio.currentTime || 0;
  try { return yt?.getCurrentTime?.() || 0; } catch (_) { return 0; }
}
export function duration() {
  if (player.source === 'audio') return isFinite(audio.duration) ? audio.duration : 0;
  try { return yt?.getDuration?.() || 0; } catch (_) { return 0; }
}
export function seek(sec) {
  if (player.source === 'audio') audio.currentTime = sec;
  else if (yt?.seekTo) yt.seekTo(sec, true);
}

function shuffleRest() {
  const head = player.queue.slice(0, player.index + 1);
  const rest = player.queue.slice(player.index + 1);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  player.queue = head.concat(rest);
}
export function toggleShuffle() {
  player.shuffle = !player.shuffle;
  if (player.shuffle) shuffleRest();
  emit();
}
export function cycleRepeat() {
  player.repeat = player.repeat === 'off' ? 'all' : player.repeat === 'all' ? 'one' : 'off';
  emit();
}

// Lock-screen / media key controls where the platform supports them.
function updateMediaSession(t) {
  if (!('mediaSession' in navigator)) return;
  try {
    const img = t.art || t.thumb;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title || '', artist: t.artist || '', album: 'Galaxy.FM',
      artwork: img ? [{ src: img, sizes: '512x512' }] : [],
    });
    navigator.mediaSession.setActionHandler('play', resume);
    navigator.mediaSession.setActionHandler('pause', pause);
    navigator.mediaSession.setActionHandler('nexttrack', () => next());
    navigator.mediaSession.setActionHandler('previoustrack', prev);
  } catch (_) {}
}
