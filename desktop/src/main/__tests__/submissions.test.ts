import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
  session: { scope: 'server-a/user-1', generation: 1, apiUrl: 'https://a.test' },
  failWrite: false,
}));
vi.mock('../store', () => ({ store: {
  get: (key: string) => state.data[key],
  set: (key: string, value: unknown) => { if (state.failWrite) throw new Error('disk full'); state.data[key] = structuredClone(value); },
} }));
vi.mock('../auth', () => ({
  getSubmissionSession: () => state.session,
  getValidAccessToken: async () => 'test-token',
  tryRestoreSession: async () => true,
}));
const payload = { content: 'original', post_tags: 'tag', attachments: [{ uid: 'file' }], visibility: 'private' as const, context: {} };
beforeEach(() => {
  vi.resetModules();
  state.data = {}; state.failWrite = false;
  state.session = { scope: 'server-a/user-1', generation: 1, apiUrl: 'https://a.test' };
});
afterEach(() => vi.unstubAllGlobals());

it('persists before POST, survives restart, and retries the same key and attachment payload', async () => {
  const fetchMock = vi.fn().mockRejectedValueOnce(new Error('response lost'))
    .mockResolvedValueOnce(new Response(JSON.stringify({ uid: 'original-record' })));
  vi.stubGlobal('fetch', fetchMock);
  let api = await import('../submissions');
  await expect(api.publishSubmission(state.session, payload)).rejects.toThrow('response lost');
  const snapshot = await api.submissionSnapshot();
  expect(snapshot?.intent?.state).toBe('pending');
  vi.resetModules();
  api = await import('../submissions');
  expect(await api.submissionSnapshot()).toEqual(snapshot);
  await expect(api.publishSubmission(state.session, { ...payload, content: 'changed' })).rejects.toThrow('未确认');
  await api.recoverSubmission(state.session, true);
  expect(fetchMock.mock.calls[0]).toEqual(fetchMock.mock.calls[1]);
  expect(JSON.parse(fetchMock.mock.calls[1][1].body).attachments).toEqual([{ uid: 'file' }]);
  expect((await api.submissionSnapshot())?.intent?.state).toBe('confirmed');
});

it('storage failures never send and sessions cannot read or mutate each other', async () => {
  const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
  vi.stubGlobal('fetch', fetchMock);
  const api = await import('../submissions');
  const first = { ...state.session };
  state.failWrite = true;
  await expect(api.publishSubmission(first, payload)).rejects.toThrow('disk full');
  expect(fetchMock).not.toHaveBeenCalled();
  state.failWrite = false;
  await expect(api.publishSubmission(first, payload)).rejects.toThrow('offline');
  state.session = { scope: 'server-b/user-1', generation: 2, apiUrl: 'https://b.test' };
  expect((await api.submissionSnapshot())?.intent).toBeUndefined();
  await expect(api.recoverSubmission(first, true)).rejects.toThrow('切换');
  state.session = first;
  expect((await api.submissionSnapshot())?.intent?.payload).toEqual(payload);
});

it('deleted original is confirmed without recreation and pending work cannot be forgotten', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'submission_deleted' }), { status: 410 })));
  const api = await import('../submissions');
  await expect(api.publishSubmission(state.session, payload)).rejects.toThrow();
  const key = (await api.submissionSnapshot())!.intent!.key;
  api.forgetSubmission(state.session, key);
  expect((await api.submissionSnapshot())?.intent?.key).toBe(key);
  expect((await api.recoverSubmission(state.session, false)).deleted).toBe(true);
  expect(vi.mocked(fetch).mock.calls[1][1]?.method).toBe('GET');
  api.forgetSubmission(state.session, key);
  expect((await api.submissionSnapshot())?.intent).toBeUndefined();
});

it('rejects results arriving after identity switches without confirming the old submission', async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
  const api = await import('../submissions');
  const original = { ...state.session };
  const pending = api.publishSubmission(original, payload);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  state.session = { scope: 'server-a/user-2', generation: 2, apiUrl: 'https://a.test' };
  finish(new Response(JSON.stringify({ uid: 'record' })));
  await expect(pending).rejects.toThrow('切换');
  state.session = original;
  expect((await api.submissionSnapshot())?.intent?.state).toBe('pending');
});
