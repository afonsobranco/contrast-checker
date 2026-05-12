# Contrast Checker

A professional-grade color contrast analyzer supporting WCAG 2.1 and APCA (WCAG 3.0 draft), built with React and Vite.

**Live → [afonsobranco.github.io/contrast-checker](https://afonsobranco.github.io/contrast-checker/)**

---

## Features

### Core
- **Dual scoring** — WCAG 2.1 (AA / AAA) and APCA Lc side by side 
- **Non-text contrast** — WCAG 1.4.11 (3:1) and APCA Lc 30 checks for UI components and icons
- **Gradient and image backgrounds** — paste any CSS gradient or image URL; the app samples the effective color for accurate math while rendering the real visual in the preview
- **Shareable URLs** — color pair is encoded in the hash, so every link is a permalink

### Accessibility Analysis
- **Color blindness simulation** — Deuteranopia, Protanopia, Tritanopia, and Achromatopsia using the Machado et al. 2009 matrices on linearized RGB; each type shows a live text preview with its own ratio and pass/fail result
- **Multi-size preview** — Caption (12px/400), Body (16px/400), Heading (24px/500), and Display (48px/500) rendered simultaneously with per-context AA / AAA / APCA badges
- **Accessible palette generator** — 9 lightness variants of your foreground hue/saturation, each showing its contrast ratio against the current background, color-coded by AAA / AA / 3:1 / fail; click any swatch to apply
- **Contrast gap indicator** — every result row shows exactly how far above the threshold you are on a pass, or how much more contrast you need on a fail

### Tools
- **Smart Suggest** — finds the nearest AA-passing color by shifting lightness and hue, preserving the original color's character as much as possible; works on foreground or background
- **APCA reference table** — full Lc requirement grid by font size × weight, with your current size/weight highlighted and cells color-coded by pass/fail
- **Export** — one-click copy in four formats: CSS custom properties, Tailwind config, Figma W3C Design Tokens JSON, and Style Dictionary JSON
- **Color history** — last 5 pairs auto-saved, debounced at 900ms, accessible from the header

### UX
- **Animated numbers** — contrast ratio and Lc animate smoothly on color change using `requestAnimationFrame` with cubic ease-out
- **UI mockup preview** — primary button, outline button, badge, icon button, text input, and card all rendered live with your color pair
- **Keyboard shortcuts** — `W` swap · `R` reset · `D` dark mode · `S` suggest · `T` table · `E` export · `B` color blindness · `P` palette · `?` help
- **Dark / light mode**
- **Color picker + typed input** — accepts hex, rgb(), hsl(), named CSS colors, gradients, and image URLs

---

## Getting Started

```bash
npm install
npm run dev
```

Open [localhost:5173/contrast-checker/](http://localhost:5173/contrast-checker/).

```bash
npm run build    # production build → dist/
npm run preview  # preview the build locally
```

---

## Deployment

Pushes to `main` trigger the GitHub Actions workflow in `.github/workflows/deploy.yml`, which builds with Vite and deploys to GitHub Pages automatically.

To set up on a new fork:
1. Go to **Settings → Pages** and set Source to **GitHub Actions**
2. Update `base` in `vite.config.js` to match your repo name
3. Push to `main`

---

## Standards Reference

| Standard | Criterion | Threshold |
|---|---|---|
| WCAG 2.1 | 1.4.3 Contrast (Minimum) — normal text | 4.5:1 |
| WCAG 2.1 | 1.4.3 Contrast (Minimum) — large text | 3:1 |
| WCAG 2.1 | 1.4.6 Contrast (Enhanced) — normal text | 7:1 |
| WCAG 2.1 | 1.4.6 Contrast (Enhanced) — large text | 4.5:1 |
| WCAG 2.1 | 1.4.11 Non-text Contrast | 3:1 |
| APCA / WCAG 3.0 | Body text (normal) | Lc 60 |
| APCA / WCAG 3.0 | Large / heading text | Lc 45 |
| APCA / WCAG 3.0 | Fluent reading | Lc 75 |
| APCA / WCAG 3.0 | UI components | Lc 30 |

Large text is defined as 18px+ regular weight, or 14px+ bold (700+).

---

## Tech

- [React 18](https://react.dev)
- [Vite 5](https://vitejs.dev)
- [Lucide React](https://lucide.dev)
- APCA algorithm — [Myndex SAPC-APCA](https://github.com/Myndex/SAPC-APCA)
- Color blindness matrices — [Machado et al. 2009](https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html)

---

## License

MIT
