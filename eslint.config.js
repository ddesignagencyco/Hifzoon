import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.next/**',
      '**/*.d.ts',
      'eslint.config.js',
      // The web app has its own ESLint config (apps/web/eslint.config.mjs) and its own
      // `npm run lint`; this config's type-aware project list only covers the API and shared.
      'apps/web/**',
      // k6 load scripts run in k6's runtime, outside any tsconfig.
      'apps/api/load/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // The build tsconfig excludes specs (they must never reach dist/), so a second
        // project covers lint and test files. The classic `project` array is used
        // rather than projectService because the file sets overlap.
        project: ['./apps/api/tsconfig.spec.json', './packages/shared/tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',

      // These two catch real defects in a Nest codebase — an unawaited promise in a
      // request handler, a promise passed where void is expected — so they stay on.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],

      // Prisma's generated types and BullMQ's `Job.data: any` make the `no-unsafe-*`
      // family fire on essentially every call, which trains people to ignore lint.
      // Type safety is enforced by `tsc --noEmit` instead, which is strict.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/unsafe-declaration-merging': 'off',

      // Provider fakes implement an async interface without awaiting anything, which
      // is the correct shape for a test double.
      '@typescript-eslint/require-await': 'off',

      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
  {
    // Tests, the seed and the operational scripts build partial doubles, reach into
    // privates and print a human-readable report — none of which should be linted
    // like application code.
    files: [
      '**/*.spec.ts',
      '**/test/**/*.ts',
      '**/prisma/seed.ts',
      '**/prisma/*.ts',
      '**/scripts/**/*.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      'no-console': 'off',
    },
  },
  {
    // Bootstraps run before Nest exists and own process-level concerns.
    files: ['apps/api/src/main.ts', 'apps/api/src/worker.ts', 'apps/api/src/openapi.ts'],
    rules: { 'no-console': 'off' },
  },
  prettier,
);
