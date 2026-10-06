// =====================================================================
// plugins/browser-bridge.client.ts
// ---------------------------------------------------------------------
// When the renderer runs in a plain browser there is no preload.js, so
// `window.electronAPI` is missing and call sites either throw or silently
// skip work that later assumes success (notably locales).
//
// This plugin installs a no-op bridge BEFORE any component mounts. Every
// method resolves to an empty success / empty list / no-op unsubscribe so
// the desktop UI can boot unchanged with Electron-only features disabled.
// A few methods have real web implementations (locale, openExternal, version).
//
// Detection: `isElectronHost()` is false when we installed the stub. UI that
// must hide desktop-only chrome (local server, updates, YouTube, native
// dialogs) should use that flag rather than duck-typing method presence.
// =====================================================================
import { defineNuxtPlugin } from 'nuxt/app';

/** Resolve to empty success — the shape preload's invoke handlers return. */
const ok = async () => ({ success: true });
const nullOk = async () => null;
const emptyList = async () => [];
const falseOk = async () => ({ success: false, error: 'not available in browser' });

/** Subscribe API that never fires and can be unsubscribed safely. */
const noUnsub = () => {
  /* return unsubscribe */
  return () => {};
};
const noListener = (..._args: any[]) => noUnsub;

function buildStub() {
  // Locales ship as static JSON under /locales/ (copied from client/locales).
  // Loaded lazily so first paint is not blocked on 21 files.
  let localeIndex: Array<{ code: string; name: string; direction: string }> | null = null;
  const localeData = new Map<string, any>();

  async function fetchLocaleIndex() {
    if (localeIndex) return localeIndex;
    const codes = [
      'ar', 'bn', 'de', 'el', 'en', 'es', 'fa', 'fr', 'hi', 'it', 'ja',
      'ko', 'no', 'pt', 'ro', 'ru', 'sq', 'sv', 'tr', 'ur', 'zh',
    ];
    const entries = await Promise.all(
      codes.map(async (code) => {
        try {
          const res = await fetch(`./locales/${code}.json`);
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
    downloadYouTubeAudio: falseOk,

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
    openCartPlayerWindow: falseOk,
    attachCartPlayerWindow: () => {},
    getCartWindowProjectData: nullOk,
    onCartPlayerWindowOpened: noListener,
    onCartPlayerWindowClosed: noListener,
    onCartWindowProjectUpdate: noListener,
    openMixerWindow: falseOk,
    attachMixerWindow: () => {},
    onMixerWindowOpened: noListener,
    onMixerWindowClosed: noListener,
    broadcastUiMode: () => {},
    onUiModeSet: noListener,

    // Local server lifecycle — the server is already running somewhere.
    liveplayServer: {
      getConfig: async () => {
        // /web on a LivePlay server: THAT origin is the show, no picker.
        const path = location.pathname;
        if (path === '/web' || path.startsWith('/web/')) {
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
      recentAdd: ok,
      recentRemove: ok,
    },

    liveplayProjects: {
      recentList: emptyList,
      recentAdd: ok,
      recentRemove: ok,
      recentClear: ok,
    },

    // Dev-only state viewer
    updateAppState: () => {},
    isDevMode: async () => false,

    // MIDI config — machine-local; browser keeps a silent stub for now.
    readMidiConfig: nullOk,
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

export default defineNuxtPlugin(() => {
  if (!import.meta.client) return;

  const g = globalThis as any;
  if (g.electronAPI?.liveplayServer) {
    // Real preload bridge — do not touch.
    g.__liveplayHostKind = 'electron';
    return;
  }

  g.__liveplayHostKind = 'browser';
  g.electronAPI = buildStub();
});
