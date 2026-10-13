import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { migrateComposeV1 } from '../migrations/composeV1';
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
  authenticatedFetch: (path: string, init: RequestInit) => fetch(state.session.apiUrl + path, init),
}));
const payload = { content: 'original', tags: ['tag'], attachments: [{ uid: 'file' }], visibility: 'private' as const, context: {} };
beforeEach(() => {
  vi.resetModules();
  state.data = {}; state.failWrite = false;
  state.session = { scope: 'server-a/user-1', generation: 1, apiUrl: 'https://a.test' };
});
afterEach(() => vi.unstubAllGlobals());

it.each(['pending', 'recovered'])('reuses a migrated %s submission despite renderer object field order', async scenario => {
  const migrated = migrateComposeV1({
    draft: '', visibility: 'private', lastSize: null, outbox: [],
    submissions: { [state.session.scope]: {
      key: 'historical-key', state: 'pending',
      payload: { content: 'original', post_tags: 'tag', attachments: [{ uid: 'file' }],
        visibility: 'private', context: { location: { lat: 1, lon: 2 }, label: 'saved' } },
    } },
  } as any);
  state.data['compose.submissions'] = migrated.submissions;
  const rendererPayload = { content: 'original', tags: ['tag'], attachments: [{ uid: 'file' }],
    visibility: 'private' as const, context: { label: 'saved', location: { lon: 2, lat: 1 } } };
  const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ uid: 'existing-record' })));
  vi.stubGlobal('fetch', fetchMock);
  const api = await import('../submissions');
  if (scenario === 'recovered') await api.recoverSubmission(state.session, false);
  const confirmed = await api.publishSubmission(state.session, rendererPayload);
  expect(confirmed).toMatchObject({ key: 'historical-key', state: 'confirmed' });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][1].method).toBe('GET');
  expect((await api.submissionSnapshot())?.intent?.key).toBe('historical-key');
});

it('preserves array order when comparing a pending submission', async () => {
  state.data['compose.submissions'] = { [state.session.scope]: {
    key: 'existing-key', payload: { ...payload, tags: ['first', 'second'] }, state: 'pending',
  } };
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  const api = await import('../submissions');
  await expect(api.publishSubmission(state.session, { ...payload, tags: ['second', 'first'] }))
    .rejects.toThrow('未确认');
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each([200, 410])('checks migrated pending receipts before retry and never duplicates an existing record (%s)', async status => {
  state.data['compose.submissions'] = { [state.session.scope]: { key: 'old-key', payload, state: 'pending', receiptCheckRequired: true } };
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ uid: 'existing' }), { status }));
  vi.stubGlobal('fetch', fetchMock);
  const api = await import('../submissions');
  expect((await api.recoverSubmission(state.session, true)).state).toBe('confirmed');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][1].method).toBe('GET');
});

it('resubmits migrated payload with the same key only after a missing receipt', async () => {
  state.data['compose.submissions'] = { [state.session.scope]: { key: 'old-key', payload, state: 'pending', receiptCheckRequired: true } };
  const fetchMock = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 404 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ uid: 'created' }), { status: 201 }));
  vi.stubGlobal('fetch', fetchMock);
  const api = await import('../submissions');
  expect((await api.publishSubmission(state.session, payload)).state).toBe('confirmed');
  expect(fetchMock.mock.calls.map(call => call[1].method)).toEqual(['GET', 'POST']);
  expect(fetchMock.mock.calls[1][1].headers['Idempotency-Key']).toBe('old-key');
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(payload);
});

it('keeps migrated work pending if receipt checking fails', async () => {
  state.data['compose.submissions'] = { [state.session.scope]: { key: 'old-key', payload, state: 'pending', receiptCheckRequired: true } };
  const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
  vi.stubGlobal('fetch', fetchMock);
  const api = await import('../submissions');
  await expect(api.recoverSubmission(state.session, true)).rejects.toThrow('offline');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][1].method).toBe('GET');
  expect((await api.submissionSnapshot())?.intent).toMatchObject({ state: 'pending', receiptCheckRequired: true });
});

it('uses the canonical array contract and displays FastAPI validation locations', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: [
    { loc: ['body', 'tags', 0], msg: 'String should have at most 50 characters', input: 'private input' },
  ] }), { status: 422 }));
  vi.stubGlobal('fetch', fetchMock);
  const api = await import('../submissions');
  const nativePayload = { content: 'new', tags: ['tag'], attachments: [], visibility: 'private' as const, context: {} };
  await expect(api.publishSubmission(state.session, nativePayload))
    .rejects.toThrow('tags.0: String should have at most 50 characters');
  expect(fetchMock.mock.calls[0][0]).toBe('https://a.test/api/v1/bbtalk');
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(nativePayload);
  expect((await api.submissionSnapshot())?.intent?.state).toBe('pending');
});

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
