// Galaxy.FM settings and API keys
export const CONFIG = {
  // YouTube Data API keys — rotates to the next one if a key hits its daily limit
  YOUTUBE_KEYS: [
    'AIzaSyBkZnGLw5jmsi--NJsnvgs9MAI2rnmVxwA',
    'AIzaSyDG8y901RQh5yXe8qFi45RlnHUFkoR_Gbc',
    'AIzaSyBpIMFPKX2h3_jbphlW1CcqiSzCXSNupLI',
  ],
  LASTFM_KEY: '30eb30e634c7abe1253cea9f3a761375',
  CLOUDINARY_CLOUD: 'xflnhfqx',
  CLOUD_TAG: 'galaxyfm',
  // YouTube API data is never kept longer than this (YouTube API policy)
  CACHE_MAX_AGE_MS: 30 * 24 * 60 * 60 * 1000,
};

// The PC app serves this page from its own built-in server, so the
// download server is always the page's own address there.
export function isPcApp() {
  return location.protocol === 'http:' && location.port === '5000';
}
