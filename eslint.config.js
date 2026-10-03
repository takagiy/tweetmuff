import js from "@eslint/js";
import globals from "globals";
import prettier from "eslint-config-prettier";

// Functions pages/common.js defines for the popup and options page scripts, which share one global scope.
const pageHelpers = Object.fromEntries(
  [
    "byId",
    "getState",
    "updateState",
    "onStateChange",
    "formatTime",
    "pluralize",
    "syncStatus",
    "bindCheckbox",
    "openXMuteSettings",
  ].map((name) => [name, "readonly"]),
);

export default [
  {
    ignores: ["node_modules/", "store/.cache/", "test/harness/"],
  },
  js.configs.recommended,
  prettier,
  {
    // The extension itself: classic scripts in X's page, the content-script world, and the extension pages.
    files: ["src/**/*.js", "pages/**/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        TweetmuffCore: "readonly",
      },
    },
  },
  {
    // core.js also exports itself for the tests when loaded as a CommonJS module.
    files: ["src/core.js"],
    languageOptions: { globals: { module: "readonly" } },
  },
  {
    // Its top-level functions are used by popup.js and options.js.
    files: ["pages/common.js"],
    rules: { "no-unused-vars": ["error", { vars: "local" }] },
  },
  {
    files: ["pages/popup.js", "pages/options.js"],
    languageOptions: { globals: pageHelpers },
  },
  {
    // Development tooling, run with Bun.
    files: [
      "eslint.config.js",
      "scripts/**/*.js",
      "store/**/*.js",
      "test/**/*.js",
    ],
    languageOptions: {
      sourceType: "module",
      globals: { ...globals.node, Bun: "readonly" },
    },
  },
  {
    // Functions here are passed to page.evaluate() and run in the browser.
    files: ["store/build.js"],
    languageOptions: { globals: globals.browser },
  },
];
