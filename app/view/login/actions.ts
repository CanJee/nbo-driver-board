'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  VIEWER_COOKIE,
  computeViewerToken,
  verifyViewerPassword,
  viewerAccessConfigured,
  viewerCookieOptions,
} from '@/lib/viewer-auth';

/** Slows down guessing without needing any shared rate-limit state. */
const WRONG_CODE_DELAY_MS = 400;

export async function viewerLogin(formData: FormData) {
  const password = formData.get('password') as string;

  // Distinct from a wrong code: nobody can type their way past an unset
  // VIEWER_PASSWORD, so say so rather than looping them on "incorrect".
  if (!viewerAccessConfigured()) {
    redirect('/view/login?error=unconfigured');
  }

  if (!password || !(await verifyViewerPassword(password))) {
    await new Promise((r) => setTimeout(r, WRONG_CODE_DELAY_MS));
    redirect('/view/login?error=1');
  }

  const token = await computeViewerToken();
  if (!token) {
    redirect('/view/login?error=unconfigured');
  }

  (await cookies()).set(VIEWER_COOKIE, token, viewerCookieOptions);
  redirect('/view');
}

export async function viewerLogout() {
  (await cookies()).delete(VIEWER_COOKIE);
  redirect('/view/login');
}
