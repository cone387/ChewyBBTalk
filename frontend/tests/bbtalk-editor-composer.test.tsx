import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BBTalkEditor from '../src/components/BBTalkEditor';
import bbtalkReducer from '../src/store/slices/bbtalkSlice';
import tagReducer from '../src/store/slices/tagSlice';
import { attachmentApi } from '../src/services/mediaApi';
import type { BBTalk } from '../src/types';

const boundary = vi.hoisted(() => ({
  user: { id: 1 } as { id: number } | null,
  upload: vi.fn(),
}));
vi.mock('../src/services/auth', () => ({
  getCurrentUser: () => boundary.user, getAccessToken: () => 'token', refreshAccessToken: vi.fn(), logout: vi.fn(),
}));
vi.mock('../src/services/mediaApi', () => ({ attachmentApi: { upload: boundary.upload } }));
vi.mock('../src/services/cache/imageCache', () => ({ imageCacheService: { getOrFetch: vi.fn().mockResolvedValue(null) } }));

const upload = vi.mocked(attachmentApi.upload);
const existingTags = [
  { id: 't1', name: '工作', color: '', sortOrder: 0, bbtalkCount: 3 },
  { id: 't2', name: 'work', color: '', sortOrder: 1, bbtalkCount: 1 },
  { id: 't3', name: '日记', color: '', sortOrder: 2, bbtalkCount: 0 },
];
function editingRecord(overrides: Partial<BBTalk> = {}): BBTalk {
  return {
    id: 'b1', content: '正文', visibility: 'public',
    tags: [{ id: 't1', name: '工作', color: '' }],
    attachments: [{ uid: 'a1', url: '/media/p.png', type: 'image', originalFilename: 'p.png' }],
    createdAt: '2026-01-01T00:00:00Z', updatedAt: 'v1',
    ...overrides,
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
  boundary.user = { id: 1 };
  upload.mockResolvedValue({ uid: 'att', url: '/files/done.txt', type: 'file' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  localStorage.clear();
});
afterEach(async () => {
  cleanup();
  await new Promise(resolve => setTimeout(resolve, 0));
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true });
});
function editor(props: { onPublish?: typeof publish; editing?: BBTalk | null; onCancelEdit?: () => void } = {}) {
  const publish = props.onPublish ?? vi.fn().mockResolvedValue(undefined);
  const store = configureStore({
    reducer: combineReducers({ bbtalk: bbtalkReducer, tag: tagReducer }),
    preloadedState: { tag: { tags: existingTags, selectedTagId: null, isLoading: false, error: null } },
  });
  const view = render(
    <Provider store={store}>
      <BBTalkEditor onPublish={publish} editing={props.editing ?? null} onCancelEdit={props.onCancelEdit} />
    </Provider>,
  );
  return { ...view, publish };
}
async function input(text: string) {
  await waitFor(() => expect((screen.getByLabelText('记录内容').closest('fieldset') as HTMLFieldSetElement).disabled).toBe(false));
  fireEvent.change(screen.getByLabelText('记录内容'), { target: { value: text } });
}
function textarea() { return screen.getByLabelText('记录内容') as HTMLTextAreaElement; }
async function interactive() {
  await waitFor(() => expect((textarea().closest('fieldset') as HTMLFieldSetElement).disabled).toBe(false));
}
function submit() { fireEvent.click(screen.getByRole('button', { name: '发布', exact: true })); }
async function ready() {
  const view = editor();
  await input('随便写点');
  return view;
}

