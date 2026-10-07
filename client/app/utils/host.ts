// ============================================================================
// app/utils/host.ts
// ----------------------------------------------------------------------------
// Which host this renderer is running in, and where LivePlay lives.
//
// Two independent questions, one module so every call site agrees:
//
//   1. HOST — who provides desktop capabilities (files, dialogs, MIDI, …)?
//        'desktop'  Electron preload exposed window.electronAPI (liveplay-server).
//        'browser'  No preload; plugins/host-bridge.client.ts installed a stub.
//                   Desktop-only features are disabled in the UI.
//
//   2. TARGET — which LivePlay audio server should this UI talk to?
//        Served from that server's /web  →  the origin that sent the page
//        (no picker: we asked THIS server for the UI, so it is the show).
//        Otherwise                       →  localStorage / local default.
//
// Do NOT duck-type window.electronAPI: the browser host also has that object
// (a stub). Use isDesktopHost() / isBrowserHost() instead.
// ============================================================================

/** Implementation of the desktop-capability bridge. */
export type LiveplayHost = 'desktop' | 'browser';

const HOST_KEY = '__liveplayHost';

function readHost(): LiveplayHost {
  return (globalThis as any)[HOST_KEY] === 'desktop' ? 'desktop' : 'browser';
}

/**
 * Current host implementation.
 * Set once at startup by `plugins/host-bridge.client.ts` (never by features).
 */
export function liveplayHost(): LiveplayHost {
  return readHost();
}

/**
 * True when the Electron preload bridge is live (`window.electronAPI` from
 * preload.js → IPC → main). Local server lifecycle, YouTube import, LAN
 * discovery, native dialogs and updates may be shown.
 */
export function isDesktopHost(): boolean {
  return readHost() === 'desktop';
}

/**
 * True when this UI runs in a plain browser (stub bridge). Desktop-only
 * chrome should be hidden; show control over HTTP/WS still works.
 */
export function isBrowserHost(): boolean {
  return readHost() === 'browser';
}

/**
 * True when the page was served by a LivePlay audio server at `/web`
 * (http://\<host\>:4480/web/...).
 *
 * That mode is the tablet/browser remote for the machine that hosts the show:
 * the UI must use `location.origin` and must not offer a server picker.
 * Always false in Electron (desktop has its own connection settings).
 */
export function isSameOriginWeb(): boolean {
  if (isDesktopHost()) return false;
  if (typeof location === 'undefined') return false;
  const path = location.pathname;
  return path === '/web' || path.startsWith('/web/');
}

/**
 * Default LivePlay server URL for this host.
 *
 * - Hosted web remote (`/web`): the origin that served the page.
 * - Otherwise: `localStorage['liveplay.serverUrl']`, else `http://127.0.0.1:4480`.
 */
export function defaultServerUrl(): string {
  if (isSameOriginWeb()) return location.origin;
  try {
    return localStorage.getItem('liveplay.serverUrl') || 'http://127.0.0.1:4480';
  } catch {
    return 'http://127.0.0.1:4480';
  }
}

/** Compare server URLs, ignoring trailing slashes and surrounding space. */
export function isSameServerUrl(a: string, b: string): boolean {
  return a.trim().replace(/\/+$/, '') === String(b).trim().replace(/\/+$/, '');
}
