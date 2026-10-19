# A separate, static package for the marketing site

**Implements:** none. IMPLEMENTATION.md does not plan a public site.
**Status:** Accepted. Adds a package that IMPLEMENTATION.md did not anticipate.

## Decision

`packages/landing` (`caplytics-landing`) is a standalone Next.js app for the public landing page.
It imports nothing from `@caplytics/core` or `caplytics-dashboard`. Everything it renders is static.

## Rationale

The dashboard (§8) is auth-gated end to end, through middleware plus an `auth()` check on every
page. A public page inside it would need an exception carved into that auth model. Keeping the
public page in its own package leaves the dashboard's rule simple: every route requires a
signed-in user.

## Design choices worth recording

- **Geist only.** The site uses no monospace face anywhere, including code snippets and mockups.
  `--font-mono` is aliased to the sans stack so shadcn components that ask for mono still get Geist.
- **Hero wordmark is generated art, not a font.** The wordmark takes after usefr.com's hero: each
  word is a serif drawn as vertical bars snapped to a grid. The bars are pre-rendered SVGs in
  `public/wordmark/`, made by `scripts/generate-wordmark.html` from Gloock, a free stand-in for
  usefr's licensed New Phase. They are applied as CSS masks so the colour comes from the theme.

## Alternatives considered

| Alternative | Why not |
|---|---|
| A public route inside `caplytics-dashboard` | Needs an auth exception, as above |
| Wordmark as live text with a striped `background-clip` | The stripes ignore the glyph grid, so it looks different from the reference |
| Generate the bars at runtime on a `<canvas>` | The wordmark would pop in after the font loads, and the hero would need client JS |
