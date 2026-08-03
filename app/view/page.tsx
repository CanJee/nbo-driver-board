import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Board from '@/components/board/Board';
import { createClient } from '@/lib/supabase/server';
import { loadViewerBoardData, ViewerBoardData } from '@/lib/viewer-data';
import { VIEWER_COOKIE, isValidViewerToken } from '@/lib/viewer-auth';

export const metadata: Metadata = {
  title: 'NBO Dispatch - View Only',
  robots: { index: false, follow: false },
};

async function isAllowed(): Promise<boolean> {
  const store = await cookies();
  if (await isValidViewerToken(store.get(VIEWER_COOKIE)?.value)) return true;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return Boolean(user);
}

export default async function ViewerBoardPage() {
  // proxy.ts gates this already; repeated here so the page is safe on its own.
  if (!(await isAllowed())) redirect('/view/login');

  // A failed first load renders an empty board rather than a 500, and tells the
  // board not to claim it is live — the staleness banner then says so out loud,
  // and the client's own poll picks the data up as soon as it can.
  let data: ViewerBoardData = { drivers: [], dispatchers: [] };
  let initialSyncOk = true;
  try {
    data = await loadViewerBoardData();
  } catch (err) {
    console.error('[view] initial load failed', err);
    initialSyncOk = false;
  }

  return (
    <Board
      readOnly
      initialSyncOk={initialSyncOk}
      initialDrivers={data.drivers}
      initialDispatchers={data.dispatchers}
    />
  );
}
