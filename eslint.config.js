const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['dist/**', 'node_modules/**', 'output.css'] },
  {
    ...js.configs.recommended,
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['error', {
        caughtErrors: 'none',
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
    },
  },
  {
    files: ['settings.js', 'about.js', 'update.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        pairkiller: 'readonly',
      },
    },
  },
];
