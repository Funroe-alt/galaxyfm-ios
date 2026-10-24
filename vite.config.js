import { defineConfig } from 'vite';

// base './' keeps asset paths relative so the same build works in
// the Android app, the PC app and on a website.
export default defineConfig({
  base: './',
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2019' },
  server: { port: 5173 }
});
