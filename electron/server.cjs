// Galaxy.FM PC download server.
// Runs inside the PC app. Downloads audio with yt-dlp (your home internet,
// which YouTube doesn't block) and uploads it to Cloudinary so every
// device can stream it.
const express = require('express');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');

cloudinary.config({ ...require('./secrets.cjs'), secure: true });

const TAG = 'galaxyfm';
const jobs = {}; // videoId -> { status, progress, url, message }

function ytdlpName() {
  if (process.platform === 'win32') return { file: 'yt-dlp.exe', asset: 'yt-dlp.exe' };
  if (process.platform === 'darwin') return { file: 'yt-dlp', asset: 'yt-dlp_macos' };
  return { file: 'yt-dlp', asset: 'yt-dlp_linux' };
}

function fetchToFile(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Galaxy.FM' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 6) {
        res.resume();
        return fetchToFile(res.headers.location, dest, redirects + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const out = fs.createWriteStream(dest);
      res.pipe(out);
      out.on('finish', () => out.close(resolve));
      out.on('error', reject);
    }).on('error', reject);
  });
}

async function ensureYtDlp(binDir, log) {
  const { file, asset } = ytdlpName();
  const bin = path.join(binDir, file);
  fs.mkdirSync(binDir, { recursive: true });
  if (!fs.existsSync(bin)) {
    log('Downloading yt-dlp (first run only)…');
    const tmp = bin + '.part';
    await fetchToFile(`https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`, tmp);
    fs.renameSync(tmp, bin);
    if (process.platform !== 'win32') fs.chmodSync(bin, 0o755);
    log('yt-dlp ready');
  } else {
    // Keep yt-dlp current — YouTube changes often and old versions break.
    execFile(bin, ['-U'], { timeout: 60000 }, () => {});
  }
  return bin;
}

async function existingUpload(videoId) {
  try {
    const r = await cloudinary.api.resource(`${TAG}/${videoId}`, { resource_type: 'video' });
    return r.secure_url;
  } catch (_) {
    return null;
  }
}

function runDownload(bin, job, { videoId, title, artist, thumb }) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gfm-'));
  const outTpl = path.join(tmpDir, videoId + '.%(ext)s');
  // m4a/webm audio as-is: no ffmpeg needed
  const args = ['-f', 'bestaudio[ext=m4a]/bestaudio', '--no-playlist', '--newline', '-o', outTpl,
    `https://www.youtube.com/watch?v=${videoId}`];
  const proc = spawn(bin, args, { windowsHide: true });
  let log = '';
  const onData = d => {
    const s = d.toString();
    log = (log + s).slice(-2000);
    const m = s.match(/(\d+(?:\.\d+)?)%/);
    if (m) job.progress = Math.min(95, Math.round(parseFloat(m[1]) * 0.9));
  };
  proc.stdout.on('data', onData);
  proc.stderr.on('data', onData);
  proc.on('error', e => { job.status = 'error'; job.message = e.message; });
  proc.on('close', async code => {
    const file = fs.readdirSync(tmpDir).find(f => f.startsWith(videoId) && !f.endsWith('.part'));
    if (code !== 0 || !file) {
      job.status = 'error';
      job.message = (log.match(/ERROR:.*$/m) || ['yt-dlp failed'])[0].slice(0, 300);
      fs.rmSync(tmpDir, { recursive: true, force: true });
      return;
    }
    job.status = 'uploading';
    job.progress = 96;
    try {
      const res = await cloudinary.uploader.upload(path.join(tmpDir, file), {
        resource_type: 'video',
        public_id: `${TAG}/${videoId}`,
        overwrite: true,
        tags: [TAG],
        context: { title: title || '', artist: artist || '', videoId, thumb: thumb || '' },
      });
      job.status = 'done';
      job.progress = 100;
      job.url = res.secure_url;
    } catch (e) {
      job.status = 'error';
      job.message = 'Cloudinary upload failed: ' + (e.message || e.error?.message || 'unknown');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
}

function lanAddresses(port) {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${port}`);
  }
  return out;
}

async function startServer({ port = 5000, staticDir, binDir, log = console.log }) {
  const bin = await ensureYtDlp(binDir, log);
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/ping', (_req, res) => res.json({ status: 'ok', app: 'Galaxy.FM PC', lan: lanAddresses(port) }));

  app.post('/download', async (req, res) => {
    const { videoId, title, artist, thumb } = req.body || {};
    if (!/^[\w-]{6,20}$/.test(videoId || '')) return res.status(400).json({ status: 'error', message: 'Bad video id' });
    const job = jobs[videoId];
    if (job && (job.status === 'downloading' || job.status === 'uploading')) return res.json(job);
    const already = await existingUpload(videoId);
    if (already) return res.json({ status: 'done', progress: 100, url: already });
    jobs[videoId] = { status: 'downloading', progress: 0 };
    runDownload(bin, jobs[videoId], { videoId, title, artist, thumb });
    res.json(jobs[videoId]);
  });

  app.get('/progress/:id', (req, res) => res.json(jobs[req.params.id] || { status: 'unknown' }));

  if (staticDir && fs.existsSync(staticDir)) app.use(express.static(staticDir));

  await new Promise((resolve, reject) => {
    const srv = app.listen(port, '0.0.0.0', resolve);
    srv.on('error', reject);
  });
  log(`Galaxy.FM server on http://localhost:${port}`);
  lanAddresses(port).forEach(a => log(`Phone/Chromebook address: ${a}`));
  return { lan: lanAddresses(port) };
}

module.exports = { startServer };

// Run on its own with: node electron/server.cjs
if (require.main === module) {
  startServer({
    staticDir: path.join(__dirname, '..', 'dist'),
    binDir: path.join(__dirname, '..', '.bin'),
  }).catch(e => { console.error(e); process.exit(1); });
}
