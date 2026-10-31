DayFlow is a local-first, AI-assisted habit and study-plan tracker. It runs in the browser as a PWA, and it also has an Electron desktop build.

Plan: you add habits by hand (checkbox, quantity or duration, daily or weekly) or import a PDF roadmap. The AI turns the PDF into daily tasks, and a built-in fallback does the same without AI.
Track: the Today page lists your tasks grouped by Learning, Workout and Personal. You mark them done, partial, skipped or moved to another day. The Calendar and Progress pages show your history and weekly reports with an AI summary.
Recover: if you finish under 50% of a day, a recovery rule offers to carry the unfinished tasks over to tomorrow.

It’s built with Next.js and React and stores data on your device in IndexedDB. Online accounts can sync through Supabase, but that is optional.
