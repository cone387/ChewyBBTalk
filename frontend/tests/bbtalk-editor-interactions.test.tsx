import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BBTalkEditor from '../src/components/BBTalkEditor';
import bbtalkReducer from '../src/store/slices/bbtalkSlice';
import tagReducer from '../src/store/slices/tagSlice';
import { imageCacheService } from '../src/services/cache/imageCache';
import type { BBTalk } from '../src/types';

const boundary = vi.hoisted(() => ({
  user: { id: 1 } as { id: number } | null,
  upload: vi.fn(),
  readSubmission: vi.fn(),
}));
vi.mock('../src/services/auth', () => ({
  getCurrentUser: () => boundary.user, getAccessToken: () => 'token', refreshAccessToken: vi.fn(), logout: vi.fn(),
}));
vi.mock('../src/services/mediaApi', () => ({ attachmentApi: { upload: boundary.upload } }));
vi.mock('../src/services/cache/imageCache', () => ({ imageCacheService: { getOrFetch: vi.fn().mockResolvedValue(null) } }));
vi.mock('../src/services/submissions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/services/submissions')>()),
  readSubmission: boundary.readSubmission,
}));

const getOrFetch = vi.mocked(imageCacheService.getOrFetch);
const upload = vi.mocked(boundary.upload);
const existingTags = [
  { id: 't1', name: '工作', color: '', sortOrder: 0, bbtalkCount: 3 },
  { id: 't2', name: 'work', color: '', sortOrder: 1, bbtalkCount: 1 },
  { id: 't3', name: '日记', color: '', sortOrder: 2, bbtalkCount: 0 },
];
function editingRecord(overrides: Partial<BBTalk> = {}): BBTalk {
  return {
    id: 'b1', content: '正文', visibility: 'private',
    tags: [], attachments: [],
    createdAt: '2026-01-01T00:00:00Z', updatedAt: 'v1',
    ...overrides,
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('indexedDB', new IDBFactory());
  // CachedImage waits for intersection before resolving its source; report everything visible.
  vi.stubGlobal('IntersectionObserver', class {
    private readonly callback: IntersectionObserverCallback;
    constructor(callback: IntersectionObserverCallback) { this.callback = callback; }
    observe() { this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
    disconnect() {}
  });
  boundary.user = { id: 1 };
  boundary.readSubmission.mockResolvedValue(undefined);
  getOrFetch.mockResolvedValue(null);
  upload.mockResolvedValue({ uid: 'att', url: '/files/done.txt', type: 'file' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  localStorage.clear();
});
afterEach(async () => {
  cleanup();
  await new Promise(resolve => setTimeout(resolve, 0));
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true });
});

function editor(props: { editing?: BBTalk | null; isPublishing?: boolean; onPublish?: typeof publish; tags?: typeof existingTags } = {}) {
  const publish = props.onPublish ?? vi.fn().mockResolvedValue(undefined);
  const store = configureStore({
    reducer: combineReducers({ bbtalk: bbtalkReducer, tag: tagReducer }),
    preloadedState: { tag: { tags: props.tags ?? existingTags, selectedTagId: null, isLoading: false, error: null } },
  });
  const view = render(
    <Provider store={store}>
      <BBTalkEditor onPublish={publish} editing={props.editing ?? null} isPublishing={props.isPublishing} />
    </Provider>,
  );
  return { ...view, publish };
}
function textarea() { return screen.getByLabelText('记录内容') as HTMLTextAreaElement; }
async function interactive() {
  await waitFor(() => expect((textarea().closest('fieldset') as HTMLFieldSetElement).disabled).toBe(false));
}
async function ready() {
  const view = editor();
  await interactive();
  return view;
}

describe('submission recovery banner', () => {
  it('keeps the current input but blocks publishing when the pending submission cannot be read', async () => {
    boundary.readSubmission.mockRejectedValue(new Error('db broken'));
    const view = editor();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('无法读取待确认发布');
    fireEvent.change(textarea(), { target: { value: '写下的内容' } });
    fireEvent.click(screen.getByRole('button', { name: '发布', exact: true }));
    await waitFor(() => expect((screen.getByRole('button', { name: '发布', exact: true }) as HTMLButtonElement).disabled).toBe(false));
    expect(view.publish).not.toHaveBeenCalled();
    view.unmount();
  });
});

describe('busy states', () => {
  it('labels the primary button for an in-flight create', () => {
    const view = editor({ isPublishing: true });
    expect(screen.getByRole('button', { name: '发布中...' })).toBeTruthy();
    expect((screen.getByRole('button', { name: '发布中...' }) as HTMLButtonElement).disabled).toBe(true);
    view.unmount();
  });

  it('labels the primary button for an in-flight update and disables cancel', () => {
    const view = editor({ editing: editingRecord(), isPublishing: true });
    expect(screen.getByRole('button', { name: '更新中...' })).toBeTruthy();
    expect((screen.getByRole('button', { name: '取消' }) as HTMLButtonElement).disabled).toBe(true);
    view.unmount();
  });
});

describe('tag selector navigation', () => {
  it('clamps the highlighted index when the filtered list shrinks', async () => {
    await ready();
    fireEvent.change(textarea(), { target: { value: '开头 #' } });
    const options = await screen.findAllByRole('button', { name: /^(工作|work|日记)/ });
    expect(options).toHaveLength(3);
    fireEvent.keyDown(textarea(), { key: 'ArrowDown' });
    fireEvent.keyDown(textarea(), { key: 'ArrowDown' }); // highlight the last option
    fireEvent.change(textarea(), { target: { value: '开头 #工' } }); // only 工作 remains
    await screen.findByRole('button', { name: /^工作/ });
    fireEvent.keyDown(textarea(), { key: 'Enter' });
    await waitFor(() => expect(textarea().value).toBe('开头 #工作 '));
  });

  it('wraps upwards with the ArrowUp key', async () => {
    await ready();
    fireEvent.change(textarea(), { target: { value: '开头 #' } });
    await screen.findAllByRole('button', { name: /^(工作|work|日记)/ });
    fireEvent.keyDown(textarea(), { key: 'ArrowUp' }); // wraps to the last option
    await waitFor(() => expect(screen.getByRole('button', { name: /^日记/ }).className).toContain('bg-blue-50'));
    fireEvent.keyDown(textarea(), { key: 'Tab' });
    await waitFor(() => expect(textarea().value).toBe('开头 #日记 '));
  });

  it('wraps downwards after passing the last option', async () => {
    await ready();
    fireEvent.change(textarea(), { target: { value: '开头 #' } });
    await screen.findAllByRole('button', { name: /^(工作|work|日记)/ });
    fireEvent.keyDown(textarea(), { key: 'ArrowDown' });
    fireEvent.keyDown(textarea(), { key: 'ArrowDown' });
    fireEvent.keyDown(textarea(), { key: 'ArrowDown' }); // wraps back to the first option
    await waitFor(() => expect(screen.getByRole('button', { name: /^工作/ }).className).toContain('bg-blue-50'));
    fireEvent.keyDown(textarea(), { key: 'Enter' });
    await waitFor(() => expect(textarea().value).toBe('开头 #工作 '));
  });

  it('prompts for a name when no tags exist at all', async () => {
    const view = editor({ tags: [] });
    await interactive();
    fireEvent.change(textarea(), { target: { value: '想法 #' } });
    expect(await screen.findByText('输入标签名称...')).toBeTruthy();
    view.unmount();
  });

  it('does not offer to create a tag that was already parsed', async () => {
    await ready();
    fireEvent.change(textarea(), { target: { value: '#工作 ' } });
    await waitFor(() => expect(screen.getAllByText('#工作').filter(el => el.tagName === 'SPAN')).toHaveLength(1));
    fireEvent.change(textarea(), { target: { value: '#工作 #工作' } });
    await waitFor(() => expect(screen.queryByRole('button', { name: /创建标签/ })).toBeNull());
    expect(screen.getAllByText('#工作').filter(el => el.tagName === 'SPAN')).toHaveLength(1);
  });
});

describe('existing attachment previews', () => {
  it('keeps the raw content when the record has no tags and renders file cards', async () => {
    const view = editor({
      editing: editingRecord({
        content: '没有标签的内容',
        attachments: [
          { uid: 'doc', url: '/media/report.pdf', type: 'file', originalFilename: '年报.pdf' },
          { uid: 'img', url: '/media/photo.PNG?v=2', type: 'file', originalFilename: '照片.PNG' },
        ],
      }),
    });
    await waitFor(() => expect(textarea().value).toBe('没有标签的内容'));
    expect(screen.getByText('年报.pdf')).toBeTruthy();
    // The .png extension is recognised as an image even without the media type.
    await waitFor(() => expect(getOrFetch).toHaveBeenCalledWith('/media/photo.PNG?v=2', expect.anything()));
    expect(screen.queryByText('照片.PNG')).toBeNull();
    view.unmount();
  });

  it('rewrites media protocols according to VITE_MEDIA_URL_PROTOCOL', async () => {
    vi.stubEnv('VITE_MEDIA_URL_PROTOCOL', 'https');
    const view = editor({
      editing: editingRecord({
        attachments: [{ uid: 'insecure', url: 'http://cdn.example.com/photo.jpg', type: 'image' }],
      }),
    });
    await waitFor(() => expect(getOrFetch).toHaveBeenCalledWith('https://cdn.example.com/photo.jpg', expect.anything()));
    view.unmount();

    vi.stubEnv('VITE_MEDIA_URL_PROTOCOL', 'http');
    const second = editor({
      editing: editingRecord({
        attachments: [{ uid: 'secure', url: 'https://cdn.example.com/photo.jpg', type: 'image' }],
      }),
    });
    await waitFor(() => expect(getOrFetch).toHaveBeenCalledWith('http://cdn.example.com/photo.jpg', expect.anything()));
    second.unmount();
  });
});

describe('drag and drop affordances', () => {
  function dataTransfer(files: File[]) {
    return { types: files.length ? ['Files'] : [], files };
  }

  it('highlights the drop zone and clears it once the pointer leaves', async () => {
    const view = await ready();
    const zone = view.container.querySelector('.bbtalk-composer') as HTMLElement;
    const image = [new File(['x'], 'a.png', { type: 'image/png' })];
    fireEvent.dragOver(zone, { dataTransfer: dataTransfer(image) });
    fireEvent.dragEnter(zone, { dataTransfer: dataTransfer(image) });
    expect(screen.getByText('释放以上传文件')).toBeTruthy();
    fireEvent.dragLeave(zone, { dataTransfer: dataTransfer([]) });
    await waitFor(() => expect(screen.queryByText('释放以上传文件')).toBeNull());
    view.unmount();
  });

  it('clears the overlay when a nested element finishes dragging', async () => {
    const view = await ready();
    const zone = view.container.querySelector('.bbtalk-composer') as HTMLElement;
    const image = [new File(['x'], 'a.png', { type: 'image/png' })];
    fireEvent.dragEnter(zone, { dataTransfer: dataTransfer(image) });
    fireEvent.dragEnter(zone, { dataTransfer: dataTransfer(image) }); // nested element
    fireEvent.dragLeave(zone, { dataTransfer: dataTransfer([]) });
    expect(screen.getByText('释放以上传文件')).toBeTruthy(); // still inside the zone
    fireEvent.dragLeave(zone, { dataTransfer: dataTransfer([]) });
    await waitFor(() => expect(screen.queryByText('释放以上传文件')).toBeNull());
    view.unmount();
  });
});

describe('geolocation retries', () => {
  function fakeGeolocation(handler: (position: { coords: { latitude: number; longitude: number } }, error: (e: { code: number; message: string }) => void) => void) {
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: handler }, configurable: true,
    });
  }

  it('explains unavailable positions and timeouts, then recovers on retry', async () => {
    let failWith: (e: { code: number; message: string }) => void = () => {};
    fakeGeolocation((_position, error) => { failWith = error; });
    const view = editor();
    await interactive();
    failWith({ code: 1, message: 'denied' }); // the automatic lookup failed
    await waitFor(() => expect(screen.getByTitle('定位失败，点击重试')).toBeTruthy());

    fireEvent.click(screen.getByTitle('定位失败，点击重试'));
    failWith({ code: 1, message: 'denied' });
    expect(await screen.findByText('定位权限被拒绝，请在浏览器设置中允许定位')).toBeTruthy();

    fireEvent.click(screen.getByTitle('定位失败，点击重试'));
    failWith({ code: 2, message: 'unavailable' });
    expect(await screen.findByText('位置信息不可用，请检查设备定位服务或网络连接')).toBeTruthy();

    fireEvent.click(screen.getByTitle('定位失败，点击重试'));
    failWith({ code: 3, message: 'timeout' });
    expect(await screen.findByText('定位超时，请稍后再试')).toBeTruthy();
    await waitFor(() => expect(screen.getByTitle('定位失败，点击重试')).toBeTruthy());
    view.unmount();
  });

  it('clears the failure marker after a successful retry', async () => {
    let succeed!: (position: { coords: { latitude: number; longitude: number } }) => void;
    let fail!: (e: { code: number; message: string }) => void;
    fakeGeolocation((position, error) => { succeed = position; fail = error; });
    const view = editor();
    await interactive();
    fail({ code: 1, message: 'denied' });
    await waitFor(() => expect(screen.getByTitle('定位失败，点击重试')).toBeTruthy());

    fireEvent.click(screen.getByTitle('定位失败，点击重试'));
    succeed({ coords: { latitude: 31, longitude: 121 } });
    expect(await screen.findByText('定位成功')).toBeTruthy();
    await waitFor(() => expect(screen.getByTitle('清除位置')).toBeTruthy());
    view.unmount();
  });

  it('keeps the composer usable while the failure marker resets itself', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let fail!: (e: { code: number; message: string }) => void;
    fakeGeolocation((_position, error) => { fail = error; });
    const view = editor();
    await interactive();
    fail({ code: 1, message: 'denied' });
    await waitFor(() => expect(screen.getByTitle('定位失败，点击重试')).toBeTruthy());
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    await waitFor(() => expect(screen.getByTitle('添加位置')).toBeTruthy());
    view.unmount();
    vi.useRealTimers();
  });
});

describe('editing focus behaviour', () => {
  it('does not autofocus the textarea on narrow viewports', async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: 480, configurable: true });
    const view = editor({ editing: editingRecord({ tags: [{ id: 't1', name: '工作', color: '' }] }) });
    await waitFor(() => expect(textarea().value).toBe('#工作 正文'));
    expect(document.activeElement).not.toBe(textarea());
    Object.defineProperty(window, 'innerWidth', { value: originalWidth, configurable: true });
    view.unmount();
  });
});
