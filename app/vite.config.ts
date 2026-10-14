import { defineConfig } from 'vite';
import aurelia from '@aurelia/vite-plugin';
export default defineConfig({ base: './', plugins: [aurelia()], build: { target: 'es2022' }, server: { port: 5173, strictPort: true } });
