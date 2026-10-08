import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [react()],
    // Same-origin in dev too: the browser only ever talks to the Vite origin.
    server: { proxy: { '/api': 'http://localhost:3000' } },
    build: { outDir: 'dist' },
});
