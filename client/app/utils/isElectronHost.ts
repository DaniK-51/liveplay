/** True when running under Electron's preload bridge (not the browser stub). */
export function isElectronHost(): boolean {
  return (globalThis as any).__liveplayHostKind === 'electron';
}

/**
 * True when this page was served by a LivePlay audio server at `/web`
 * (http://<host>:4480/web/...). In that case the UI must talk to that same
 * origin — there is no "which server?" step: we asked THIS server for the UI.
 */
export function isSameOriginWeb(): boolean {
  if (typeof location === 'undefined') return false;
  if (isElectronHost()) return false;
  const p = location.pathname;
  return p === '/web' || p.startsWith('/web/');
}

/**
 * Server URL for the current host.
 * - Served from `/web` → the origin that gave us the page.
 * - Otherwise fall back to localStorage / the local default (dev, Electron).
 */
export function resolveDefaultServerUrl(): string {
  if (isSameOriginWeb()) return location.origin;
  try {
    return localStorage.getItem('liveplay.serverUrl') || 'http://127.0.0.1:4480';
  } catch {
    return 'http://127.0.0.1:4480';
  }
}
