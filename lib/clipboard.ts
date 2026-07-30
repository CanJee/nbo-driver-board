/**
 * Copy text to the clipboard, resolving to whether it actually landed.
 *
 * `navigator.clipboard` only exists in a secure context (https or localhost),
 * so a tablet pointed at the board over a plain-http LAN address would
 * otherwise throw on every copy. The hidden-textarea + `execCommand` path is
 * the deprecated-but-universal fallback for exactly that case.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or non-secure context — fall through to the legacy path.
    }
  }

  try {
    const el = document.createElement('textarea');
    el.value = text;
    // Keep it off-screen and non-focusable-looking so the page doesn't scroll
    // or flash while the selection is made.
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.top = '-9999px';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}
