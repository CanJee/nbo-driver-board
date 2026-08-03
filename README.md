This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Viewer mode

`/view` is a read-only copy of the dispatch board for TVs, and for staff who need to see
the board without touching it. It has its own shared code (`VIEWER_PASSWORD`), entered once
at `/view/login`; the cookie lasts 180 days so a venue TV is set up once and left alone.
Rotating `VIEWER_PASSWORD` invalidates every viewer cookie already issued.

What differs from the dispatcher board:

- Nothing can be changed: no drag, no check-in/out, no assign, no notes, no away status.
- **Driver phone numbers are never sent to the browser**: they are stripped server-side in
  [`lib/viewer-data.ts`](lib/viewer-data.ts), not merely hidden in the UI.
- No Supabase session, so no realtime. The board polls `/view/data` every 15s and shows a
  **Not Live** pill plus a full-width banner if data is more than 45s old, so a screen that
  has quietly stopped updating can't be mistaken for a current one.
- It refetches immediately when a device wakes, refocuses, or comes back online, and keeps
  the screen awake where the browser allows it.
- Zoom, theme, lane widths and search all still work; they're per-device display settings.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
