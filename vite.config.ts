import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import vike from 'vike/plugin';
import path from 'path';
import fs from 'fs';
import { execSync } from 'node:child_process';

const LEGAL_PAGE_PATHS = [
  'src/pages/CookiesPage.tsx',
  'src/pages/PrivacyPage.tsx',
  'src/pages/TermsPage.tsx',
] as const;

/** Latest commit date (UTC) touching any bundled legal page — updates only when those files change. */
function getLegalDocsLastUpdatedIso(): string {
  try {
    execSync('git rev-parse --verify HEAD', {
      cwd: path.resolve(__dirname),
      stdio: 'ignore',
    });

    const out = execSync(`git log -1 --format=%cs -- ${LEGAL_PAGE_PATHS.join(' ')}`, {
      encoding: 'utf8',
      cwd: path.resolve(__dirname),
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(out)) return out;
  } catch {
    // No git, empty repo, shallow clone without history, etc.
  }
  return new Date().toISOString().slice(0, 10); // Current date as fallback
}

/**
 * Custom Vite plugin: uses preact/compat for client bundles (saves ~50KB gzipped)
 * but keeps real React for SSR/prerender builds.
 *
 * The key: the `resolveId` hook receives an `options` object with an `ssr` boolean.
 * During SSR/prerender builds, `options.ssr` is `true`, so we skip the preact alias.
 * During client builds, `options.ssr` is `false`, so we redirect react → preact/compat.
 *
 * Preact/hooks fails during SSR because it expects a component tree context (`__H`)
 * that's only set up by preact's own render cycle — which doesn't run during Vike's
 * SSR prerender. Real React's hooks initialization is more robust.
 *
 * Uses `enforce: 'pre'` and is registered BEFORE react() in the plugins array
 * so our resolveId runs first and intercepts react imports before
 * @vitejs/plugin-react can resolve them in its own pre-phase.
 */
function preactClientOnlyPlugin(): Plugin {
  return {
    name: 'preact-client-only',
    enforce: 'pre',
    async resolveId(id, importer, options) {
      // SSR/prerender builds: keep real React (hooks work correctly)
      if (options?.ssr) return null;

      // Client builds: alias react → preact/compat
      if (id === 'react' || id.startsWith('react/')) {
        // react/jsx-runtime → preact/compat/jsx-runtime, etc.
        return await this.resolve(id.replace(/^react/, 'preact/compat'), importer, options);
      }
      if (id === 'react-dom' || id.startsWith('react-dom/')) {
        // react-dom/server → preact/server (special — preact has a separate server module)
        if (id === 'react-dom/server') {
          return await this.resolve('preact/server', importer, options);
        }
        // react-dom/test-utils → preact/test-utils
        if (id === 'react-dom/test-utils') {
          return await this.resolve('preact/test-utils', importer, options);
        }
        // react-dom, react-dom/client, react-dom/foo → preact/compat, preact/compat/client, etc.
        return await this.resolve(id.replace(/^react-dom/, 'preact/compat'), importer, options);
      }
      return null;
    },
  };
}

/**
 * Vite plugin: copies `dist/client/` → `dist/` after build completes.
 *
 * Vike (SSR/prerender) outputs client files to `dist/client/`. Vercel's
 * Vite framework preset expects `index.html` at `dist/` for its SPA
 * rewrite rules. This plugin bridges the gap — it runs in the
 * `closeBundle` hook (fires after Rollup finishes) so the copy happens
 * regardless of whether Vercel invokes `vite build` directly or via
 * `npm run build`.
 *
 * The copy is recursive and only copies files that exist — it does
 * NOT delete anything from `dist/` or `dist/client/`.
 */
function vercelOutputWorkaroundPlugin(): Plugin {
  return {
    name: 'vercel-output-workaround',
    closeBundle() {
      const src = path.resolve(__dirname, 'dist/client');
      const dest = path.resolve(__dirname, 'dist');
      if (!fs.existsSync(src)) {
        console.warn('[vercel-output] dist/client not found — skipping copy');
        return;
      }
      console.log('[vercel-output] Copying dist/client/ → dist/...');
      copyRecursiveSync(src, dest);
      console.log('[vercel-output] Done — dist/ now mirrors dist/client/');
    },
  };
}

/** Recursively copy files from `srcDir` to `destDir` (files only, no top-level dir). */
function copyRecursiveSync(srcDir: string, destDir: string): void {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyRecursiveSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const legalLastUpdatedIso = getLegalDocsLastUpdatedIso();

export default defineConfig({
  define: {
    __LEGAL_LAST_UPDATED_ISO__: JSON.stringify(legalLastUpdatedIso),
  },
  plugins: [
    vike(),
    react(),

    // ─── Preact: client-only alias ─────────────────────────────
    // During client builds (hydration bundle) we alias react → preact/compat
    // to save ~50KB gzipped. During SSR/prerender builds we keep real React
    // because preact/hooks doesn't properly initialize during Vike's SSR render.
    //
    // IMPORTANT: must be BEFORE react() plugin and use enforce:'pre' so our
    // resolveId hook intercepts react imports before @vitejs/plugin-react does.
    preactClientOnlyPlugin(),
    // ─── Vercel Vite Preset Workaround ────────────────────
    // Vike outputs to `dist/client/` but Vercel's Vite framework preset
    // expects `index.html` at `dist/`. This plugin copies the client
    // build output to `dist/` after every build so the Vite preset's
    // SPA rewrite finds `index.html` regardless of overridden settings.
    vercelOutputWorkaroundPlugin(),
    // Bundle visualizer — run `npx vite build` and open stats.html
    // Removed dynamic import to avoid build warnings
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    cors: true,
    hmr: false,
    watch: {
      usePolling: false,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@features': path.resolve(__dirname, './src/features'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@services': path.resolve(__dirname, './src/services'),
      '@lib': path.resolve(__dirname, './src/lib'),
      '@styles': path.resolve(__dirname, './src/styles'),
      '@types': path.resolve(__dirname, './src/types'),
      '@layouts': path.resolve(__dirname, './src/layouts'),
      '@pages': path.resolve(__dirname, './src/pages'),

    },
  },
  build: {
    // Target modern browsers for smaller bundles (es2020 supports >95% of users)
    target: 'es2020',
    // Enable CSS minification for smaller stylesheets
    cssMinify: true,
    // Enable source maps for production debugging (but not for end users)
    sourcemap: false,
    // Chunk size warnings at 500KB (down from default 1MB)
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // React/Preact core
          if (id.includes('node_modules/preact/') || id.includes('node_modules/react-router')) {
            return 'vendor-react';
          }
          // Supabase
          if (id.includes('node_modules/@supabase/')) {
            return 'vendor-supabase';
          }
          // UI utilities
          if (id.includes('node_modules/lucide-react') || id.includes('node_modules/tailwind-merge') || id.includes('node_modules/clsx') || id.includes('node_modules/zustand')) {
            return 'vendor-ui';
          }
          // Sentry
          if (id.includes('node_modules/@sentry/')) {
            return 'vendor-sentry';
          }
          // Rich text / editors
          if (id.includes('node_modules/@tiptap/') || id.includes('node_modules/prosemirror-')) {
            return 'vendor-editor';
          }
          // Date utilities
          if (id.includes('node_modules/date-fns') || id.includes('node_modules/dayjs') || id.includes('node_modules/luxon')) {
            return 'vendor-dates';
          }
          // Animation libraries
          if (id.includes('node_modules/framer-motion') || id.includes('node_modules/gsap') || id.includes('node_modules/aos')) {
            return 'vendor-animations';
          }
        },
      },
    },
  },
  // test config removed — using production build only
});
