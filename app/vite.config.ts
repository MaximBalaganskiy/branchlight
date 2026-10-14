import { defineConfig } from 'vite';
import aurelia from '@aurelia/vite-plugin';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',
  plugins: [aurelia(), tailwindcss()],
  build: { target: 'es2022' },
  server: { port: 5173, strictPort: true }
});