describe('editing mode', () => {
  it('restores tags inline and existing attachments, then saves with the base version', async () => {
    const editing = {
      ...editingRecord(),
      attachments: [
        { uid: 'a1', url: '/media/p.png', type: 'image', originalFilename: 'p.png' },
        { uid: '', url: '/media/broken.png', type: 'image', originalFilename: 'broken.png' },
      ],
    };
    const view = editor({ editing });
    await waitFor(() => expect(textarea().value).toBe('#工作 正文'));
    expect(screen.getByRole('button', { name: '移除附件 p.png' })).toBeTruthy();
    await interactive();
    fireEvent.click(screen.getByRole('button', { name: '保存', exact: true }));
    await waitFor(() => expect(view.publish).toHaveBeenCalledTimes(1));
    expect(view.publish).toHaveBeenCalledWith(expect.objectContaining({
      content: '正文', tags: ['工作'], visibility: 'public',
      attachments: [{ uid: 'a1', url: '/media/p.png', type: 'image', originalFilename: 'p.png' }],
      expectedUpdatedAt: 'v1', submissionKey: undefined,
    }));
    // Editing keeps the form content after a successful save.
    expect(textarea().value).toBe('#工作 正文');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('drops an existing attachment when removed and honors cancel', async () => {
    const onCancelEdit = vi.fn();
    const view = editor({ editing: editingRecord(), onCancelEdit });
    await screen.findByRole('button', { name: '移除附件 p.png' });
    await interactive();
    fireEvent.click(screen.getByRole('button', { name: '移除附件 p.png' }));
    expect(screen.queryByRole('button', { name: '移除附件 p.png' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    await waitFor(() => expect(onCancelEdit).toHaveBeenCalledOnce());
    expect(view.publish).not.toHaveBeenCalled();
  });

  it('surfaces an edit conflict, then keeps editing against the server version', async () => {
    const conflict = Object.assign(new Error('冲突'), {
      code: 'edit_conflict',
      current: {
        uid: 'b1', content: '服务器上的版本', visibility: 'friends',
        tags: [{ uid: 't9', name: '远程', color: '', sort_order: 0, bbtalk_count: 1 }],
        attachments: [{ uid: 'x1', url: '/f.bin', type: 'file', filename: 'f.zip' }],
        create_time: '', update_time: 'v2',
      },
    });
    const publish = vi.fn()
      .mockRejectedValueOnce(conflict)
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce(undefined);
    const view = editor({ editing: editingRecord(), onPublish: publish });
    await waitFor(() => expect(textarea().value).toBe('#工作 正文'));
    await interactive();
    fireEvent.click(screen.getByRole('button', { name: '保存', exact: true }));
    const dialog = await screen.findByRole('dialog', { name: '记录已有新版本' });
    expect(within(dialog).getByText('服务器上的版本')).toBeTruthy();
    expect(within(dialog).getByText('标签：远程')).toBeTruthy();
    expect(within(dialog).getByText('可见性：好友')).toBeTruthy();
    expect(within(dialog).getByText('附件：f.zip')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '暂不处理' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '保存', exact: true }));
    await screen.findByRole('dialog', { name: '记录已有新版本' });
    fireEvent.click(screen.getByRole('button', { name: '保留我的修改，继续编辑' }));
    expect(await screen.findByText('已核对最新版本。你的修改仍保留，可继续编辑后再次保存。')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '保存', exact: true }));
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(3));
    expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({ expectedUpdatedAt: 'v2' }));
    view.unmount();
  });

  it('reports a plain update failure and keeps the input', async () => {
    const view = editor({ editing: editingRecord(), onPublish: vi.fn().mockRejectedValue(new Error('保存被拒绝')) });
    await waitFor(() => expect(textarea().value).toBe('#工作 正文'));
    await interactive();
    fireEvent.click(screen.getByRole('button', { name: '保存', exact: true }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('保存被拒绝');
    expect(textarea().value).toBe('#工作 正文');
    view.unmount();
  });

  it('renders without a draft scope and refuses to publish for anonymous visitors', async () => {
    boundary.user = null;
    const view = editor();
    await input('匿名输入的内容');
    fireEvent.click(screen.getByRole('button', { name: '发布', exact: true }));
    expect(view.publish).not.toHaveBeenCalled();
    view.unmount();
  });
});

describe('tag authoring', () => {
  it('opens the selector on #, filters, navigates with arrows and commits with Enter', async () => {
    await ready();
    fireEvent.change(textarea(), { target: { value: '开头 #' } });
    const options = await screen.findAllByRole('button', { name: /^(工作|work|日记)/ });
    expect(options).toHaveLength(3);
    fireEvent.keyDown(textarea(), { key: 'ArrowDown' });
    fireEvent.change(textarea(), { target: { value: '开头 #wo' } });
    await screen.findByRole('button', { name: /^work/ });
    fireEvent.keyDown(textarea(), { key: 'Enter' });
    await waitFor(() => expect(textarea().value).toBe('开头 #work '));
    expect(screen.getByText('#work')).toBeTruthy();
  });

  it('inserts a hash from the toolbar and closes the selector with Escape or outside click', async () => {
    await ready();
    fireEvent.click(screen.getByTitle('添加标签'));
    await waitFor(() => expect(textarea().value).toBe('随便写点 #'));
    expect(await screen.findAllByRole('button', { name: /^(工作|work|日记)/ })).toHaveLength(3);
    fireEvent.keyDown(textarea(), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('button', { name: /^工作/ })).toBeNull());
    fireEvent.click(screen.getByTitle('添加标签'));
    await screen.findByRole('button', { name: /^工作/ });
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByRole('button', { name: /^工作/ })).toBeNull());
  });

  it('offers to create an unmatched tag and keeps IME composition out of the parsing path', async () => {
    await ready();
    fireEvent.compositionStart(textarea());
    fireEvent.change(textarea(), { target: { value: '想法 #未' } });
    fireEvent.compositionEnd(textarea(), { target: { value: '想法 #未命名' } });
    fireEvent.click(await screen.findByRole('button', { name: '创建标签 "未命名"' }));
    await waitFor(() => expect(textarea().value).toBe('想法 #未命名 '));
    expect(screen.getByText('#未命名')).toBeTruthy();
  });

  it('removes a parsed tag from both the chip list and the content', async () => {
    await ready();
    fireEvent.change(textarea(), { target: { value: '#工作 剩下的内容' } });
    await screen.findByText('#工作');
    fireEvent.click(within(screen.getByText('#工作').closest('span')!).getByRole('button'));
    await waitFor(() => expect(screen.queryByText('#工作')).toBeNull());
    expect(textarea().value).toBe('剩下的内容');
  });

  it('Enter publishes while Shift+Enter only inserts a newline', async () => {
    const view = editor();
    await input('直接回车发布');
    fireEvent.keyDown(textarea(), { key: 'Enter', shiftKey: true });
    expect(view.publish).not.toHaveBeenCalled();
    fireEvent.keyDown(textarea(), { key: 'Enter' });
    await waitFor(() => expect(view.publish).toHaveBeenCalledTimes(1));
  });
});

