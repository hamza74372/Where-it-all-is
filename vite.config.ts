/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Strict CSP at build time only (the dev server needs websockets + module URLs).
// connect-src 'none' guarantees the shipped product makes no network calls.
const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  "connect-src 'none'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function injectCsp(): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

// `--mode app` → dist/app.html, `--mode demo` → dist/demo.html (DEMO=true).
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
  return {
    base: './',
    define: {
      __DEMO__: JSON.stringify(demo),
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
    },
    plugins: [
      preact(),
      injectCsp(),
      viteSingleFile({ removeViteModuleLoader: true }),
      ...(mode === 'app' || demo ? [renameHtml(demo ? 'demo.html' : 'app.html')] : []),
    ],
    build: {
      target: 'es2020',
      outDir: 'dist',
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
