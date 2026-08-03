import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { VIEWER_COOKIE, isValidViewerToken } from '@/lib/viewer-auth';

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isViewerPath = path === '/view' || path.startsWith('/view/');
  const isViewerLogin = path === '/view/login';
  const hasViewerCookie = await isValidViewerToken(request.cookies.get(VIEWER_COOKIE)?.value);

  // ── Viewer (read-only) board ──
  // Handled ahead of the dispatcher session check so a venue TV never pays for a
  // Supabase round-trip, and so viewers are sent to their own login rather than
  // the dispatcher one.
  if (isViewerLogin) {
    // GET only: bouncing a POST here would swallow the login server action.
    if (request.method === 'GET' && hasViewerCookie) {
      return NextResponse.redirect(new URL('/view', request.url));
    }
    return NextResponse.next({ request });
  }
  if (isViewerPath && hasViewerCookie) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session if expired — required for Server Components to get fresh auth state
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginPage = path === '/login';

  // A signed-in dispatcher can open /view without also knowing the viewer code;
  // anyone else asking for it is sent to the viewer login, not the staff one.
  if (!user && isViewerPath) {
    return NextResponse.redirect(new URL('/view/login', request.url));
  }

  if (!user && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (user && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    // Run on all paths except static assets and image optimization
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)',
  ],
};
