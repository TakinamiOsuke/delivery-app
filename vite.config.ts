import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages では /<repo-name>/ の base が必要
// リポジトリ名に合わせて VITE_BASE_PATH を設定するか、直接書き換えてください
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH ?? '/',
})
