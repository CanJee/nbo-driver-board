<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Workflow for medium+ changes

Applies to anything beyond a trivial one-liner or copy tweak — new features, UI
changes spanning multiple files, or anything that alters behavior or data shape.
Do these automatically, without being asked:

1. **Branch off latest `main`** — never commit to `main` directly:
   `git checkout main && git pull --ff-only && git checkout -b <short-descriptive-name>`
2. **Read before writing** — check the relevant guide in `node_modules/next/dist/docs/`
   (this Next.js has breaking changes) and mirror the patterns in the code you're touching.
3. **Favor a single source of truth** over editing many call sites, and leave a short
   "why" comment on anything non-obvious. For temporary changes, note how to undo them.
4. **Build it** — `npm run build` must pass clean (same type-check + build Vercel runs).
5. **Verify it visually yourself** — start the dev server and screenshot the affected
   screen; read the DOM (not just pixels) to confirm exact text/state. The board sits
   behind Supabase auth (`proxy.ts` redirects to `/login`) with no local password, so to
   view authed screens, temporarily short-circuit `proxy.ts` with an early
   `return response;`, screenshot, then **revert before committing**
   (`git checkout -- proxy.ts`). Never commit an auth bypass.
6. **Push the branch for a preview** — `git push -u origin <branch>`. Each branch gets its
   own isolated Supabase preview DB (see [`PREVIEW.md`](PREVIEW.md)); the user tests there.
7. **Report** the branch, what you verified, and anything the user should double-check.