describe('attachments and uploads', () => {
  function dataTransfer(files: File[]) {
    return { types: files.length ? ['Files'] : [], files };
  }
  async function composerElement() {
    const view = ready();
    await waitFor(() => expect((textarea().closest('fieldset') as HTMLFieldSetElement).disabled).toBe(false));
    return view;
  }

  it('blocks publishing while a dragged-in image is uploading, then includes it in the payload', async () => {
    let finish!: (value: { uid: string; url: string; type: string }) => void;
    upload.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const view = await composerElement();
    const zone = view.container.querySelector('.bbtalk-composer') as HTMLElement;
    fireEvent.dragEnter(zone, { dataTransfer: dataTransfer([]) });
    expect(screen.queryByText('释放以上传文件')).toBeNull();
    fireEvent.dragEnter(zone, { dataTransfer: dataTransfer([new File(['x'], 'a.png', { type: 'image/png' })]) });
    expect(screen.getByText('释放以上传文件')).toBeTruthy();
    fireEvent.dragLeave(zone, { dataTransfer: dataTransfer([]) });
    fireEvent.dragEnter(zone, { dataTransfer: dataTransfer([new File(['x'], 'a.png', { type: 'image/png' })]) });
    fireEvent.drop(zone, { dataTransfer: dataTransfer([new File(['x'], 'a.png', { type: 'image/png' })]) });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(screen.getByText('请完成上传或移除失败文件后再发布。')).toBeTruthy();
    fireEvent.change(textarea(), { target: { value: '带图片的内容' } });
    expect((screen.getByRole('button', { name: '发布', exact: true }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => finish({ uid: 'u1', url: '/media/a.png', type: 'image' }));
    expect(screen.getByRole('button', { name: '移除附件 a.png' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '发布', exact: true }));
    await waitFor(() => expect(view.publish).toHaveBeenCalledTimes(1));
    expect(view.publish.mock.calls[0][0].attachments).toEqual([
      expect.objectContaining({ uid: 'u1', url: '/media/a.png', type: 'image', filename: 'a.png' }),
    ]);
    view.unmount();
  });

  it('shows retry and removal for a failed upload, and blocks empty content', async () => {
    upload.mockRejectedValueOnce(new TypeError('fetch failed'));
    const view = await composerElement();
    const input = screen.getByLabelText('上传图片');
    Object.defineProperty(input, 'files', { value: [new File(['y'], 'b.png', { type: 'image/png' })], configurable: true });
    fireEvent.change(input);
    expect(await screen.findByText('网络连接失败，请检查网络后重试')).toBeTruthy();
    expect((screen.getByRole('button', { name: '发布', exact: true }) as HTMLButtonElement).disabled).toBe(true);
    upload.mockResolvedValueOnce({ uid: 'u2', url: '/media/b.png', type: 'image' });
    fireEvent.click(screen.getByRole('button', { name: '重试上传' }));
    await screen.findByRole('button', { name: '移除附件 b.png' });
    fireEvent.click(screen.getByRole('button', { name: '移除附件 b.png' }));
    await waitFor(() => expect(screen.queryByText('移除附件 b.png')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: '发布', exact: true }));
    expect(view.publish).not.toHaveBeenCalled();
    view.unmount();
  });

  it('uploads pasted images and reports progress', async () => {
    vi.stubGlobal('DataTransfer', class {
      files: File[] = [];
      items = { add: (file: File) => { this.files.push(file); } };
    });
    const view = await composerElement();
    const file = new File(['z'], 'pasted.png', { type: 'image/png' });
    fireEvent.paste(textarea(), { clipboardData: { items: [{ type: 'image/png', getAsFile: () => file }] } });
    expect(await screen.findByText('正在上传 1 张图片...')).toBeTruthy();
    expect(upload).toHaveBeenCalledWith(file, expect.anything());
    view.unmount();
  });
});

describe('geolocation and visibility', () => {
  function fakeGeolocation(handler: (position: { coords: { latitude: number; longitude: number } }, error: (e: { code: number; message: string }) => void) => void) {
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: handler }, configurable: true,
    });
  }

  it('attaches the reported position to the context and can clear it again', async () => {
    fakeGeolocation(position => position({ coords: { latitude: 30, longitude: 120 } }));
    const view = editor();
    await input('有位置的记录');
    fireEvent.click(screen.getByTitle('清除位置'));
    expect(await screen.findByText('已取消定位')).toBeTruthy();
    fireEvent.click(screen.getByTitle('添加位置'));
    expect(await screen.findByText('定位成功')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '发布', exact: true }));
    await waitFor(() => expect(view.publish).toHaveBeenCalledTimes(1));
    expect(view.publish.mock.calls[0][0].context).toEqual(expect.objectContaining({
      location: { latitude: 30, longitude: 120 },
    }));
    view.unmount();
  });

  it('explains geolocation failures and refuses to publish without browser support', async () => {
    fakeGeolocation((_position, error) => error({ code: 1, message: 'denied' }));
    const view = editor();
    await waitFor(() => expect(screen.getByTitle('定位失败，点击重试')).toBeTruthy());
    expect(screen.queryByRole('alert')).toBeNull();
    view.unmount();

    Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true });
    const second = editor();
    await input('不支持定位的浏览器');
    fireEvent.click(screen.getByTitle('添加位置'));
    expect(await screen.findByText('您的浏览器不支持地理定位')).toBeTruthy();
    second.unmount();
  });

  it('toggles visibility between private and public and shows the character count', async () => {
    const view = editor();
    await input('公开的记录');
    expect(screen.getByText('5 字')).toBeTruthy();
    expect(screen.getByTitle('仅自己可见')).toBeTruthy();
    fireEvent.click(screen.getByTitle('仅自己可见'));
    expect(screen.getByTitle('公开可见')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '发布', exact: true }));
    await waitFor(() => expect(view.publish).toHaveBeenCalledTimes(1));
    expect(view.publish.mock.calls[0][0].visibility).toBe('public');
    view.unmount();
  });
});
