---
name: DiamondIQ Vite + Tailwind setup quirks
description: Lessons from wiring Vite (root=client/) + Tailwind v3 + PostCSS in a monorepo-style layout where node_modules live at workspace root.
---

## The rule
When the Vite config lives at `client/vite.config.ts` and sets `root: __dirname` (i.e. `client/`), the following three things must be set correctly or styles break silently.

**Why:** Vite's root, Tailwind's CWD assumption, and PostCSS config discovery all use different base paths. Mismatching any one of them produces no CSS with no obvious error.

## How to apply

### 1. Vite config root
Set `root: __dirname` (not `"client"`). When the config is at `client/vite.config.ts`, `__dirname` = `client/`. Setting `root: "client"` resolves relative to CWD (workspace root) = `client/client/` — wrong.

### 2. Vite aliases
With `root = __dirname = client/`:
```ts
alias: {
  "@": path.resolve(__dirname, "src"),          // client/src
  "@shared": path.resolve(__dirname, "../shared"), // workspace/shared
}
```
Do NOT use `"client/src"` — that doubles the directory.

### 3. React/react-dom must be in package.json
Only `@types/react` was listed initially. Must explicitly install `react` and `react-dom` as dependencies.

### 4. Tailwind content paths are relative to CWD (workspace root), not the config file
In `client/tailwind.config.js`, use workspace-root-relative paths:
```js
content: [
  "./client/src/**/*.{ts,tsx,html}",
  "./client/index.html",
]
```
NOT `"./src/..."` — Tailwind resolves globs from the process CWD, which is the workspace root.

### 5. PostCSS must point to the tailwind config explicitly
In `client/postcss.config.js`:
```js
export default {
  plugins: {
    tailwindcss: { config: "./client/tailwind.config.js" },
    autoprefixer: {},
  },
};
```
Without `config: "..."`, Tailwind looks for `tailwind.config.js` in CWD (workspace root) and finds nothing.
