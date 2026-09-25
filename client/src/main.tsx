import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Deliberately empty. The production-build gate needs a real Vite entry point
// to compile, so it exists from M0 step 1; the page that calls GET /api/health
// arrives at step 4.
const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<StrictMode />);
}
