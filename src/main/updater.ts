import { app, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'

/**
 * Initializes the background auto-updater in production.
 * Checks for updates, downloads them in the background, and prompts
 * the user with a Windows-native dialogue box to restart and apply.
 */
export function initUpdater(): void {
  // Only check for updates in production package distributions
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.error('Failed to check for updates:', err)
  })

  autoUpdater.on('update-downloaded', (info) => {
    dialog
      .showMessageBox({
        type: 'info',
        title: 'Update Ready',
        message: `Version ${info.version} of Focus Timer has been downloaded. Restart and apply the update now?`,
        buttons: ['Restart and Update', 'Later'],
        defaultId: 0,
        cancelId: 1
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall()
        }
      })
  })
}
