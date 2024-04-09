import typescriptParser from '@typescript-eslint/parser';

export default [
  {
    languageOptions: {
      parser: typescriptParser,
    },
    files: ['**/*.ts'],
    ignores: [
      '**/*.d.ts',
      '*.js',
      'node_modules/**/*',
    ],
    plugins: {
    },
    rules: {
    },
  },
  {
    ignores: ['./.next/*'],
  },
];
