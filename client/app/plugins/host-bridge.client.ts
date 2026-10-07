// ============================================================================
// plugins/host-bridge.client.ts
// ----------------------------------------------------------------------------
// Chooses which desktop-capability bridge this renderer uses, then installs
// the browser implementation if the Electron preload did not.
//
// Desktop (preload.js already exposed window.electronAPI with liveplayServer):
//   host = 'desktop' — leave the real bridge alone. isDesktopHost() is true.
//
// Browser (no preload):
//   host = 'browser' — replace the gap with a stub of the same electronAPI
//   surface so call sites never throw. Most methods are no-ops; locales,
//   openExternal and version have real web implementations.
//
// UI gating goes through app/utils/host.ts (isDesktopHost / isBrowserHost /
// isSameOriginWeb). Never duck-type window.electronAPI: the stub has the
// same method names on purpose.
// ============================================================================
import { defineNuxtPlugin } from 'nuxt/app';
import type { ElectronAPI } from '~/types/electronApi';
import { isSameOriginWeb } from '~/utils/host';

/** Resolve to empty success — the shape preload's invoke handlers return. */
const ok = async (): Promise<any> => ({ success: true });
const nullOk = async (): Promise<any> => null;
const emptyList = async (): Promise<any[]> => [];
/** Desktop-only capability with no browser equivalent. */
const unavailable = async (): Promise<never> => {
  throw new Error('not available in browser');
};
/** Explicit failure payload — never a fake success. */
const falseOk = async (): Promise<any> => ({
  success: false,
  error: 'not available in browser',
});

/** Subscribe API that never fires and can be unsubscribed safely. */
const noUnsub = () => {
  /* return unsubscribe */
  return () => {};
};
const noListener = (..._args: any[]) => noUnsub;

