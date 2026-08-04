import { globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'

export default tseslint.config(globalIgnores(['dist']), {
  files: ['**/*.ts'],
  extends: [tseslint.configs.recommended, eslintConfigPrettier],
  languageOptions: {
    ecmaVersion: 2023,
    globals: { ...globals.node },
  },
})
