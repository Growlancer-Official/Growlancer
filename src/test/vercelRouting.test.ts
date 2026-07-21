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

    expect(vercelConfig.rewrites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: '/(.*)',
          destination: '/index.html',
        }),
      ])
    );
  });
});
