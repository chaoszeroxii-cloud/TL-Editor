import { ipcMain, dialog } from 'electron'
import { writeFile } from 'fs/promises'
import { approvePath } from './pathAccess'

export function registerDialogHandlers(): void {
  ipcMain.handle('dialog:openFolder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (!canceled) approvePath(filePaths[0])
    return canceled ? null : filePaths[0]
  })

  ipcMain.handle('open-file', async (_e, filters?: { name: string; extensions: string[] }[]) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: filters ?? [{ name: 'All Files', extensions: ['*'] }]
    })
    if (!result.canceled) approvePath(result.filePaths[0])
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('fs:saveFile', async (_e, defaultName: string, content: string) => {
    const isJson = defaultName.toLowerCase().endsWith('.json')
    const filters = isJson
      ? [
          { name: 'JSON', extensions: ['json'] },
          { name: 'Text', extensions: ['txt'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      : [
          { name: 'Text', extensions: ['txt'] },
          { name: 'JSON', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ]
    const result = await dialog.showSaveDialog({
      defaultPath: defaultName,
      filters
    })
    if (result.canceled || !result.filePath) return null
    approvePath(result.filePath)
    await writeFile(result.filePath, content, 'utf-8')
    return result.filePath
  })
}
