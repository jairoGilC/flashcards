# 言葉デッキ Kotoba Deck

A free, offline Anki-style PWA for studying Japanese. Build decks on the computer, study them on the iPhone.

- Spaced repetition with FSRS (`ts-fsrs`); a daily session mixes new and due cards from every deck.
- Cards: a word, or a sentence with one `[underlined]` word. Images are visual hints only.
- Green/red deck rating. Red decks stay hidden until you turn them on, and hide again on every launch.
- Move decks as a `.zip` file (editor → "Empaquetar sobre" → phone → "Abrir sobre"). Anki `.apkg` import is supported.
- Everything is stored on the device (IndexedDB). No account, no server.

## Install on iPhone

Open the GitHub Pages URL in Safari → Share → **Add to Home Screen**.

## Develop

```sh
npm install
npm run dev      # http://localhost:5173
npm test
npm run build
```

Pushing to `main` builds, tests and deploys to GitHub Pages (`.github/workflows/deploy.yml`).
