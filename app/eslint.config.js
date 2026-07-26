import { globalIgnores } from 'eslint/config'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'

export default tseslint.config(globalIgnores(['dist']), {
  files: ['**/*.{ts,tsx}'],
  extends: [
    tseslint.configs.recommended,
    reactHooks.configs.flat['recommended-latest'],
    reactRefresh.configs.vite,
    eslintConfigPrettier,
  ],
  languageOptions: {
    ecmaVersion: 2023,
    globals: { ...globals.browser, ...globals.node },
  },
})
