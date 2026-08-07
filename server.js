/* eslint-env node */
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import compression from 'compression';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4173;
const DIST_DIR = join(__dirname, 'dist');

// Enable compression
app.use(compression());

// ─── Security headers (pre-deploy production audit) ───
// Applied to every response so browsers enforce nosniff, frame protection,
// HSTS, and a baseline CSP even before the SPA's own <meta> tags.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // HSTS only over HTTPS (Vercel terminates TLS, so this is safe there;
  // plain-HTTP local dev is unaffected since the header is inert without TLS)
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()'
  );
  // Baseline CSP: Vite dev server injects inline scripts/styles, so keep
  // 'unsafe-inline' for style and allow self + Cashfree/PayPal scripts.
  // Google Fonts (fonts.googleapis.com / fonts.gstatic.com) and Fontshare
  // (api.fontshare.com) are loaded via <link> in pages/+Head.tsx — they must
  // be allowed in style-src/font-src or the typography silently breaks.
  // Supabase realtime uses wss:// so connect-src includes wss://*.supabase.co.
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' https://sdk.cashfree.com https://*.cashfree.com https://*.paypal.com https://*.paypalobjects.com; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.fontshare.com; " +
      "img-src 'self' data: blob: https:; " +
      "font-src 'self' data: https://fonts.gstatic.com https://api.fontshare.com; " +
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.cashfree.com https://api.cashfree.com https://sandbox.cashfree.com https://*.paypal.com https://fonts.googleapis.com https://fonts.gstatic.com https://api.fontshare.com https://o4511722119495680.ingest.us.sentry.io; " +
      "frame-src 'self' https://*.cashfree.com https://payments.cashfree.com https://*.paypal.com; " +
      "media-src 'self' blob:; " +
      "object-src 'none'; base-uri 'self'; form-action 'self'"
  );
  next();
});

// Serve static files from dist directory
app.use(express.static(DIST_DIR, {
  maxAge: '1d', // Cache static assets for 1 day
  etag: false,
}));

// Health check endpoint
app.get('/_health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SPA fallback: route all non-file requests to index.html
app.use((req, res) => {
  // Don't fallback for API routes or specific file types
  if (req.path.startsWith('/api/') || /\.\w+$/.test(req.path)) {
    return res.status(404).json({ error: 'Not found' });
  }

  // Serve index.html for all other routes (SPA routing)
  res.sendFile(join(DIST_DIR, 'index.html'), (err) => {
    if (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });
});

// Error handling middleware
app.use((err, req, res, _next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ Server running at http://0.0.0.0:${PORT}`);
  console.log(`✓ Serving SPA from ${DIST_DIR}`);
  console.log(`✓ SPA routing enabled - all routes fallback to index.html`);
});
