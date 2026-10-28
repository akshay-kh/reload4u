import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts, whose root is src/ (tests live outside it).
export default defineConfig({
    test: {
        include: ['tests/unit/**/*.test.js'],
        environment: 'node'
    }
});
