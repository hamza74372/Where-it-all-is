/// <reference types="vitest/config" />
import fs from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Modes:
//   app   → dist/app.html   single-file download (works from file://, no service worker)
//   demo  → dist/demo.html  same app with demo limits
// With HOSTED=1 (used by `npm run build:site`), the page also links its web-app manifest and
// icons and registers an offline service worker; OUT_DIR / OUT_NAME choose where it goes.
const site = JSON.parse(fs.readFileSync('site.config.json', 'utf8')) as {
  productName: string;
  siteUrl: string;
  appPath: string;
  etsyUrl: string;
  themeColor: string;
  downloadFileName: string;
};
const HOSTED = process.env.HOSTED === '1';

// Strict CSP at build time only (the dev server needs websockets + module URLs).
// connect-src 'none' guarantees the app itself makes no network calls. The hosted build also
// allows its own manifest, icons and service worker (same origin only).
const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  HOSTED ? "img-src 'self' data: blob:" : 'img-src data: blob:',
  'font-src data:',
  "connect-src 'none'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function injectHead(demo: boolean): Plugin {
  return {
    name: 'inject-head',
    apply: 'build',
    transformIndexHtml(html) {
      let head = `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`;
      if (HOSTED) {
        head +=
          `\n    <link rel="manifest" href="manifest.webmanifest" />` +
          `\n    <link rel="icon" type="image/png" href="icons/icon-192.png" />` +
          `\n    <link rel="apple-touch-icon" href="icons/icon-192.png" />` +
          // The full app's path is private: keep it out of search engines.
          (demo ? '' : `\n    <meta name="robots" content="noindex, nofollow" />`);
      }
      return html.replace('<meta charset="UTF-8" />', head).replace(/<meta name="theme-color" content="[^"]*" \/>/, `<meta name="theme-color" content="${site.themeColor}" />`);
    },
  };
}

function renameHtml(name: string): Plugin {
  return {
    name: 'rename-html',
    enforce: 'post',
    generateBundle(_opts, bundle) {
      const html = bundle['index.html'];
      if (html) html.fileName = name;
    },
  };
}

export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  const outName = process.env.OUT_NAME ?? (demo ? 'demo.html' : 'app.html');
  return {
    base: './',
    define: {
      __DEMO__: JSON.stringify(demo),
      __HOSTED__: JSON.stringify(HOSTED),
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
      __ETSY_URL__: JSON.stringify(site.etsyUrl),
      __DOWNLOAD_NAME__: JSON.stringify(site.downloadFileName),
      __PRODUCT_NAME__: JSON.stringify(site.productName),
    },
    plugins: [
      preact(),
      injectHead(demo),
      viteSingleFile({ removeViteModuleLoader: true }),
      ...(mode === 'app' || demo ? [renameHtml(outName)] : []),
    ],
    build: {
      target: 'es2020',
      outDir: process.env.OUT_DIR ?? 'dist',
      emptyOutDir: false,
      modulePreload: false,
      cssCodeSplit: false,
      assetsInlineLimit: 100_000_000,
    },
    test: {
      environment: 'node',
      include: ['test/**/*.test.ts'],
    },
  };
});
