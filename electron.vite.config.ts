import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          // Headless git-textconv entry, run via ELECTRON_RUN_AS_NODE by
          // resources/cli/geminio-textconv — must stay electron-free.
          textconvCli: resolve(__dirname, 'src/main/textconvCli.ts'),
          // Headless `geminio doctor|status|repos|…`, run the same way by
          // resources/cli/geminio — also electron-free.
          cliEntry: resolve(__dirname, 'src/main/cliEntry.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react()]
  }
})
