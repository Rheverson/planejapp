import globals from "globals";
import pluginJs from "@eslint/js";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginUnusedImports from "eslint-plugin-unused-imports";

// ============================================================
// O que o lint enxerga — e por que isso importa aqui.
//
// A tela da Carteira ficou quebrada em producao por dias: um bloco de
// estado de erro caiu dentro de outra funcao, onde as variaveis nao
// existiam. Teste e build passaram os dois; so o lint viu, e viu no
// primeiro dia — quatro variaveis "assigned a value but never used".
//
// Duas coisas que estavam erradas nesta config depois daquele episodio:
//
//  1. `src/domain/**` e `src/lib/**` nao recebiam REGRA NENHUMA. O
//     dominio e onde mora todo calculo financeiro. Era o pedaco menos
//     coberto justamente por ser o mais caro de errar.
//
//  2. `unused-imports/no-unused-vars` era "warn", e o script roda com
//     `--quiet`, que descarta warnings. Ou seja: a assinatura EXATA do
//     bug da Carteira estava configurada para ser invisivel. Virou
//     "error" — e o `--quiet` saiu do package.json.
// ============================================================

// Bloco so de `ignores` = ignore global. Sao saidas de build: lintar
// `android/app/build` chegou a inventar um erro de regra inexistente,
// vindo de um `eslint-disable` dentro de arquivo gerado.
const ARTEFATOS = {
  ignores: [
    "android/**",
    "ios/**",
    "dist/**",
    "build/**",
    "coverage/**",
    "src/pages/planejapp-landing/**",
    // 60 componentes gerados pelo shadcn/ui — nao sao codigo nosso.
    "src/components/ui/**",
  ],
};

const REGRAS = {
  // As `recommended` do @eslint/js e do eslint-plugin-react entram AQUI,
  // e nao pelo spread la embaixo: `rules:` vem depois do spread no
  // objeto de config e substituia o conjunto inteiro. Ou seja, elas
  // estavam desligadas sem ninguem notar — inclusive `no-undef`, que e
  // a regra que pega uma variavel usada fora do escopo onde existe.
  // Foi exatamente esse o defeito da Carteira e o dos Relatorios.
  ...pluginJs.configs.recommended.rules,
  ...pluginReact.configs.flat.recommended.rules,

  // `catch {}` vazio e proposital em parse que pode falhar; o que a
  // regra precisa pegar e bloco vazio de verdade (if/for sem corpo).
  "no-empty": ["error", { allowEmptyCatch: true }],

  "no-unused-vars": "off",
  "react/jsx-uses-vars": "error",
  "react/jsx-uses-react": "error",
  "unused-imports/no-unused-imports": "error",
  // "error", nao "warn": e a assinatura do bug da Carteira.
  "unused-imports/no-unused-vars": [
    "error",
    {
      vars: "all",
      varsIgnorePattern: "^_",
      args: "after-used",
      argsIgnorePattern: "^_",
    },
  ],
  "react/prop-types": "off",
  "react/react-in-jsx-scope": "off",
  "react/no-unknown-property": [
    "error",
    { ignore: ["cmdk-input-wrapper", "toast-close"] },
  ],
  "react-hooks/rules-of-hooks": "error",
};

export default [
  ARTEFATOS,
  {
    files: [
      "src/components/**/*.{js,mjs,cjs,jsx}",
      "src/pages/**/*.{js,mjs,cjs,jsx}",
      "src/hooks/**/*.{js,mjs,cjs,jsx}",
      "src/design/**/*.{js,mjs,cjs,jsx}",
      // As duas pastas que estavam no escuro.
      "src/lib/**/*.{js,mjs,cjs,jsx}",
      "src/domain/**/*.{js,mjs,cjs,jsx}",
      "src/Layout.jsx",
      "src/App.jsx",
      "src/main.jsx",
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    settings: { react: { version: "detect" } },
    plugins: {
      react: pluginReact,
      "react-hooks": pluginReactHooks,
      "unused-imports": pluginUnusedImports,
    },
    rules: REGRAS,
  },
  {
    // Os testes falam vitest, nao browser.
    files: ["src/**/*.test.{js,jsx}", "src/**/*.dom.test.{js,jsx}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
];
