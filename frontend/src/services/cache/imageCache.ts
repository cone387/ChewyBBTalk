import { openDB, DBSchema, IDBPDatabase } from 'idb'

// 定义图片缓存数据库Schema
interface ImageCacheDB extends DBSchema {
  images: {
    key: string // 图片URL
    value: {
      url: string
      blob: Blob
      timestamp: number
      size: number
      mimeType: string
    }
    indexes: { 'by-timestamp': number }
  }
}

class ImageCacheService {
  private db: IDBPDatabase<ImageCacheDB> | null = null
  private dbName = 'ImageCacheDB'
  private version = 1
  private readonly MAX_CACHE_SIZE = 100 * 1024 * 1024 // 100MB 最大缓存大小
  private readonly CACHE_EXPIRY = 30 * 24 * 60 * 60 * 1000 // 30天过期时间

  /**
   * 标准化 URL：根据环境变量配置转换协议
   */
  private normalizeUrl(url: string): string {
    const targetProtocol = import.meta.env.VITE_MEDIA_URL_PROTOCOL || 'https'
    if (targetProtocol === 'https' && url.startsWith('http://')) {
      return url.replace('http://', 'https://')
    } else if (targetProtocol === 'http' && url.startsWith('https://')) {
      return url.replace('https://', 'http://')
    }
    return url
  }

  /**
   * 初始化数据库
   */
  async init(): Promise<void> {
    if (this.db) return

    this.db = await openDB<ImageCacheDB>(this.dbName, this.version, {
      upgrade(db) {
        // 创建images存储
        if (!db.objectStoreNames.contains('images')) {
          const imageStore = db.createObjectStore('images', { keyPath: 'url' })
          imageStore.createIndex('by-timestamp', 'timestamp')
        }
      },
    })

    // console.log('[ImageCache] 数据库初始化完成')
  }

  /**
   * 获取缓存的图片
   */
  async get(url: string): Promise<Blob | null> {
    try {
      await this.init()
      if (!this.db) return null

      // 使用标准化后的 URL 作为 key
      const normalizedUrl = this.normalizeUrl(url)
      const cached = await this.db.get('images', normalizedUrl)
      if (!cached) {
        // console.log('[ImageCache] 未找到缓存:', normalizedUrl)
        return null
      }

      // 检查是否过期
      const now = Date.now()
      if (now - cached.timestamp > this.CACHE_EXPIRY) {
        // console.log('[ImageCache] 缓存已过期:', normalizedUrl)
        await this.delete(normalizedUrl)
        return null
      }

      // console.log('[ImageCache] 从缓存加载:', normalizedUrl)
      return cached.blob
    } catch (error) {
      console.error('[ImageCache] 获取缓存失败:', error)
      return null
    }
  }

  /**
   * 保存图片到缓存
   */
  async set(url: string, blob: Blob): Promise<void> {
    try {
      await this.init()
      if (!this.db) return

      const size = blob.size
      const mimeType = blob.type

      // 检查缓存大小
      await this.ensureCacheSize(size)

      // 使用标准化后的 URL 作为 key
      const normalizedUrl = this.normalizeUrl(url)
      await this.db.put('images', {
        url: normalizedUrl,
        blob,
        timestamp: Date.now(),
        size,
        mimeType,
      })

      // console.log('[ImageCache] 图片已缓存:', normalizedUrl, `(${(size / 1024).toFixed(2)}KB)`)
    } catch (error) {
      console.error('[ImageCache] 保存缓存失败:', error)
    }
  }

  /**
   * 删除缓存的图片
   */
  async delete(url: string): Promise<void> {
    try {
      await this.init()
      if (!this.db) return

      await this.db.delete('images', url)
      // console.log('[ImageCache] 删除缓存:', url)
    } catch (error) {
      console.error('[ImageCache] 删除缓存失败:', error)
    }
  }

  /**
   * 获取缓存总大小
   */
  async getCacheSize(): Promise<number> {
    try {
      await this.init()
      if (!this.db) return 0

      const all = await this.db.getAll('images')
      return all.reduce((total, item) => total + item.size, 0)
    } catch (error) {
      console.error('[ImageCache] 获取缓存大小失败:', error)
      return 0
    }
  }

