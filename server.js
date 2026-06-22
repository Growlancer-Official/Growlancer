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
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ Server running at http://0.0.0.0:${PORT}`);
  console.log(`✓ Serving SPA from ${DIST_DIR}`);
  console.log(`✓ SPA routing enabled - all routes fallback to index.html`);
});
