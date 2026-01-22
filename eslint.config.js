import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', 'speed-cache', '*.json']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,js}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.node
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { 
        args: 'all',
        argsIgnorePattern: '^_',
        caughtErrors: 'all',
        caughtErrorsIgnorePattern: '^_'
      }]
    }
  }
)
