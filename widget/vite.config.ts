import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

export default defineConfig({
  plugins: [preact()],
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'RecifWidget',
      formats: ['iife'],
      fileName: 'recif-widget',
    },
  },
})
