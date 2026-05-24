# Writ Protocol logo

A single-letter blackletter mark — uppercase W set in **[Pirata One][p1]**,
a gothic textura by Rodrigo Fuenzalida and Nicolas Massi (SIL Open Font
License 1.1, free for commercial use).

The design draws on the etymology: a **writ** was a sealed instrument
issued by a sovereign chancellery, written in chancery and gothic hands.
The blackletter W reads "issued by authority" without illustration.

## Variants

| File | When to use |
|---|---|
| `writ-W-light.{svg,-1024,-512,-256,-64.png}` | Ink on paper. Primary mark. |
| `writ-W-dark.{svg,…}` | Paper on ink. Use on dark profile pages (GitHub org avatar reads better dark). |
| `writ-W-on-clear-ink.{svg,…}` | Ink glyph, transparent background. Use when you want to provide the background yourself. |
| `writ-W-on-clear-paper.{svg,…}` | Paper glyph, transparent background. For dark host surfaces. |

PNG sizes: 1024 / 512 / 256 / 64. SVGs are 1024-viewBox and scale freely.

## Colors

```
paper  #f3efe7
ink    #1a1815
```

## SVGs are self-contained

The Pirata One woff2 is embedded as a base64 data URL in each SVG, so the
files render anywhere — no Google Fonts dependency, no missing-font
fallbacks. Each SVG is ~12 KB.

## Regenerating

The PNGs are rendered from the SVGs with `rsvg-convert` (librsvg). If you
need different sizes or variants, edit and re-run the generation script
that produced this set; the SVGs are the source of truth.

[p1]: https://fonts.google.com/specimen/Pirata+One
