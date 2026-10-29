# Flashcards PWA — Plan

Goal: personal Anki-like app. Create decks on the computer, study on the phone, offline, with images. Cost: $0.

Mockup: https://claude.ai/artifact/NCEH53RDCeWdoYL2er5CZo

## Key decisions

- **One PWA, two layouts.** Same URL on both devices. Wide screen → deck editor; phone → study screens.
- **Transfer = file, no backend (MVP).** Editor exports `deck.zip`; phone imports it from Files / Drive / iCloud. Sync backend is a later, optional phase.
- **Images stored as Blobs in IndexedDB**, resized to max 800 px WebP (~30–80 KB) when added in the editor.
- **Scheduler = FSRS** via `ts-fsrs` (same algorithm modern Anki uses). No custom SRS math.

## Stack

| Concern | Choice |
|---|---|
| Build | Vite + React + TypeScript |
| PWA (manifest, service worker, offline) | `vite-plugin-pwa` |
| Storage | IndexedDB via `dexie` |
| Scheduling | `ts-fsrs` |
| Zip import/export | `jszip` |
| Anki `.apkg` import | `sql.js` (SQLite in WASM) |
| Audio | Web Speech API (`speechSynthesis`), free |
| Tests | Vitest + Testing Library + `fake-indexeddb`; Playwright for e2e |
| Hosting | GitHub Pages / Netlify / Vercel (free, HTTPS required for PWA) |

## Card model (Japanese)

- **Question** = a word, or a sentence with one word marked: `毎朝おにぎりを[食べます]。` → the bracketed part renders underlined.
- **Answer** = the word: `answer` (dictionary form, 食べる), `reading` (たべる), `meaning` (comer), optional `translation` of the sentence.
- **Image** = optional memory hook shown **only on the answer side**. On the question side the art window shows the deck glyph, because a picture there would give the meaning away and you'd learn the picture instead of the word (decided 2026-10-28).
- Audio: Web Speech API with `ja-JP` voice reads the answer.

## Daily session (mixed)

- "Iniciar repaso" builds one queue across **all active decks**: learning cards due now → reviews due today → new cards up to a **global daily limit** (default 15), shuffled together.
- New-card budget is split between decks by a per-deck share; a deck can be paused (no new cards, reviews continue).
- Tapping a single deck = focused session on that deck only.
- Card states (FSRS): New → Learning → Review ↔ Relearning.

## Deck rating: green / red

- Every deck has `rating: "green" | "red"` (default green), set in the editor and carried in `deck.json`.
- On the phone, red decks are **hidden by default**: excluded from the deck list, due counts and the daily session.
- A "Mostrar mazos rojos" toggle (home + settings) reveals them; it is **not persisted** — resets to hidden on every app launch.
- The computer editor always shows all decks.

## Visual theme

Ported from TCGVault / kotoba-deck (`tcg-vault/TCGVault/Theme/Theme.swift`): parchment `#F2E9D2` + gold `#B9974A` + indigo `#241C44`, grade inks ruby/amber/emerald/sapphire, chamfered "facet" buttons, glowing gold due-diamond, diamond progress pips, cards drawn as TCG cards (art window + name band + text box). Fonts: Barlow Condensed (chrome), Shippori Mincho (Japanese), Noto Sans JP (body). Import = "abrir sobre" (booster pack).

## Deck file format (`deck.zip`)

```
deck.zip
├── deck.json      # { version, id, name, cards: [{ id, question, answer, reading, meaning, translation, image, tags }] }
└── media/
    └── onigiri.webp
```

Stable card `id`s let a re-import merge and keep review progress.

## Phases

### Phase 0 — Setup
- [x] Scaffold Vite + React + TS, Vitest, ESLint
- [x] `vite-plugin-pwa`: manifest, icons, offline precache
- [x] Deploy to GitHub Pages: https://jairogilc.github.io/flashcards/ (install on phone still to validate)

### Phase 1 — Data + scheduler (TDD)
- [x] Dexie schema: `decks`, `cards`, `media` (ArrayBuffer — iOS-safe), `reviews` (log)
- [x] Wrap `ts-fsrs`: `rate(card, grade, now)` → next due + interval labels
- [x] Queue builder across decks: learning + due reviews + new cards (global daily limit, per-deck share, paused decks), shuffled
- [x] Red-deck filter: queue and counts exclude red decks unless the session flag is on (flag lives in memory only)

### Phase 2 — Study screens (phone)
- [x] Deck list with New / Learning / Due counts
- [x] Review: front (image + prompt) → show answer → Again / Hard / Good / Easy
- [x] TTS button on answer
- [x] Session progress + "done for today" state
- [x] Daily settings: new cards/day, per-deck share, pause/resume, "show red decks" toggle

### Phase 3 — Editor (computer)
- [x] Create / rename / delete decks; set rating green / red
- [x] Card form: question with `[word]` marker, answer, reading, meaning, translation, hint image (drag, paste, pick → WebP), tags
- [x] Live TCG-card preview of the question side
- [x] Card table with search, edit, delete
- [x] CSV import (bulk text cards)

### Phase 4 — Import / export
- [x] Export deck → `deck.zip`
- [x] Import `deck.zip` on phone; merge by card id, keep progress
- [x] Import Anki `.apkg` (SQLite + media map) — basic note types only
- [x] Full backup export / restore (all decks + review history)
- [x] `navigator.storage.persist()` + storage usage display

### Phase 5 — Polish
- [ ] Daily reminder (web push; iOS 16.4+ only when installed)
- [ ] Stats: reviews per day, retention
- [x] XP / level bar on the home screen
- [ ] Dark mode

### Later (optional)
- [ ] Sync between devices via free Supabase tier (replaces manual zip transfer)

## Risks

- **iOS may evict storage** of PWAs unused for weeks → `storage.persist()`, backup reminder, optional sync later.
- **`.apkg` variety** (cloze, custom templates) → support Basic / Basic+Reverse first.
- **Storage size** → resize images on add; show usage.

## Review

2026-10-28. Phases 0–4 implemented (Phase 0 deploy still pending). 152 tests in 19 files; ran the full suite 5× with no failures; `tsc -b` clean; lint 0 errors (2 fast-refresh warnings in shared ui/app files); `npm run build` OK (13 precache entries incl. sql.js wasm). Manually tested the production preview in Chrome: create deck → add card (Cmd+Enter) → home counts → review flip/grade → done screen; import and settings screens render; no console errors.
Built by the lead (core, db, shared UI, shell) plus 3 agents (study screens, editor, import/apkg/backup/PWA assets). One flaky test was traced to a real bug: Review's queue load had no error handling. Fixed with an error state and a test.
Card tags field exists in the model but has no editor UI yet.

2026-10-28 (deploy prep). Added the GitHub Pages workflow (lint → test → build → deploy on push to `main`), an `npm test` script and a README. Pre-push reviews (code + senior) found one blocker, now fixed with tests: unrelated `.apkg` decks from Anki's "Default" deck (did 1) shared the id `apkg-1`, and "Reemplazar" would wipe the other deck. Also fixed: an Anki re-import no longer resets a red deck to green; duplicate card ids in deck.json are rejected; out-of-range `&#…;` entities no longer abort an Anki import; the import prompt names the deck already on the device; Google Fonts are cached for offline use; CI uses Node 22. 159 tests passing.
Deferred from review: shared images can be deleted along with one card; zip-bomb size limits; full srs validation on backup restore; a stale app after a deploy can't lazy-load the sqlite chunk until relaunch; no Dexie versionchange handler; backup reminder; a padded maskable icon.
