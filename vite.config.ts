import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Single-page app: every unknown path falls back to index.html and is routed in the browser.
			adapter: adapter({ fallback: 'index.html' })
		})
	],
	server: {
		port: 3000,
		proxy: {
			'/api': {
				target: process.env.API_PROXY ?? 'http://localhost:8080',
				changeOrigin: true
			}
		}
	}
});
