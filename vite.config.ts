import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

function rootStaticAssetsPlugin(): Plugin {
  return {
    name: 'root-static-assets',
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist');
      if (!fs.existsSync(distDir)) return;

      const musicSrc = path.resolve(__dirname, 'music');
      const musicDest = path.resolve(distDir, 'music');
      if (fs.existsSync(musicSrc)) {
        fs.cpSync(musicSrc, musicDest, {recursive: true});
      }

      const nojekyllSrc = path.resolve(__dirname, '.nojekyll');
      const nojekyllDest = path.resolve(distDir, '.nojekyll');
      if (fs.existsSync(nojekyllSrc)) {
        fs.copyFileSync(nojekyllSrc, nojekyllDest);
      } else {
        fs.writeFileSync(nojekyllDest, '');
      }
    },
  };
}

export default defineConfig(() => {
  return {
    base: './',
    publicDir: false,
    plugins: [react(), tailwindcss(), rootStaticAssetsPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