function buildStub(): ElectronAPI {
  // Browser implementation of the ElectronAPI contract. Desktop-only
  // methods resolve empty or throw `unavailable` — never pretend success.
  // Locales ship as static JSON under /locales/ (staged at build from
  // client/locales by scripts/sync-web-root.js).
  let localeIndex: Array<{ code: string; name: string; direction: string }> | null = null;
  const localeData = new Map<string, any>();

  /** Base URL for staged locale JSON (always under the app mount). */
  function localesBase(): string {
    if (isSameOriginWeb()) return '/web/locales/';
    const base = (import.meta as any).env?.BASE_URL;
    if (typeof base === 'string' && base && base !== './') {
      return base.replace(/\/?$/, '/') + 'locales/';
    }
    return './locales/';
  }

  async function fetchLocaleIndex() {
    if (localeIndex) return localeIndex;
    // codes come from locales/index.json (written by scripts/sync-web-root.js)
    // so this file never hardcodes the language list.
    //
    // Resolve from the /web mount, not the document URL: with baseURL './'
    // an extension-less deep link makes './locales/...' 404 and we would
    // silently ship zero languages.
    const indexUrl = localesBase() + 'index.json';
    let codes: string[] = [];
    try {
      const idx = await fetch(indexUrl);
      if (idx.ok) {
        const parsed = await idx.json();
        if (Array.isArray(parsed)) codes = parsed.filter((c) => typeof c === 'string');
      } else {
        console.error('[host-bridge] locales index missing', idx.status, indexUrl);
      }
    } catch (e) {
      console.error('[host-bridge] locales index fetch failed', indexUrl, e);
    }
    if (codes.length === 0) {
      // Loud fallback: at least English, or the UI would show raw keys.
      console.error('[host-bridge] falling back to locale list ["en"]');
      codes = ['en'];
    }
    const entries = await Promise.all(
      codes.map(async (code) => {
        try {
          const res = await fetch(localesBase() + `${code}.json`);
          if (!res.ok) return null;
          const data = await res.json();
          localeData.set(code, data);
          const meta = data?._metadata ?? {};
          return {
            code,
            name: meta.name || code,
            direction: meta.direction === 'rtl' ? 'rtl' : 'ltr',
          };
        } catch {
          return null;
        }
      }),
    );
    localeIndex = entries.filter(Boolean) as typeof localeIndex;
    return localeIndex!;
  }

  return {
    // ---- web-capable ---------------------------------------------------
    openExternal: (url: string) => {
      window.open(url, '_blank', 'noopener,noreferrer');
      return Promise.resolve();
    },
    getSystemLocale: async () => {
      const lang = navigator.language || 'en';
      return lang.split('-')[0];
    },
    getAvailableLocales: () => fetchLocaleIndex(),
    getLocaleData: async (code: string) => {
      if (localeData.has(code)) return localeData.get(code);
      await fetchLocaleIndex();
      return localeData.get(code) ?? null;
    },
    getAppVersion: async () =>
      (import.meta as any).env?.VITE_APP_VERSION || 'web',
    updateMenuLanguage: ok,
    getFilePath: (_file: File) => null,

    // ---- safely disabled (empty) ---------------------------------------
    selectProjectFolder: nullOk,
    selectProjectFile: nullOk,
    selectAudioFiles: nullOk,
    readFile: falseOk,
    readAudioFile: falseOk,
    loadAudioBuffer: unavailable,
    writeFile: falseOk,
    writeBinaryFile: falseOk,
    showSaveArchiveDialog: nullOk,
    showOpenArchiveDialog: nullOk,
    showSaveJsonDialog: nullOk,
    copyFile: falseOk,
    ensureDirectory: falseOk,
    generateWaveform: falseOk,
    openFolder: falseOk,
    setCurrentProject: ok,
    exportProject: falseOk,
    importProject: falseOk,
    importLpaFile: falseOk,
    onExportProgress: noListener,
    onImportProgress: noListener,
    removeExportProgressListener: noListener,
    removeImportProgressListener: noListener,
    checkFfmpeg: async () => ({ available: false, path: null }),
    searchYouTube: emptyList,
    downloadYouTubeAudio: unavailable,

    // Menu / chrome — never fire in a browser tab.
    onMenuNewProject: noListener,
    onMenuOpenProject: noListener,
    onMenuSaveProject: noListener,
    onMenuExportProject: noListener,
    onMenuImportProject: noListener,
    onMenuCloseProject: noListener,
    onMenuOpenRecentProject: noListener,
    onMenuOpenProjectFolder: noListener,
    onMenuToggleDarkMode: noListener,
    onMenuChangeAccentColor: noListener,
    onMenuChangeLanguage: noListener,
    onMenuShowAbout: noListener,
    onMenuOpenSettings: noListener,

    // App lifecycle / quit flow
    app: {
      relaunch: ok,
      exit: ok,
      confirmQuit: ok,
      onRequestQuit: () => noUnsub,
    },

    // Updates (desktop installer only)
    checkForUpdates: async () => ({ success: false, error: 'not available in browser' }),
    downloadUpdate: falseOk,
    installUpdate: () => {},
    onUpdateAvailable: noListener,
    onUpdateDownloadProgress: noListener,
    onUpdateDownloaded: noListener,
    onUpdateError: noListener,
    onManualUpdateAvailable: noListener,

    // File associations / detached windows / mode broadcast
    onOpenFileAssociation: noListener,
    getPendingOpenFile: nullOk,
    openCartPlayerWindow: unavailable,
    attachCartPlayerWindow: () => {},
    getCartWindowProjectData: nullOk,
    onCartPlayerWindowOpened: noListener,
    onCartPlayerWindowClosed: noListener,
    onCartWindowProjectUpdate: noListener,
    openMixerWindow: unavailable,
    attachMixerWindow: () => {},
    onMixerWindowOpened: noListener,
    onMixerWindowClosed: noListener,
    broadcastUiMode: () => {},
    onUiModeSet: noListener,

    // Local server lifecycle — the server is already running somewhere.
    liveplayServer: {
      getConfig: async () => {
        // /web on a LivePlay server: THAT origin is the show, no picker.
        if (isSameOriginWeb()) {
          return { mode: 'remote', remoteUrl: location.origin, localPort: 4480 };
        }
        // Standalone browser: persist the operator's choice. An empty
        // remoteUrl must not be pushed into setServerUrl() — that would make
        // httpBase empty and the socket would dial the page's own origin.
        let remoteUrl = '';
        try {
          remoteUrl = localStorage.getItem('liveplay.serverUrl') || '';
        } catch {
          /* private browsing */
        }
        return { mode: 'remote', remoteUrl: remoteUrl || undefined, localPort: 4480 };
      },
      setConfig: async (cfg: any) => {
        try {
          if (cfg?.remoteUrl) {
            localStorage.setItem('liveplay.serverUrl', cfg.remoteUrl);
          }
        } catch {
          /* private browsing */
        }
        return { success: true, localPort: 4480 };
      },
      getStatus: async () => ({ running: true, mode: 'remote' }),
      restart: ok,
      shutdown: ok,
      ensureRunning: ok,
      onStateChange: () => noUnsub,
    },

    // LAN discovery is UDP — not available in a browser.
    liveplayDiscovery: {
      start: ok,
      list: emptyList,
      solicit: ok,
      onServers: () => noUnsub,
      recentList: emptyList,
      recentAdd: emptyList,
      recentRemove: emptyList,
    },

    liveplayProjects: {
      recentList: emptyList,
      recentAdd: emptyList,
      recentRemove: emptyList,
      recentClear: emptyList,
    },

    // Dev-only state viewer
    updateAppState: () => {},
    isDevMode: async () => false,

    // MIDI config — machine-local; browser has no equivalent yet.
    readMidiConfig: async () => null,
    writeMidiConfig: ok,

    // Legacy local HTTP API bridge (main-process proxy)
    syncProjectData: () => {},
    sendApiResponse: () => {},
    onApiUpdateItem: noListener,
    onApiUpdateCartItem: noListener,
    onTriggerItem: noListener,
    onStopItem: noListener,
    onTriggerCartSlot: noListener,
    onStopAllCues: noListener,
  };
}

export default defineNuxtPlugin({
  name: 'liveplay-host-bridge',
  // Must run before liveplay-server.client.ts so isSameOriginWeb() and the
  // stub exist when the connection plugin dials. Filename order is not a
  // contract.
  enforce: 'pre',
  setup() {
  const g = globalThis as any;
  // Real preload (Electron) always wins — even if import.meta.client is odd.
  if (g.electronAPI?.liveplayServer) {
    g.__liveplayHost = 'desktop';
    return;
  }
  if (!import.meta.client) return;

  // Browser (or an Electron shell without our preload): stub the contract.
  g.__liveplayHost = 'browser';
  const stub = buildStub() as ElectronAPI & { __isHostStub?: boolean };
  stub.__isHostStub = true;
  g.electronAPI = stub;
  },
});
