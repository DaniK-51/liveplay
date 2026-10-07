import type { ElectronAPI } from './electronApi';

export {};

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }

  interface ImportMeta {
    client: boolean;
  }
}
