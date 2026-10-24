// Downloads (through the PC app's built-in server) and Cloudinary song sync.
import { CONFIG, isPcApp } from './config.js';
import { state } from './store.js';

export function serverUrl() {
  if (isPcApp()) return location.origin;
  return (state.settings.serverUrl || '').replace(/\/+$/, '');
}

export async function serverOnline() {
  const base = serverUrl();
  if (!base) return false;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch(base + '/ping', { signal: ctrl.signal });
    clearTimeout(timer);
    return r.ok;
  } catch (_) {
    return false;
  }
}

// Starts a download and resolves with the Cloudinary URL when done.
// onProgress(percent, status) is called while it works.
export async function download(track, onProgress = () => {}) {
  const base = serverUrl();
  if (!base) throw new Error('Downloads need the Galaxy.FM PC app');
  const start = await fetch(base + '/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoId: track.videoId, title: track.title, artist: track.artist, thumb: track.thumb }),
  }).then(r => r.json());
  if (start.status === 'done') return start.url;
  if (start.status === 'error') throw new Error(start.message || 'Download failed');

  const began = Date.now();
  while (Date.now() - began < 6 * 60 * 1000) {
    await new Promise(r => setTimeout(r, 1500));
    const p = await fetch(base + '/progress/' + encodeURIComponent(track.videoId)).then(r => r.json()).catch(() => ({}));
    if (p.status === 'done') { onProgress(100, 'done'); return p.url; }
    if (p.status === 'error') throw new Error(p.message || 'Download failed');
    onProgress(p.progress || 0, p.status || 'downloading');
  }
  throw new Error('Download timed out');
}

// Lists every song the PC app has uploaded. Uses Cloudinary's public
// resource list, so no secret key is needed on the phone.
export async function listCloudSongs() {
  const url = `https://res.cloudinary.com/${CONFIG.CLOUDINARY_CLOUD}/video/list/${CONFIG.CLOUD_TAG}.json?_=${Date.now()}`;
  const r = await fetch(url);
  // 404 = no songs uploaded yet (e.g. after clearing the cloud)
  if (r.status === 404) return [];
  if (r.status === 401 || r.status === 403) {
    throw new Error('Turn on "Resource list" in Cloudinary settings (see the README)');
  }
  if (!r.ok) throw new Error('Could not reach Cloudinary');
  const data = await r.json();
  return (data.resources || []).map(res => {
    const c = res.context?.custom || {};
    const vid = c.videoId || res.public_id.split('/').pop();
    return {
      videoId: vid,
      title: c.title || vid,
      artist: c.artist || '',
      thumb: c.thumb || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
      url: `https://res.cloudinary.com/${CONFIG.CLOUDINARY_CLOUD}/video/upload/v${res.version}/${res.public_id}.${res.format}`,
    };
  });
}
