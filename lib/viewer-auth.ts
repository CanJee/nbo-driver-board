/**
 * Shared-password gate for the read-only board at /view.
 *
 * Separate from the dispatcher login on purpose: viewers get their own code, and
 * rotating VIEWER_PASSWORD immediately invalidates every cookie ever issued
 * (the token is derived from the password), which is the whole revocation story
 * for a shared credential.
 *
 * Threat model: this protects a low-value operational board that already sits on
 * an unlisted URL. A copied cookie value is replayable until the password is
 * changed, and that is an accepted trade for a code people can read off a slide
 * and type into a TV once. It is NOT a substitute for the dispatcher session,
 * which is what still guards every write via Supabase RLS.
 *
 * Web Crypto (not node:crypto) because this runs in the proxy as well as in
 * server actions and route handlers, and only Web Crypto exists in all three.
 */

export const VIEWER_COOKIE = 'nbo_viewer';

/** Domain separator, so the cookie value can't be reused as any other HMAC. */
const TOKEN_MESSAGE = 'nbo-viewer-board.v1';

/** 180 days: a venue TV should survive the whole tournament without re-entry. */
export const VIEWER_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

export const viewerCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: VIEWER_COOKIE_MAX_AGE,
} as const;

async function hmacHex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Compares without leaking where the first difference is. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True when a viewer password is configured at all. */
export function viewerAccessConfigured(): boolean {
  return Boolean(process.env.VIEWER_PASSWORD);
}

/**
 * The cookie value a correct password earns. Deterministic, so any serverless
 * instance can verify it with no shared store. Null when VIEWER_PASSWORD is
 * unset, which makes the gate fail closed rather than open.
 */
export async function computeViewerToken(): Promise<string | null> {
  const password = process.env.VIEWER_PASSWORD;
  if (!password) return null;
  return hmacHex(password, TOKEN_MESSAGE);
}

export async function isValidViewerToken(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const expected = await computeViewerToken();
  if (!expected) return false;
  return timingSafeEqual(value, expected);
}

export async function verifyViewerPassword(input: string): Promise<boolean> {
  const password = process.env.VIEWER_PASSWORD;
  if (!password || !input) return false;
  // Hash both sides before comparing so the compare is over fixed-length
  // strings and can't leak the real password's length.
  const [a, b] = await Promise.all([
    hmacHex(password, TOKEN_MESSAGE),
    hmacHex(input, TOKEN_MESSAGE),
  ]);
  return timingSafeEqual(a, b);
}
