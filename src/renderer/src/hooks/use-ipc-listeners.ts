import { useEffect } from 'react'
import { useAppStore, type QueueStatus, type FileStatus, type LogEntry } from '@/stores/app-store'

export function useIpcListeners() {
  const setScanProgress = useAppStore((s) => s.setScanProgress)
  const setIsScanning = useAppStore((s) => s.setIsScanning)
  const setQueueStatus = useAppStore((s) => s.setQueueStatus)
  const setQueueProgress = useAppStore((s) => s.setQueueProgress)
  const setLastError = useAppStore((s) => s.setLastError)
  const setCooldownSeconds = useAppStore((s) => s.setCooldownSeconds)
  const updateFileStatus = useAppStore((s) => s.updateFileStatus)
  const appendLiveFeed = useAppStore((s) => s.appendLiveFeed)
  const setLiveFeedForWorkspace = useAppStore((s) => s.setLiveFeedForWorkspace)
  const workspacePath = useAppStore((s) => s.workspacePath)

  // Seed live feed for current workspace when it changes (or on first mount)
  // Also seed system logs (workspacePath=null) so startup entries appear in live feed
  useEffect(() => {
    // Always seed system logs on mount
    const map = useAppStore.getState().liveFeedMap
    if (!map['__system__'] || map['__system__'].length === 0) {
      window.api.getSessionLogs(undefined).then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          const systemLogs = (data as LogEntry[]).filter((e) => !e.workspacePath)
          if (systemLogs.length > 0) {
            setLiveFeedForWorkspace(null, systemLogs)
          }
        }
      })
    }
  }, [setLiveFeedForWorkspace])

  useEffect(() => {
    if (!workspacePath) return
    const map = useAppStore.getState().liveFeedMap
    const key = workspacePath
    if (!map[key] || map[key].length === 0) {
      window.api.getSessionLogs(workspacePath).then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setLiveFeedForWorkspace(workspacePath, data as LogEntry[])
        }
      })
    }
  }, [workspacePath, setLiveFeedForWorkspace])

  useEffect(() => {
    const cleanups: (() => void)[] = []

    cleanups.push(
      window.api.onScanProgress((data) => {
        setScanProgress({
          totalFiles: data.totalFiles,
          scannedFiles: data.scannedFiles,
          currentFile: data.currentFile
        })
      })
    )

    cleanups.push(
      window.api.onScanComplete(() => {
        setIsScanning(false)
      })
    )

    cleanups.push(
      window.api.onQueueStatus((status) => {
        setQueueStatus(status as QueueStatus)
        // Clear error when queue starts running again
        if (status === 'running') setLastError(null)
      })
    )

    cleanups.push(
      window.api.onQueueProgress((stats: any) => {
        setQueueProgress({
          totalItems: stats.totalItems,
          completedItems: stats.completedItems,
          errorItems: stats.errorItems
        })
      })
    )

    cleanups.push(
      window.api.onQueueError((error) => {
        console.error('Queue error:', error)
        setLastError(error)
      })
    )

    cleanups.push(
      window.api.onQueueCooldown((seconds) => {
        setCooldownSeconds(seconds)
      })
    )

    cleanups.push(
      window.api.onFileStatusChanged((data) => {
        updateFileStatus(data.fileId, data.status as FileStatus)
      })
    )

    cleanups.push(
      window.api.onLogEntry((entry) => {
        appendLiveFeed(entry as LogEntry)
      })
    )

    return () => {
      cleanups.forEach((fn) => fn())
    }
  }, [
    setScanProgress,
    setIsScanning,
    setQueueStatus,
    setQueueProgress,
    setLastError,
    setCooldownSeconds,
    updateFileStatus,
    appendLiveFeed
  ])
}
