// Spotify playlist import from an Exportify CSV (exportify.net).
import { search } from './youtube.js';
import { addTrack, findByVideoId, findPlaylistByName, createPlaylist, addToPlaylist } from './store.js';

// Full CSV parser: handles quotes, commas and line breaks inside quotes.
export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}

export function readSpotifyCSV(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  const head = rows[0].map(h => h.trim().toLowerCase());
  const col = (...names) => head.findIndex(h => names.some(n => h === n || h.startsWith(n)));
  const ti = col('track name', 'name', 'title');
  const ai = col('artist name(s)', 'artist name', 'artist');
  if (ti < 0) throw new Error('No "Track Name" column — export the playlist from exportify.net');
  return rows.slice(1).map(r => ({
    title: (r[ti] || '').trim(),
    artist: ai >= 0 ? (r[ai] || '').split(/[,;]/)[0].trim() : '',
  })).filter(s => s.title);
}

// Imports songs into a playlist named after the file. Re-importing the
// same playlist only adds songs it doesn't already have.
export async function importPlaylist(fileName, text, onStep) {
  const songs = readSpotifyCSV(text);
  const name = fileName.replace(/\.csv$/i, '').replace(/_/g, ' ').trim() || 'Spotify import';
  const pl = findPlaylistByName(name) || createPlaylist(name);
  const result = { added: 0, skipped: 0, failed: [] , playlist: pl };

  for (let i = 0; i < songs.length; i++) {
    const s = songs[i];
    onStep?.(i, songs.length, s);
    try {
      const hits = await search(`${s.artist} ${s.title}`, 5);
      if (!hits.length) throw new Error('not found');
      const best = hits[0];
      const existing = findByVideoId(best.videoId);
      const t = existing || addTrack({ ...best, title: s.title, artist: s.artist || best.artist });
      if (addToPlaylist(pl.id, t.id)) result.added++;
      else result.skipped++;
    } catch (e) {
      if (/quota|daily/i.test(e.message)) { result.failed.push(...songs.slice(i).map(x => x.title)); break; }
      result.failed.push(s.title);
    }
  }
  onStep?.(songs.length, songs.length, null);
  return result;
}
