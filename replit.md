# DiamondIQ

Private intelligence and education platform for O'Connell Sports Management / TOC Sports clients.

## Overview

DiamondIQ gives represented OSM athletes access to proprietary knowledge, historical research, data, education, market intelligence, and analytical tools accumulated by O'Connell Sports Management.

## Stack

- **Backend**: Node.js + Express (TypeScript, tsx watch)
- **Frontend**: React + TypeScript + Vite (port 5173, proxies /api → backend)
- **Database**: PostgreSQL (Replit managed)
- **Auth**: Session-based (connect-pg-simple)
- **Styles**: Tailwind CSS, Inter + Barlow Condensed fonts

## How to Run

The app runs as two processes but is configured as one workflow via `concurrently`:

```
npm run dev
```

This starts:
- Express API server on port 3001
- Vite dev server on port 5173 (user-facing, proxies /api)

## Dev Credentials (fixture data only)

- **Admin**: admin@ocmsports.com / DiamondIQ2024!
- **Athlete**: jackson.miller@demo.com / Athlete2024!

All fixture data is clearly labeled "DEV FIXTURE" and is not verified production intelligence.

## Non-Negotiable Build Rules

1. TOC Sports logo: use ONLY `assets/branding/TOC_White_OFFICIAL.png`. If it fails to load, show nothing.
2. Evidence-First AI: never fabricate facts, contacts, bonuses, grades, or relationships.
3. Every report is internal/unpublished by default. Athlete cannot read it until Admin explicitly publishes.
4. Admin review: Keep / Edit / Replace / Hide (Hide always available).
5. Canonical client nav: Draft Intelligence / NIL Intelligence / Club Draft Intelligence (no Scenarios nav item).
6. Intelligence Requests are Admin-only — never shown in client nav.
7. Phase 1 Draft Report: no DI Overall score, no generated tool grades, no signability %, no round probabilities, no numeric comp scores.

## Architecture Notes

- `server/` — Express API (TypeScript compiled via tsx)
- `client/` — Vite React app
- `shared/types.ts` — shared TypeScript types
- `server/db/schema.sql` — database schema (applied on startup)
- `server/db/seed.ts` — dev fixture seed (runs once on empty DB)
- `assets/branding/` — official brand assets (never modify)
- `assets/references/` — approved visual reference screens

## User Preferences

- Build to spec — do not redesign, invent pages, or change navigation
- Reference images control visual direction; written specs control functionality
- Dev fixture data is clearly labeled and never treated as real intelligence
