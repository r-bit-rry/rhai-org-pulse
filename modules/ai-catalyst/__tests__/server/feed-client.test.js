import { describe, it, expect, vi } from 'vitest';

import { createFeedClient, FeedError } from '../../server/feed-client.js';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

describe('createFeedClient', () => {
  it('lists boards with bearer auth against /feed/boards.json', async () => {
    const fetchFn = vi.fn(async (url, options) => {
      expect(url).toBe('https://feed.example.test/feed/boards.json');
      expect(options.headers.Authorization).toBe('Bearer token-123');
      return jsonResponse(200, { boards: ['board-2026-09', 'board-2026-10'] });
    });
    const client = createFeedClient({ baseUrl: 'https://feed.example.test', token: 'token-123', fetchFn });

    await expect(client.listBoards()).resolves.toEqual(['board-2026-09', 'board-2026-10']);
  });

  it('strips trailing slashes from the base url', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(200, { boards: [] }));
    const client = createFeedClient({ baseUrl: 'https://feed.example.test/', token: 't', fetchFn });

    await client.listBoards();
    expect(fetchFn.mock.calls[0][0]).toBe('https://feed.example.test/feed/boards.json');
  });

  it('fetches a single board with an encoded board name', async () => {
    const fetchFn = vi.fn(async (url) => {
      expect(url).toBe('https://feed.example.test/feed/board.json?board=board-2026-09');
      return jsonResponse(200, { kind: 'board', name: 'board-2026-09', count: 1, columns: [], rows: [] });
    });
    const client = createFeedClient({ baseUrl: 'https://feed.example.test', token: 't', fetchFn });

    await expect(client.getBoard('board-2026-09')).resolves.toEqual({
      kind: 'board', name: 'board-2026-09', count: 1, columns: [], rows: [],
    });
  });

  it('fetches showcase data from /feed/showcase.json', async () => {
    const fetchFn = vi.fn(async (url) => {
      expect(url).toBe('https://feed.example.test/feed/showcase.json');
      return jsonResponse(200, { showcase_entries: [], strategy_pillars: [], site_config: {}, generated_at: 'x' });
    });
    const client = createFeedClient({ baseUrl: 'https://feed.example.test', token: 't', fetchFn });

    await expect(client.getShowcase()).resolves.toEqual({
      showcase_entries: [], strategy_pillars: [], site_config: {}, generated_at: 'x',
    });
  });

  it('maps 401 to an actionable unauthorized error', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(401, { error: 'unauthorized' }));
    const client = createFeedClient({ baseUrl: 'https://feed.example.test', token: 'bad', fetchFn });

    const err = await client.listBoards().catch(e => e);
    expect(err).toBeInstanceOf(FeedError);
    expect(err.status).toBe(401);
    expect(err.message).toBe('unauthorized — check POC_EXPLORER_FEED_TOKEN');
  });

  it('maps 404 to an unknown board error carrying the response body', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(404, {
      error: 'unknown board',
      known: ['board-2026-09'],
    }));
    const client = createFeedClient({ baseUrl: 'https://feed.example.test', token: 't', fetchFn });

    const err = await client.getBoard('board-1999-01').catch(e => e);
    expect(err).toBeInstanceOf(FeedError);
    expect(err.status).toBe(404);
    expect(err.message).toContain('unknown board');
    expect(err.body).toEqual({ error: 'unknown board', known: ['board-2026-09'] });
  });

  it('maps network failures to an actionable message', async () => {
    const fetchFn = vi.fn(async () => { throw new Error('ECONNREFUSED'); });
    const client = createFeedClient({ baseUrl: 'https://feed.example.test', token: 't', fetchFn });

    const err = await client.listBoards().catch(e => e);
    expect(err).toBeInstanceOf(FeedError);
    expect(err.message).toContain('feed.example.test');
    expect(err.message).toContain('POC_EXPLORER_FEED_URL');
  });

  it('times out long-running requests', async () => {
    const fetchFn = vi.fn((url, options) => new Promise((_, reject) => {
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    const client = createFeedClient({ baseUrl: 'https://feed.example.test', token: 't', fetchFn, timeoutMs: 20 });

    const err = await client.listBoards().catch(e => e);
    expect(err).toBeInstanceOf(FeedError);
    expect(err.message).toContain('timed out');
  });

  it('rejects non-JSON responses', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200, text: async () => '<html>oops</html>' }));
    const client = createFeedClient({ baseUrl: 'https://feed.example.test', token: 't', fetchFn });

    const err = await client.listBoards().catch(e => e);
    expect(err).toBeInstanceOf(FeedError);
    expect(err.message).toContain('non-JSON');
  });

  it('rejects other HTTP errors with the status code', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(500, { error: 'boom' }));
    const client = createFeedClient({ baseUrl: 'https://feed.example.test', token: 't', fetchFn });

    const err = await client.listBoards().catch(e => e);
    expect(err).toBeInstanceOf(FeedError);
    expect(err.status).toBe(500);
  });

  it('throws before fetching when no token is configured', async () => {
    const fetchFn = vi.fn();
    const client = createFeedClient({ baseUrl: 'https://feed.example.test', token: '', fetchFn });

    await expect(client.listBoards()).rejects.toThrow(/POC_EXPLORER_FEED_TOKEN/);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
