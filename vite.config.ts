import { defineConfig } from 'vite'
import { resolve } from 'path'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  server: {
    watch: {
      usePolling: true,
      interval: 1000,
    }
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    watch: {
      include: ['src/**'],
      exclude: ['node_modules/**', 'dist/**']
    },
    rollupOptions: {
      input: {
        popup: resolve(fileURLToPath(new URL('.', import.meta.url)), 'src/popup.html'),
        settings: resolve(fileURLToPath(new URL('.', import.meta.url)), 'src/settings.html'),
        background: resolve(fileURLToPath(new URL('.', import.meta.url)), 'src/background.js'),
        style: resolve(fileURLToPath(new URL('.', import.meta.url)), 'src/style.css')
      },
      output: {
        entryFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    }
  }
})