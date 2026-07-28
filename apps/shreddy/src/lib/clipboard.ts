/**
 * Copy text to the clipboard, resilient to non-secure contexts.
 *
 * `navigator.clipboard` only exists on HTTPS or `localhost`. Shreddy is normally
 * opened over the LAN by IP (e.g. http://192.168.x.x:8080/shreddy), which is a
 * non-secure context where `navigator.clipboard` is `undefined` — so we fall back
 * to a hidden-textarea + `execCommand("copy")`, which still works over plain HTTP.
 *
 * Must be called from within a user gesture (click/tap) for the fallback to work.
 * Returns true on success.
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy path (permissions/denied/non-secure)
    }
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    ta.style.pointerEvents = "none";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length); // iOS Safari needs an explicit range
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
