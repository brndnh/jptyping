import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    server: {
        // mirrors api/jisho.js so the jisho source works under `npm run dev`
        proxy: {
            '/api/jisho': {
                target: 'https://jisho.org',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/jisho/, '/api/v1/search/words'),
            },
        },
    },
});
