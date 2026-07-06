import { defineConfig } from 'vitest/config'

// The engine is pure TypeScript with no Electron imports, so it runs headless in Node.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
})
