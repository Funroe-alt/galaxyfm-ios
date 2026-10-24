# Galaxy.FM 2.0

One codebase, two apps:

- **PC app** (Windows) – plays music *and* downloads songs to Cloudinary.
- **iPhone / iPad** – a web app installed from Safari (section 6).
- **Android app** – for your Samsung S22 **and** your Chromebook (Chromebooks run Android apps from the Play Store side, so the same APK works).

Features: search + play, library + playlists, Spotify CSV import, synced lyrics, full-screen now playing, downloads to Cloudinary.

---

## 1. One-time setup (on your PC)

1. Install **Node.js LTS** from https://nodejs.org (click "Next" through everything).
2. Unzip this folder somewhere like `Documents\galaxy-fm`.
3. Double-click **`setup.bat`**. It installs everything (takes a few minutes the first time).

## 2. Run the PC app

- Double-click **`run-pc.bat`**.
- First launch downloads `yt-dlp` automatically (needs internet, ~15 MB).
- To get a real **Galaxy.FM.exe** you can keep on your desktop: double-click **`build-exe.bat`**. The exe appears in the `release` folder.

The PC app runs a small download server on port 5000. If Windows asks about the firewall, click **Allow** (tick "Private networks") so your phone can use it.

## 3. Turn on cloud sync (one time, in Cloudinary)

So your phone/Chromebook can see songs the PC downloaded:

1. Go to https://console.cloudinary.com → **Settings** (gear) → **Security**.
2. Find **Restricted media types** and **untick "Resource list"**.
3. Save.

Then in the app: **Library → Sync cloud songs**.

## 4. Build the Android app (S22 + Chromebook)

You need **Android Studio** (you already have it).

1. Double-click **`build-android.bat`**. (First time it creates the `android` folder.)
2. Android Studio opens. Wait for the bottom bar to finish ("Gradle sync").
3. App icon: right-click **app → New → Image Asset** → *Path* = `public\icon-512.png` → Next → Finish.
4. **Build → Build App Bundle(s) / APK(s) → Build APK(s)**.
5. Click **locate** in the popup → `app-debug.apk`. Send it to your S22 (Google Drive, USB, or email) and tap it to install.

**Chromebook:** Chromebooks don't let you tap-to-install an APK file. Use one of these:
- **Install with ADB (one time setup):** on the Chromebook open Settings → Advanced → Developers → **Linux development environment** → turn on, then in its settings turn on **Develop Android apps → Enable ADB debugging** (Chromebook restarts). Copy `app-debug.apk` into the Chromebook's **Linux files** folder, open the Terminal app and run:
  `sudo apt install -y adb && adb connect arc && adb install app-debug.apk`
- Or upload it to the Play Store as an internal test (later, if you want).

Every time you change the code, run `build-android.bat` again and rebuild the APK.

## 5. Download songs from your phone

At home (same Wi-Fi as the PC):

1. Open the PC app → **Settings**. It shows the address to use (e.g. `http://192.168.1.20:5000`).
2. On the phone: **Settings → Downloads** → paste the address → **Save** → it should say "Connected to …".
3. Tap **⋮** on any song → **Download to cloud**.

Away from home, songs you already downloaded stream from Cloudinary; everything else streams from YouTube.

## 6. iPhone / iPad version

Apple only allows real iPhone apps to be built on a Mac with a paid developer account, so the iPhone/iPad version is a **web app you install from Safari**. It gets its own home-screen icon and opens full screen like a normal app.

### Put it online (one time, on your PC)
1. Double-click **`build-web.bat`**. A `dist` folder opens.
2. On github.com click **+ → New repository**, name it `galaxyfm`, set it to **Public**, tick **Add a README**, click **Create**.
3. In the new repo click **Add file → Upload files**. Select **everything inside** `dist` (not the dist folder itself) and drag it in. Click **Commit changes**.
4. Repo **Settings → Pages** → *Source*: **Deploy from a branch** → Branch **main**, folder **/(root)** → **Save**.
5. After about a minute your app is at **https://funroe-alt.github.io/galaxyfm/**

Only the `dist` folder goes online. It does **not** contain your Cloudinary secret.

To update it later: run `build-web.bat` again and upload the new `dist` files the same way (replace the old ones).

### Install on iPhone / iPad
1. Open **Safari** (must be Safari) and go to **https://funroe-alt.github.io/galaxyfm/**
2. Tap the **Share** button (square with arrow up).
3. Scroll down and tap **Add to Home Screen** → **Add**.
4. Open **Galaxy.FM** from the home screen.

### What's different on iPhone
- **No downloading** from the iPhone (Apple blocks a website from talking to your PC's server). Download on the PC or Android app, then tap **Sync cloud songs** on the iPhone.
- Songs streamed from YouTube stop when the screen locks (an iPhone rule). Songs synced from the cloud keep playing better.
- Each person's library is saved on their own device.
- If search doesn't work, your YouTube API key may be locked to certain websites: in Google Cloud → **APIs & Services → Credentials** → your key → under *Website restrictions* add `https://funroe-alt.github.io/*`.

## 7. Real iPhone / iPad app (.ipa + Sideloadly)

GitHub builds the app on its Macs for free; Sideloadly installs it from your Windows PC.
See the step-by-step in the chat / `galaxyfm-ios-upload.zip`. Key points:
- Upload the project **without** `electron/secrets.cjs` (use galaxyfm-ios-upload.zip, which already leaves it out).
- Actions tab → **Build iPhone app** → download **GalaxyFM-ipa** → unzip → `GalaxyFM.ipa`.
- Install with Sideloadly; reinstall every 7 days (free Apple ID).

## Notes

- `electron/secrets.cjs` holds your Cloudinary secret key. **Don't upload it to GitHub** (it's in `.gitignore`).
- YouTube API keys and the Last.fm key are in `src/config.js`.
- Cached YouTube data is deleted after 30 days (YouTube API policy).
- Privacy policy / terms: `public/privacy.html`, `public/terms.html`.
