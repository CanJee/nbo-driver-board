import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { loadViewerBoardData } from '@/lib/viewer-data';
import { VIEWER_COOKIE, isValidViewerToken } from '@/lib/viewer-auth';

/**
 * Board data for viewer mode, polled by the read-only board.
 *
 * Viewers have no Supabase session, so this is their only read path — see
 * lib/supabase/service.ts for why it can't just be the anon client. Phone
 * numbers are stripped in loadViewerBoardData before anything is serialised.
 */

/** Lets a long-running TV notice a deploy and reload itself onto current code. */
const REV = process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev';

async function isAllowed(): Promise<boolean> {
  const store = await cookies();
  if (await isValidViewerToken(store.get(VIEWER_COOKIE)?.value)) return true;

  // A signed-in dispatcher may watch /view without the viewer code.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return Boolean(user);
}

export async function GET() {
  // proxy.ts already gates /view/*; this is defence in depth, so a routing
  // change can never quietly turn this into an open data endpoint.
  if (!(await isAllowed())) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const data = await loadViewerBoardData();
    return Response.json(
      { ...data, rev: REV },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    // A 500 here is what turns the board's LIVE pill amber, which is the
    // honest outcome: better a visible "not live" than silently stale cards.
    console.error('[view/data] load failed', err);
    return Response.json({ error: 'unavailable' }, { status: 500 });
  }
}
