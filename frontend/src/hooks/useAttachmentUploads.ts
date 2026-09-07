import { useCallback, useEffect, useRef, useState } from 'react'
import { attachmentApi } from '../services/mediaApi'
import type { Attachment } from '../types'

interface UploadItem {
  id: string
  file: File
  mediaType: string
  status: 'uploading' | 'failed' | 'ready'
  attachment?: Attachment
  error?: string
}

export function useAttachmentUploads() {
  const [items, setItems] = useState<UploadItem[]>([])
  const active = useRef(new Map<string, AbortController>())
  const nextId = useRef(0)

  const upload = useCallback(async (item: UploadItem) => {
    if (active.current.has(item.id)) return
    const controller = new AbortController()
    active.current.set(item.id, controller)
    setItems(previous => previous.map(value => value.id === item.id ? { ...value, status: 'uploading', error: undefined } : value))
    try {
      const attachment = await attachmentApi.upload(item.file, { media_type: item.mediaType, signal: controller.signal })
      if (!controller.signal.aborted) {
        setItems(previous => previous.map(value => value.id === item.id ? { ...value, status: 'ready', attachment } : value))
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setItems(previous => previous.map(value => value.id === item.id ? {
          ...value, status: 'failed', error: error instanceof TypeError ? '网络连接失败，请检查网络后重试' : error instanceof Error ? error.message : '上传失败，请重试',
        } : value))
      }
    } finally {
      if (active.current.get(item.id) === controller) active.current.delete(item.id)
    }
  }, [])

  const add = useCallback((files: File[], mediaType: string) => {
    const added: UploadItem[] = files.map(file => ({ id: `upload-${++nextId.current}`, file, mediaType, status: 'uploading' }))
    setItems(previous => [...previous, ...added])
    added.forEach(item => { void upload(item) })
  }, [upload])

  const remove = useCallback((id: string) => {
    active.current.get(id)?.abort()
    active.current.delete(id)
    setItems(previous => previous.filter(item => item.id !== id))
  }, [])

  const reset = useCallback(() => {
    active.current.forEach(controller => controller.abort())
    active.current.clear()
    setItems([])
  }, [])

  useEffect(() => {
    const controllers = active.current
    return () => { controllers.forEach(controller => controller.abort()); controllers.clear() }
  }, [])

  return { items, add, remove, reset, retry: (id: string) => {
    const item = items.find(value => value.id === id && value.status === 'failed')
    if (item) void upload(item)
  } }
}
