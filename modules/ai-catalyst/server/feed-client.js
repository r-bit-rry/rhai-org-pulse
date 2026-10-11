const DEFAULT_TIMEOUT_MS = 30000;

class FeedError extends Error {
  constructor(message, { status, body, cause } = {}) {
    super(message);
    this.name = 'FeedError';
    this.status = status || null;
    this.body = body || null;
    this.cause = cause || null;
  }
}

function parseJsonBody(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

/**
 * HTTP client for the POC Explorer machine feeds (ADR-077 producer side).
 * All endpoints require `Authorization: Bearer <token>` and return JSON.
 */
function createFeedClient({ baseUrl, token, timeoutMs = DEFAULT_TIMEOUT_MS, fetchFn = globalThis.fetch }) {
  const root = String(baseUrl || '').replace(/\/+$/, '');

  async function request(path) {
    if (!token) {
      throw new FeedError('POC Explorer feed token is not configured — set POC_EXPLORER_FEED_TOKEN');
    }
    if (!root) {
      throw new FeedError('POC Explorer feed URL is not configured — set POC_EXPLORER_FEED_URL');
    }

    const url = root + path;
    let response;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      response = await fetchFn(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
    } catch (err) {
      if (err && err.name === 'AbortError') {
        throw new FeedError(`POC Explorer feed request timed out after ${Math.round(timeoutMs / 1000)}s: ${url}`, { cause: err });
      }
      throw new FeedError(
        `Failed to reach POC Explorer feed at ${root}: ${err.message}. Check POC_EXPLORER_FEED_URL and network connectivity.`,
        { cause: err },
      );
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    const body = parseJsonBody(text);

    if (response.status === 401) {
      throw new FeedError('unauthorized — check POC_EXPLORER_FEED_TOKEN', { status: 401, body });
    }
    if (response.status === 404) {
      throw new FeedError(`unknown board/iteration at ${path}`, { status: 404, body });
    }
    if (!response.ok) {
      throw new FeedError(`POC Explorer feed request failed with HTTP ${response.status} at ${path}`, { status: response.status, body });
    }
    if (body === null || typeof body !== 'object') {
      throw new FeedError(`POC Explorer feed returned non-JSON response at ${path}`, { status: response.status });
    }
    return body;
  }

  return {
    async listBoards() {
      const body = await request('/feed/boards.json');
      return Array.isArray(body.boards) ? body.boards.map(String) : [];
    },
    async getBoard(name) {
      return request(`/feed/board.json?board=${encodeURIComponent(name)}`);
    },
    async getShowcase() {
      return request('/feed/showcase.json');
    },
  };
}

module.exports = { createFeedClient, FeedError, DEFAULT_TIMEOUT_MS };
