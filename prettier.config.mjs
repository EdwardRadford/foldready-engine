// Formatting rules for anything written from here on. printWidth is 120 because that is what
// the existing source already uses; the defaults would rewrap most of it for no reason.
//
// The tree is NOT prettier-clean yet. Running `npm run format` over it rewrites every file,
// which would be one large commit of pure noise sitting on top of the real history — so the
// config is declared and the sweep is left as a deliberate, separate decision.
export default {
  printWidth: 120,
  singleQuote: true,
  semi: true,
  tabWidth: 2,
  trailingComma: 'all',
  arrowParens: 'always',
};
