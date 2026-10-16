/* eslint-env node */
/* Temporary local dev-server bootstrap for the QA worktree (port 5173). */
import { createServer } from 'vite';

const server = await createServer({
  configFile: 'vite.config.ts',
  server: { port: 5173, strictPort: true },
});
await server.listen();
console.log('dev server ready on http://localhost:5173');
