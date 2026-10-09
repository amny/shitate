import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Use src/adapters/index.ts instead of concrete adapter implementations
const adaptersPattern = {
  group: ['**/adapters/web', '**/adapters/web/*'],
  message: 'Import adapters via src/adapters/index.ts.',
};
const reactPattern = {
  group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
  message: 'src/core must not depend on React.',
};

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'test-results', 'playwright-report', 'spikes']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
  {
    files: ['src/app/**/*.{ts,tsx}', 'src/editor/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [adaptersPattern] }],
    },
  },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      // src/core must stay framework-free (CLAUDE.md: architecture rules)
      'no-restricted-imports': ['error', { patterns: [adaptersPattern, reactPattern] }],
    },
  },
  prettier,
]);