  /**
   * 确保缓存大小不超过限制
   * 如果超过，删除最旧的图片
   */
  async ensureCacheSize(newItemSize: number): Promise<void> {
    try {
      const currentSize = await this.getCacheSize()
      if (currentSize + newItemSize <= this.MAX_CACHE_SIZE) {
        return
      }

      // console.log('[ImageCache] 缓存空间不足，清理旧图片...')

      await this.init()
      if (!this.db) return

      // 按时间戳排序，删除最旧的
      const tx = this.db.transaction('images', 'readwrite')
      const index = tx.store.index('by-timestamp')
      let cursor = await index.openCursor()
      let freedSpace = 0

      while (cursor && freedSpace < newItemSize) {
        freedSpace += cursor.value.size
        await cursor.delete()
        cursor = await cursor.continue()
      }

      await tx.done
      // console.log(`[ImageCache] 清理完成，释放空间: ${(freedSpace / 1024).toFixed(2)}KB`)
    } catch (error) {
      console.error('[ImageCache] 清理缓存失败:', error)
    }
  }

  /**
   * 清除所有缓存
   */
  async clear(): Promise<void> {
    try {
      await this.init()
      if (!this.db) return

      await this.db.clear('images')
      // console.log('[ImageCache] 所有缓存已清除')
    } catch (error) {
      console.error('[ImageCache] 清除缓存失败:', error)
    }
  }

  /**
   * 清除过期缓存
   */
  async clearExpired(): Promise<void> {
    try {
      await this.init()
      if (!this.db) return

      const now = Date.now()
      const all = await this.db.getAll('images')
      const expired = all.filter(item => now - item.timestamp > this.CACHE_EXPIRY)

      for (const item of expired) {
        await this.delete(item.url)
      }

      // console.log(`[ImageCache] 清除过期缓存: ${expired.length}个`)
    } catch (error) {
      console.error('[ImageCache] 清除过期缓存失败:', error)
    }
  }

  /**
   * 获取缓存统计信息
   */
  async getStats(): Promise<{
    count: number
    totalSize: number
    oldestTimestamp: number
    newestTimestamp: number
  }> {
    try {
      await this.init()
      if (!this.db) {
        return { count: 0, totalSize: 0, oldestTimestamp: 0, newestTimestamp: 0 }
      }

      const all = await this.db.getAll('images')
      if (all.length === 0) {
        return { count: 0, totalSize: 0, oldestTimestamp: 0, newestTimestamp: 0 }
      }

      const totalSize = all.reduce((sum, item) => sum + item.size, 0)
      const timestamps = all.map(item => item.timestamp)

      return {
        count: all.length,
        totalSize,
        oldestTimestamp: Math.min(...timestamps),
        newestTimestamp: Math.max(...timestamps),
      }
    } catch (error) {
      console.error('[ImageCache] 获取统计信息失败:', error)
      return { count: 0, totalSize: 0, oldestTimestamp: 0, newestTimestamp: 0 }
    }
  }

  /**
   * 下载图片并缓存
   */
  async fetchAndCache(url: string): Promise<Blob | null> {
    try {
      // 标准化 URL（使用配置的协议）
      const normalizedUrl = this.normalizeUrl(url)
      // console.log('[ImageCache] 下载图片:', normalizedUrl)
      
      // 配置请求选项以处理跨域资源
      const response = await fetch(normalizedUrl, {
        mode: 'cors',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'default'
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const blob = await response.blob()
      
      // 只缓存图片类型
      if (blob.type.startsWith('image/')) {
        await this.set(normalizedUrl, blob)
      }

      return blob
    } catch (error) {
      console.error('[ImageCache] 下载图片失败:', url, error)
      return null
    }
  }

  /**
   * 获取图片（优先从缓存，缓存未命中则下载）
   */
  async getOrFetch(url: string): Promise<Blob | null> {
    // 先尝试从缓存获取
    const cached = await this.get(url)
    if (cached) {
      return cached
    }

    // 缓存未命中，下载并缓存
    return await this.fetchAndCache(url)
  }
}

// 导出单例
export const imageCacheService = new ImageCacheService()

// 自动初始化
imageCacheService.init().catch(console.error)

// 定期清理过期缓存（每小时）
setInterval(() => {
  imageCacheService.clearExpired().catch(console.error)
}, 60 * 60 * 1000)
