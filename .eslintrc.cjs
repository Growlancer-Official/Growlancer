module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  ignorePatterns: [
    'dist',
    'coverage',
    'node_modules',
    '.eslintrc.cjs',
    'scripts/**',
    'scratch/**',
    'supabase/functions/**',
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh', 'unused-imports'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    '@typescript-eslint/no-unused-vars': 'off', // Replaced by unused-imports/no-unused-vars
    'unused-imports/no-unused-imports': 'error',
    'unused-imports/no-unused-vars': [
      'error',
      { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-explicit-any': 'off',
  },
  overrides: [
    {
      files: ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx'],
      rules: {
        '@typescript-eslint/no-unused-vars': 'off',
      },
    },
  ],
};
