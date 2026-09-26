// Flat config. Deliberately small: type-aware linting duplicates `npm run typecheck`,
// so this pass is only about the things tsc does not say anything about.
import js from '@eslint/js';
import globals from 'globals';
import ts from 'typescript-eslint';

export default [
  { ignores: ['dist/**', 'out/**', 'node_modules/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: globals.node },
    rules: {
      // Underscore-prefixed arguments are intentionally unused.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // `let x = <safe default>` before a try/catch that may not reach the assignment is a
      // deliberate pattern here, not a mistake. tsc already catches genuinely unread values.
      'no-useless-assignment': 'off',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
];
