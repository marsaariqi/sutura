import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { getDb, closeDb } from './database'
import { registerIpcHandlers, getTaskRunner } from './ipc-handlers'

function initGlossaryScanner(): void {
  if (app.isPackaged) {
    try {
      // Point to the exact deep path you found in your dist folder
      const dictPath = join(
        process.resourcesPath,
        'app.asar.unpacked',
        'node_modules',
        'nodejieba',
        'submodules',
        'cppjieba',
        'dict'
      )

      const nj = require('nodejieba')

      nj.load({
        dict: join(dictPath, 'jieba.dict.utf8'),
        hmmDict: join(dictPath, 'hmm_model.utf8'),
        userDict: join(dictPath, 'user.dict.utf8'),
        idfDict: join(dictPath, 'idf.utf8'), // Use idfDict for TS/C++ compatibility
        stopWordDict: join(dictPath, 'stop_words.utf8') // Use stopWordDict
      })

      console.log('Sutura: Glossary Scanner linked to submodule dicts.')
    } catch (err) {
      console.error('Sutura: Glossary Scanner fail:', err)
    }
  }
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'Sutura',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Initialize database
  getDb()

  // Register IPC handlers
  registerIpcHandlers(mainWindow)

  // Wire TaskRunner to window
  getTaskRunner().setWindow(mainWindow)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.sutura.app')

  // Defer native initialization slightly to ensure app starts
  setTimeout(() => {
    console.log('Sutura: Initializing native modules...')
    initGlossaryScanner()
  }, 1000)

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  getTaskRunner().stop()
  closeDb()
})
