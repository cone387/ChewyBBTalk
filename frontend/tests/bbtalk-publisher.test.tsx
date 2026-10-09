import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BBTalkPublisher from '../src/components/BBTalkPublisher';
import type { BBTalk, Tag } from '../src/types';

const api = vi.hoisted(() => ({ createBBTalk: vi.fn() }));
vi.mock('../src/services/api/bbtalkApi', () => ({ bbtalkApi: api }));

const tags: Tag[] = [
  { id: 't1', name: '工作', color: '', sortOrder: 0, bbtalkCount: 1 },
  { id: 't2', name: '生活', color: '', sortOrder: 1, bbtalkCount: 2 },
];

beforeEach(() => {
  vi.resetAllMocks();
  api.createBBTalk.mockImplementation(async (data: any) => ({ ...created, content: data.content }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => cleanup());

const created: BBTalk = {
  id: 'n1', content: '', visibility: 'private', tags: [], attachments: [],
  createdAt: '2026-01-01T00:00:00Z', updatedAt: 'v1',
};

function publisher(onCreate = vi.fn()) {
  const view = render(<BBTalkPublisher tags={tags} onCreate={onCreate} />);
  return { ...view, onCreate };
}
function textarea() { return screen.getByPlaceholderText('分享你的想法...'); }
async function publish() {
  fireEvent.click(screen.getByRole('button', { name: '发布', exact: true }));
  await waitFor(() => expect(screen.getByRole('button', { name: '发布', exact: true })).toBeTruthy());
}

describe('BBTalkPublisher', () => {
  it('publishes private by default with no tags and resets the composer', async () => {
    const view = publisher();
    fireEvent.change(textarea(), { target: { value: '第一条想法' } });
    await publish();
    expect(api.createBBTalk).toHaveBeenCalledWith({
      content: '第一条想法', tags: [], visibility: 'private',
      context: { source: { client: 'Web', version: '1.0' } },
    });
    expect(view.onCreate).toHaveBeenCalledWith(expect.objectContaining({ id: 'n1', content: '第一条想法' }));
    expect(textarea().value).toBe('');
    expect((screen.getByLabelText('仅自己') as HTMLInputElement).checked).toBe(true);
  });

  it('keeps the publish button disabled for blank content', () => {
    publisher();
    expect((screen.getByRole('button', { name: '发布', exact: true }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(textarea(), { target: { value: '   ' } });
    expect((screen.getByRole('button', { name: '发布', exact: true }) as HTMLButtonElement).disabled).toBe(true);
    expect(api.createBBTalk).not.toHaveBeenCalled();
  });

  it('toggles multiple tags and switches visibility to public', async () => {
    publisher();
    fireEvent.change(textarea(), { target: { value: '公开记录' } });
    fireEvent.click(screen.getByRole('button', { name: '工作' }));
    fireEvent.click(screen.getByRole('button', { name: '生活' }));
    fireEvent.click(screen.getByRole('button', { name: '生活' })); // toggling again removes it
    fireEvent.click(screen.getByLabelText('公开'));
    await publish();
    expect(api.createBBTalk).toHaveBeenCalledWith(expect.objectContaining({ tags: ['工作'], visibility: 'public' }));
  });

  it('shows the submitting state and keeps input when the server rejects the record', async () => {
    let finish!: (value: BBTalk) => void;
    api.createBBTalk.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockRejectedValueOnce(new Error('内容过长'));
    const view = publisher();
    fireEvent.change(textarea(), { target: { value: '第一份' } });
    fireEvent.click(screen.getByRole('button', { name: '发布', exact: true }));
    expect(screen.getByRole('button', { name: '发布中...' })).toBeTruthy();
    expect((screen.getByRole('button', { name: '发布中...' }) as HTMLButtonElement).disabled).toBe(true);
    expect(view.onCreate).not.toHaveBeenCalled();
    await finish(created);
    await waitFor(() => expect(view.onCreate).toHaveBeenCalledTimes(1)); // slow request still lands

    fireEvent.change(textarea(), { target: { value: '第二份' } });
    fireEvent.click(screen.getByRole('button', { name: '发布', exact: true }));
    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith('发布失败:', expect.any(Error));
      expect(textarea().value).toBe('第二份');
    });
    expect(view.onCreate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '发布', exact: true })).toBeTruthy();
  });
});
