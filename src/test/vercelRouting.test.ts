import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Vercel routing fallback', () => {
  it('rewrites non-file paths to index.html so admin pages resolve', () => {
    const vercelConfigPath = resolve(__dirname, '../../vercel.json');
    const vercelConfig = JSON.parse(readFileSync(vercelConfigPath, 'utf8'));

    // Must have a catch-all rewrite for SPA fallback
    expect(vercelConfig.rewrites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: '/(.*)',
          destination: '/index.html',
        }),
      ])
    );

    // Admin routes must have their own explicit rewrite BEFORE the catch-all
    expect(vercelConfig.rewrites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: '/admin(/.*)?',
          destination: '/index.html',
        }),
      ])
    );

    // Dashboard routes must have explicit rewrites
    expect(vercelConfig.rewrites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: '/dashboard(/.*)?',
          destination: '/index.html',
        }),
      ])
    );

    // Client routes must have explicit rewrites
    expect(vercelConfig.rewrites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: '/client(/.*)?',
          destination: '/index.html',
        }),
      ])
    );
  });

  it('framework is set to null for manual Vite routing control', () => {
    const vercelConfigPath = resolve(__dirname, '../../vercel.json');
    const vercelConfig = JSON.parse(readFileSync(vercelConfigPath, 'utf8'));
    
    // Setting framework to null prevents Vercel's Vite framework preset
    // from overriding custom rewrite rules
    expect(vercelConfig.framework).toBeNull();
  });
});
