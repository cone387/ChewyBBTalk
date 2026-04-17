/**
 * ShareService 单元测试
 * Feature: mobile-v1.1-enhancements, Task 1.4
 *
 * 测试覆盖：
 * - 系统分享面板调用（mock expo-sharing）
 * - 分享失败降级为剪贴板复制
 * - Web 平台使用 Web Share API
 * - 图片下载失败降级为纯文本分享
 * - isSharing 状态管理（防重复触发）
 *
 * **Validates: Requirements 1.1, 1.3, 1.6, 1.7, 1.8**
 */

import { Alert, Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

// --- Mocks ---

jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
  Platform: { OS: 'ios' },
  Share: {
    share: jest.fn(),
    dismissedAction: 'dismissedAction',
    sharedAction: 'sharedAction',
  },
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: '/tmp/cache/',
  downloadAsync: jest.fn(),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

jest.mock('../../src/utils/errorHandler', () => ({
  logError: jest.fn(),
}));

import {
  buildShareText,
  downloadImages,
  copyToClipboard,
  shareBBTalk,
} from '../../src/services/shareService';
import type { BBTalk } from '../../src/types';

// --- Helpers ---

function makeBBTalk(overrides: Partial<BBTalk> = {}): BBTalk {
  return {
    id: 'test-id-1',
    content: '今天天气真好',
    visibility: 'public',
    tags: [
      { id: 't1', name: '日常', color: '#ff0000' },
      { id: 't2', name: '心情', color: '#00ff00' },
    ],
    attachments: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeBBTalkWithImages(): BBTalk {
  return makeBBTalk({
    attachments: [
      { uid: 'img1', url: 'https://example.com/photo1.jpg', type: 'image', filename: 'photo1.jpg' },
      { uid: 'img2', url: 'https://example.com/photo2.png', type: 'image', filename: 'photo2.png' },
    ],
  });
}

function makeBBTalkWithMixedAttachments(): BBTalk {
  return makeBBTalk({
    attachments: [
      { uid: 'img1', url: 'https://example.com/photo1.jpg', type: 'image', filename: 'photo1.jpg' },
      { uid: 'aud1', url: 'https://example.com/voice.m4a', type: 'audio', filename: 'voice.m4a' },
      { uid: 'vid1', url: 'https://example.com/video.mp4', type: 'video', filename: 'video.mp4' },
    ],
  });
}

// --- Tests ---

beforeEach(() => {
  jest.clearAllMocks();
  // Reset Platform to iOS by default
  (Platform as any).OS = 'ios';
});

describe('ShareService Unit Tests', () => {
  // =========================================================================
  // 1. 系统分享面板调用（mock expo-sharing）— 需求 1.1, 1.3
  // =========================================================================
  describe('系统分享面板调用 (expo-sharing)', () => {
    it('有图片附件时，下载图片并通过 expo-sharing 分享', async () => {
      const item = makeBBTalkWithImages();

      // Mock image download success
      (FileSystem.downloadAsync as jest.Mock).mockResolvedValue({
        status: 200,
        uri: '/tmp/cache/share_photo1.jpg',
      });

      // Mock sharing available
      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
      (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);

      await shareBBTalk(item);

      // Should have downloaded images
      expect(FileSystem.downloadAsync).toHaveBeenCalled();

      // Should have called expo-sharing with the local image URI
      expect(Sharing.isAvailableAsync).toHaveBeenCalled();
      expect(Sharing.shareAsync).toHaveBeenCalledWith(
        '/tmp/cache/share_photo1.jpg',
        expect.objectContaining({
          dialogTitle: expect.any(String),
          mimeType: 'image/*',
        }),
      );
    });

    it('无图片附件时，使用 RN Share 分享纯文本', async () => {
      const item = makeBBTalk({ attachments: [] });

      (Share.share as jest.Mock).mockResolvedValue({
        action: 'sharedAction',
      });

      await shareBBTalk(item);

      // Should NOT call expo-sharing
      expect(Sharing.shareAsync).not.toHaveBeenCalled();

      // Should call RN Share with text
      expect(Share.share).toHaveBeenCalledWith({
        message: buildShareText(item),
      });
    });

    it('expo-sharing 不可用时，降级为 RN Share 纯文本', async () => {
      const item = makeBBTalkWithImages();

      (FileSystem.downloadAsync as jest.Mock).mockResolvedValue({
        status: 200,
        uri: '/tmp/cache/share_photo1.jpg',
      });

      // Sharing not available
      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);

      (Share.share as jest.Mock).mockResolvedValue({
        action: 'sharedAction',
      });

      await shareBBTalk(item);

      // Should fall back to RN Share
      expect(Share.share).toHaveBeenCalledWith({
        message: buildShareText(item),
      });
    });
  });

  // =========================================================================
  // 2. 分享失败降级为剪贴板复制 — 需求 1.6
  // =========================================================================
  describe('分享失败降级为剪贴板复制', () => {
    it('expo-sharing 抛出异常时，降级为 RN Share', async () => {
      const item = makeBBTalkWithImages();

      (FileSystem.downloadAsync as jest.Mock).mockResolvedValue({
        status: 200,
        uri: '/tmp/cache/share_photo1.jpg',
      });

      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
      (Sharing.shareAsync as jest.Mock).mockRejectedValue(new Error('sharing failed'));

      // RN Share also works
      (Share.share as jest.Mock).mockResolvedValue({ action: 'sharedAction' });

      await shareBBTalk(item);

      // Should fall back to RN Share
      expect(Share.share).toHaveBeenCalled();
    });

    it('RN Share 抛出异常时，最终降级为剪贴板复制', async () => {
      const item = makeBBTalk({ attachments: [] });

      (Share.share as jest.Mock).mockRejectedValue(new Error('share failed'));

      await shareBBTalk(item);

      // Should copy to clipboard as final fallback
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith(buildShareText(item));
      expect(Alert.alert).toHaveBeenCalledWith('已复制', '内容已复制到剪贴板');
    });

    it('用户取消 RN Share 时，提供复制到剪贴板选项', async () => {
      const item = makeBBTalk({ attachments: [] });

      (Share.share as jest.Mock).mockResolvedValue({
        action: 'dismissedAction',
      });

      await shareBBTalk(item);

      // Should show alert with copy option
      expect(Alert.alert).toHaveBeenCalledWith(
        '分享',
        '已取消分享，是否复制到剪贴板？',
        expect.arrayContaining([
          expect.objectContaining({ text: '取消' }),
          expect.objectContaining({ text: '复制' }),
        ]),
      );
    });
  });

  // =========================================================================
  // 3. Web 平台使用 Web Share API — 需求 1.8
  // =========================================================================
  describe('Web 平台使用 Web Share API', () => {
    beforeEach(() => {
      (Platform as any).OS = 'web';
    });

    it('Web Share API 可用时，调用 navigator.share', async () => {
      const item = makeBBTalk();
      const mockShare = jest.fn().mockResolvedValue(undefined);
      (global as any).navigator = { share: mockShare };

      await shareBBTalk(item);

      expect(mockShare).toHaveBeenCalledWith({ text: buildShareText(item) });
      // Should NOT call clipboard
      expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
    });

    it('Web Share API 不可用时，直接复制到剪贴板', async () => {
      const item = makeBBTalk();
      // navigator.share is undefined
      (global as any).navigator = {};

      await shareBBTalk(item);

      expect(Clipboard.setStringAsync).toHaveBeenCalledWith(buildShareText(item));
      expect(Alert.alert).toHaveBeenCalledWith('已复制', '内容已复制到剪贴板');
    });

    it('Web Share API 调用失败时，降级为剪贴板复制', async () => {
      const item = makeBBTalk();
      const mockShare = jest.fn().mockRejectedValue(new Error('NotAllowedError'));
      (global as any).navigator = { share: mockShare };

      await shareBBTalk(item);

      // Should fall back to clipboard
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith(buildShareText(item));
    });

    it('Web Share API 用户取消（AbortError）时，不复制到剪贴板', async () => {
      const item = makeBBTalk();
      const abortError = new Error('User cancelled');
      abortError.name = 'AbortError';
      const mockShare = jest.fn().mockRejectedValue(abortError);
      (global as any).navigator = { share: mockShare };

      await shareBBTalk(item);

      // AbortError should NOT trigger clipboard fallback
      expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
    });

    afterEach(() => {
      delete (global as any).navigator;
    });
  });

  // =========================================================================
  // 4. 图片下载失败降级为纯文本分享 — 需求 1.3, 1.6
  // =========================================================================
  describe('图片下载失败降级为纯文本分享', () => {
    it('所有图片下载失败时，降级为 RN Share 纯文本', async () => {
      const item = makeBBTalkWithImages();

      // All downloads fail
      (FileSystem.downloadAsync as jest.Mock).mockRejectedValue(new Error('download failed'));

      (Share.share as jest.Mock).mockResolvedValue({ action: 'sharedAction' });

      await shareBBTalk(item);

      // Should NOT call expo-sharing (no local images)
      expect(Sharing.shareAsync).not.toHaveBeenCalled();

      // Should fall back to RN Share with text only
      expect(Share.share).toHaveBeenCalledWith({
        message: buildShareText(item),
      });
    });

    it('部分图片下载失败时，仍使用成功下载的图片分享', async () => {
      const item = makeBBTalkWithImages();

      // First download succeeds, second fails
      (FileSystem.downloadAsync as jest.Mock)
        .mockResolvedValueOnce({ status: 200, uri: '/tmp/cache/share_photo1.jpg' })
        .mockRejectedValueOnce(new Error('download failed'));

      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
      (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);

      await shareBBTalk(item);

      // Should use the successfully downloaded image
      expect(Sharing.shareAsync).toHaveBeenCalledWith(
        '/tmp/cache/share_photo1.jpg',
        expect.any(Object),
      );
    });

    it('图片下载返回非 200 状态时，跳过该图片', async () => {
      const urls = ['https://example.com/photo1.jpg'];

      (FileSystem.downloadAsync as jest.Mock).mockResolvedValue({
        status: 404,
        uri: '/tmp/cache/share_photo1.jpg',
      });

      const result = await downloadImages(urls);

      expect(result).toEqual([]);
    });

    it('混合附件中仅图片参与分享，非图片附件被忽略', async () => {
      const item = makeBBTalkWithMixedAttachments();

      (FileSystem.downloadAsync as jest.Mock).mockResolvedValue({
        status: 200,
        uri: '/tmp/cache/share_photo1.jpg',
      });

      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
      (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);

      await shareBBTalk(item);

      // Should only download image attachments (1 image, not audio/video)
      expect(FileSystem.downloadAsync).toHaveBeenCalledTimes(1);
      expect(FileSystem.downloadAsync).toHaveBeenCalledWith(
        'https://example.com/photo1.jpg',
        expect.stringContaining('share_'),
      );
    });
  });

  // =========================================================================
  // 5. isSharing 状态管理（防重复触发）— 需求 1.7
  // =========================================================================
  describe('isSharing 状态管理（防重复触发）', () => {
    it('并发调用 shareBBTalk 时，第二次调用仍能正常执行（shareBBTalk 本身无锁）', async () => {
      // Note: isSharing guard is in useBBTalkActions, not in shareBBTalk itself.
      // shareBBTalk is a stateless function. The guard is at the hook level.
      // We test that shareBBTalk can be called and completes normally.
      const item = makeBBTalk({ attachments: [] });

      (Share.share as jest.Mock).mockResolvedValue({ action: 'sharedAction' });

      // Both calls should complete
      await Promise.all([shareBBTalk(item), shareBBTalk(item)]);

      expect(Share.share).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // 6. copyToClipboard 单元测试
  // =========================================================================
  describe('copyToClipboard', () => {
    it('复制文本到剪贴板并显示提示', async () => {
      await copyToClipboard('测试文本');

      expect(Clipboard.setStringAsync).toHaveBeenCalledWith('测试文本');
      expect(Alert.alert).toHaveBeenCalledWith('已复制', '内容已复制到剪贴板');
    });
  });

  // =========================================================================
  // 7. downloadImages 单元测试
  // =========================================================================
  describe('downloadImages', () => {
    it('成功下载多张图片，返回本地 URI 列表', async () => {
      (FileSystem.downloadAsync as jest.Mock)
        .mockResolvedValueOnce({ status: 200, uri: '/tmp/cache/share_a.jpg' })
        .mockResolvedValueOnce({ status: 200, uri: '/tmp/cache/share_b.png' });

      const result = await downloadImages([
        'https://example.com/a.jpg',
        'https://example.com/b.png',
      ]);

      expect(result).toEqual(['/tmp/cache/share_a.jpg', '/tmp/cache/share_b.png']);
    });

    it('空 URL 列表返回空数组', async () => {
      const result = await downloadImages([]);
      expect(result).toEqual([]);
      expect(FileSystem.downloadAsync).not.toHaveBeenCalled();
    });

    it('下载失败的图片被跳过，不影响其他图片', async () => {
      (FileSystem.downloadAsync as jest.Mock)
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValueOnce({ status: 200, uri: '/tmp/cache/share_b.png' });

      const result = await downloadImages([
        'https://example.com/a.jpg',
        'https://example.com/b.png',
      ]);

      expect(result).toEqual(['/tmp/cache/share_b.png']);
    });
  });

  // =========================================================================
  // 8. buildShareText 边界情况单元测试
  // =========================================================================
  describe('buildShareText 边界情况', () => {
    it('空内容 + 空标签返回空字符串', () => {
      const item = makeBBTalk({ content: '', tags: [] });
      expect(buildShareText(item)).toBe('');
    });

    it('有内容 + 有标签时，格式为 content + 换行 + #tag1 #tag2', () => {
      const item = makeBBTalk({
        content: '你好世界',
        tags: [
          { id: '1', name: '测试', color: '#000' },
          { id: '2', name: '标签', color: '#fff' },
        ],
      });
      expect(buildShareText(item)).toBe('你好世界\n\n#测试 #标签');
    });

    it('空内容 + 有标签时，以换行开头', () => {
      const item = makeBBTalk({
        content: '',
        tags: [{ id: '1', name: 'hello', color: '#000' }],
      });
      expect(buildShareText(item)).toBe('\n\n#hello');
    });
  });
});
