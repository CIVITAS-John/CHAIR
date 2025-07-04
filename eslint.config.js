// @ts-check

import { includeIgnoreFile } from "@eslint/compat";
import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import eslintPluginImportX from "eslint-plugin-import-x";
import * as regexpPlugin from "eslint-plugin-regexp";
import eslintTSDoc from "eslint-plugin-tsdoc";
import tseslint from "typescript-eslint";

export default tseslint.config(
    eslint.configs.recommended,
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    eslintConfigPrettier,
    eslintPluginImportX.flatConfigs.recommended,
    eslintPluginImportX.flatConfigs.typescript,
    regexpPlugin.configs["flat/recommended"],
    {
        languageOptions: {
            parserOptions: {
                ecmaVersion: "latest",
                sourceType: "module",
                projectService: {
                    allowDefaultProject: ["*.js"],
                },
                project: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        plugins: {
            tsdoc: eslintTSDoc,
        },
        rules: {
            "@typescript-eslint/consistent-type-imports": "error",
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    args: "all",
                    argsIgnorePattern: "^_",
                    caughtErrors: "all",
                    caughtErrorsIgnorePattern: "^_",
                    destructuredArrayIgnorePattern: "^_",
                    ignoreRestSiblings: true,
                    varsIgnorePattern: "^_",
                },
            ],
            "@typescript-eslint/no-useless-constructor": "error",
            "@typescript-eslint/restrict-template-expressions": ["error", {}],
            curly: ["error", "multi-line"],
            "dot-notation": "error",
            eqeqeq: "error",
            "import-x/no-dynamic-require": "warn",
            "import-x/no-named-as-default-member": "off",
            "import-x/order": [
                "error",
                {
                    alphabetize: {
                        caseInsensitive: true,
                        order: "asc",
                    },
                    groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
                    "newlines-between": "always",
                },
            ],
            "no-else-return": "error",
            "no-empty": [
                "error",
                {
                    allowEmptyCatch: true,
                },
            ],
            "no-extra-bind": "error",
            "no-labels": "error",
            "no-lone-blocks": "error",
            "no-loop-func": "error",
            "no-new-func": "error",
            "no-new-object": "error",
            "no-new-wrappers": "error",
            "no-redeclare": "error",
            "no-template-curly-in-string": "error",
            "no-unreachable": "error",
            "object-shorthand": "error",
            "prefer-arrow-callback": "error",
            "prefer-exponentiation-operator": "error",
            "prefer-template": "error",
            quotes: [
                "error",
                "double",
                {
                    avoidEscape: true,
                },
            ],
            "regexp/no-super-linear-backtracking": "warn",
            "require-await": "error",
            "sort-imports": [
                "error",
                {
                    ignoreCase: true,
                    ignoreDeclarationSort: true,
                },
            ],
            "tsdoc/syntax": "warn",
        },
    },
    {
        files: ["**/*.js"],
        extends: [tseslint.configs.disableTypeChecked],
        rules: {
            "tsdoc/syntax": "off",
        },
    },
    includeIgnoreFile(`${import.meta.dirname}/.gitignore`),
    {
        ignores: ["src/evaluating/network/dependencies", "examples/**/network"],
    },
);
