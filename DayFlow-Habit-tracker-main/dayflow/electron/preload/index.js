/**
 * DayFlow — Electron Preload Script
 *
 * Exposes a tiny, read-only info object to the page. All app data lives in the
 * web layer (IndexedDB), so no database or file-system access is exposed here.
 * contextIsolation is on and nodeIntegration is off.
 */

const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('dayflowApi', {
  app: {
    isElectron: true,
    electronVersion: process.versions.electron,
  },
})
