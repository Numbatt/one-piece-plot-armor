import { defineConfig } from 'vitest/config'

// Tests run in Node by default (fast, no browser). The pure classifier core
// needs nothing more. Files that touch the DOM opt into a fake browser with a
// `// @vitest-environment jsdom` comment at the top of the file.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    // Let the eval scoreboard's console.log reach the terminal instead of being
    // captured/hidden. The scoreboard is only useful if you actually see it.
    disableConsoleIntercept: true,
  },
})
