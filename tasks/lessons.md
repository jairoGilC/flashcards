# Lessons

- **Don't let a loop's exit status hide failing tests before a commit.** `for i in 1 2 3; do npm test | grep Tests; done && git commit` commits even when a run fails, because only the last `grep` decides the exit code. Count failures explicitly and gate the commit on zero (2026-10-29: a flaky new test slipped into a commit this way; caught before push).
- **Measure layout with offsets, not getBoundingClientRect, inside animated elements.** The answer card measures during its 3D flip-in; transformed rects read too tall and shrank the image frame.
- **Test async image loading by firing events inside `waitFor`.** The `<img>` renders only after the media query and object URL resolve; querying it once races.
- **When the user calls a field redundant, pin down the case they saw before removing it everywhere.** "Respuesta y traducción son redundantes" was about bare-word cards, where the translation repeats the meaning; removing it from sentence cards too had to be undone when they got sentence decks (2026-10-31). Hide by condition, not globally, and say which case you're changing.
