import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  fetchShowcaseData,
  getShowcaseData,
  clearCache,
  parseArrayField,
  mapRow,
  ENTRY_COLUMN_MAP,
  PILLAR_COLUMN_MAP,
  getPillarColor,
  normalizePillar,
  mergePillarMetadata,
  normalizeShowcaseData,
  ARRAY_FIELDS,
} from '../../server/showcase/feed-sync.js';

const FEED_PAYLOAD = {
  showcase_entries: [
    {
      slug: 'vllm-serving',
      title: 'vLLM Model Serving',
      status: 'active',
      sort_order: 1,
      short_summary: 'High-performance LLM inference serving.',
      capability_tags: ['model-serving', 'gpu-optimization'],
      customer_need_tags: 'low-latency, high-throughput',
      strategy_pillar_key: 'model-inference',
      unknown_column: 'ignored',
    },
    {
      slug: 'pipe-era-entry',
      title: 'Pipe Era Entry',
      status: 'active',
      sort_order: 2,
      capability_tags: 'agents|kubernetes',
      strategy_pillar_key: 'agentic-ai',
    },
    {
      slug: '',
      title: 'Row without slug is dropped',
      status: 'draft',
    },
  ],
  strategy_pillars: [
    {
      pillar_key: 'model-inference',
      title: 'Model Inference',
      short_title: 'Inference',
      summary: 'Scalable serving',
      sort_order: 1,
      visual_url: 'https://example.com/visual.png',
      color: '#3B82F6',
    },
    {
      pillar_key: 'agentic-ai',
      title: 'Agentic AI',
      short_title: 'Agentic',
      summary: 'Agents',
      sort_order: '2',
    },
  ],
  site_config: { siteTitle: 'AI Catalyst' },
  generated_at: '2026-10-01T06:00:00Z',
};

describe('parseArrayField', () => {
  it('splits feed-style comma-space values', () => {
    expect(parseArrayField('agents, kubernetes, orchestration')).toEqual([
      'agents', 'kubernetes', 'orchestration',
    ]);
  });

  it('still splits legacy pipe-delimited values', () => {
    expect(parseArrayField('agents|kubernetes|orchestration')).toEqual([
      'agents', 'kubernetes', 'orchestration',
    ]);
  });

  it('passes native arrays through trimmed', () => {
    expect(parseArrayField(['a', ' b ', ''])).toEqual(['a', 'b']);
  });

  it('trims whitespace', () => {
    expect(parseArrayField(' agents ,  kubernetes ')).toEqual(['agents', 'kubernetes']);
  });

  it('returns empty array for empty string or null/undefined', () => {
    expect(parseArrayField('')).toEqual([]);
    expect(parseArrayField(null)).toEqual([]);
    expect(parseArrayField(undefined)).toEqual([]);
  });
});

describe('mapRow', () => {
  it('maps feed entry rows with native types to camelCase keys', () => {
    const result = mapRow({
      slug: 'test-slug',
      title: 'Test Title',
      short_summary: 'A summary',
      sort_order: 5,
      capability_tags: ['agents', 'kubernetes'],
    }, ENTRY_COLUMN_MAP);

    expect(result.slug).toBe('test-slug');
    expect(result.title).toBe('Test Title');
    expect(result.shortSummary).toBe('A summary');
    expect(result.sortOrder).toBe(5);
    expect(result.capabilityTags).toEqual(['agents', 'kubernetes']);
  });

  it('maps string-typed entry rows including ", "-joined arrays', () => {
    const result = mapRow({
      slug: 'test-slug',
      sort_order: '5',
      capability_tags: 'agents, kubernetes',
      customer_need_tags: 'low-latency',
    }, ENTRY_COLUMN_MAP);

    expect(result.sortOrder).toBe(5);
    expect(result.capabilityTags).toEqual(['agents', 'kubernetes']);
    expect(result.customerNeedTags).toEqual(['low-latency']);
  });

  it('maps pillar rows', () => {
    const result = mapRow({
      pillar_key: 'agentic-ai',
      title: 'Agentic AI',
      short_title: 'Agentic',
      summary: 'Agent things',
      sort_order: 3,
      visual_url: 'https://example.com/img.png',
      color: '#22c55e',
    }, PILLAR_COLUMN_MAP);

    expect(result.pillarKey).toBe('agentic-ai');
    expect(result.title).toBe('Agentic AI');
    expect(result.shortTitle).toBe('Agentic');
    expect(result.sortOrder).toBe(3);
    expect(result.visualUrl).toBe('https://example.com/img.png');
    expect(result.color).toBe('#22c55e');
  });

  it('handles missing columns with empty defaults', () => {
    const result = mapRow({ slug: 'test' }, ENTRY_COLUMN_MAP);
    expect(result.slug).toBe('test');
    expect(result.title).toBe('');
  });

  it('ignores unknown keys', () => {
    const result = mapRow({ slug: 'test', unknown_column: 'ignored', title: 'Test Title' }, ENTRY_COLUMN_MAP);
    expect(result.slug).toBe('test');
    expect(result.title).toBe('Test Title');
    expect(result.unknown_column).toBeUndefined();
  });

  it('defaults sortOrder to 999 for non-numeric values', () => {
    const result = mapRow({ slug: 'test', sort_order: 'not-a-number' }, ENTRY_COLUMN_MAP);
    expect(result.sortOrder).toBe(999);
  });
});

describe('constants', () => {
  it('ENTRY_COLUMN_MAP covers expected fields', () => {
    expect(ENTRY_COLUMN_MAP.slug).toBe('slug');
    expect(ENTRY_COLUMN_MAP.strategy_pillar_key).toBe('strategyPillarKey');
    expect(ENTRY_COLUMN_MAP.customer_need_tags).toBe('customerNeedTags');
  });

  it('ARRAY_FIELDS includes tag fields', () => {
    expect(ARRAY_FIELDS.has('capabilityTags')).toBe(true);
    expect(ARRAY_FIELDS.has('customerNeedTags')).toBe(true);
    expect(ARRAY_FIELDS.has('githubUrl')).toBe(true);
  });
});

describe('pillar metadata', () => {
  it('fills optional display metadata while preserving explicit values', () => {
    expect(normalizePillar({ pillarKey: 'data-science-engineering' })).toMatchObject({
      pillarKey: 'data-science-engineering',
      title: 'Data Science Engineering',
      shortTitle: 'Data Science Engineering',
      color: '#06b6d4',
    });

    expect(normalizePillar({
      pillarKey: 'custom-pillar',
      title: 'Custom Pillar',
      shortTitle: 'Custom',
      color: '#ABCDEF',
    })).toMatchObject({
      title: 'Custom Pillar',
      shortTitle: 'Custom',
      color: '#abcdef',
    });
  });

  it('uses a deterministic fallback color for unknown keys', () => {
    expect(getPillarColor('new-pillar')).toBe(getPillarColor('new-pillar'));
    expect(getPillarColor('new-pillar')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('uses the unsigned hash index shared with the client fallback', () => {
    expect(getPillarColor('new-pillar')).toBe('#a855f7');
  });

  it('merges referenced keys missing from feed metadata', () => {
    const result = mergePillarMetadata(
      [{ pillarKey: 'model-inference', title: 'Model Inference', sortOrder: 1 }],
      ['model-inference', 'data-science-engineering'],
    );

    expect(result.map(p => p.pillarKey)).toEqual(['model-inference', 'data-science-engineering']);
    expect(result[1]).toMatchObject({
      title: 'Data Science Engineering',
      color: '#06b6d4',
    });
  });

  it('adds metadata for showcase entries whose pillar row is not refreshed yet', () => {
    const result = normalizeShowcaseData({
      entries: [{ slug: 'new', strategyPillarKey: 'future-pillar' }],
      pillars: [],
    });

    expect(result.pillars).toHaveLength(1);
    expect(result.pillars[0].pillarKey).toBe('future-pillar');
  });
});

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

function stubFeed(responses) {
  const fetchMock = vi.fn(async (url, options) => {
    if (!options || options.headers.Authorization !== 'Bearer token-123') {
      return jsonResponse(401, { error: 'unauthorized' });
    }
    for (const [suffix, body] of Object.entries(responses)) {
      if (String(url).endsWith(suffix)) return jsonResponse(200, body);
    }
    return jsonResponse(404, { error: 'unknown board' });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('fetchShowcaseData', () => {
  beforeEach(() => {
    clearCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches /feed/showcase.json with bearer auth and maps rows', async () => {
    const fetchMock = stubFeed({ '/feed/showcase.json': FEED_PAYLOAD });
    const storage = { writeToStorage: vi.fn(async () => {}) };
    const result = await fetchShowcaseData('https://feed.example.test', 'token-123', storage);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://feed.example.test/feed/showcase.json',
      expect.objectContaining({ headers: { Authorization: 'Bearer token-123' } }),
    );

    const entry = result.entries.find(e => e.slug === 'vllm-serving');
    expect(entry).toMatchObject({
      title: 'vLLM Model Serving',
      status: 'active',
      sortOrder: 1,
      shortSummary: 'High-performance LLM inference serving.',
      capabilityTags: ['model-serving', 'gpu-optimization'],
      customerNeedTags: ['low-latency', 'high-throughput'],
      strategyPillarKey: 'model-inference',
    });

    const pipeEra = result.entries.find(e => e.slug === 'pipe-era-entry');
    expect(pipeEra.capabilityTags).toEqual(['agents', 'kubernetes']);

    expect(result.entries).toHaveLength(2);

    expect(result.pillars[0]).toMatchObject({
      pillarKey: 'model-inference',
      title: 'Model Inference',
      shortTitle: 'Inference',
      sortOrder: 1,
      color: '#3b82f6',
    });
    expect(result.pillars).toHaveLength(2);
    expect(result.fetchedAt).toEqual(expect.any(String));

    expect(storage.writeToStorage).toHaveBeenCalledWith(
      'ai-catalyst/showcase/showcase-data.json',
      expect.objectContaining({ entries: result.entries }),
    );
  });

  it('surfaces an actionable error on 401', async () => {
    stubFeed({});
    const storage = { writeToStorage: vi.fn(async () => {}), readFromStorage: vi.fn(async () => null) };

    await expect(fetchShowcaseData('https://feed.example.test', 'wrong-token', storage))
      .rejects.toThrow('unauthorized — check POC_EXPLORER_FEED_TOKEN');
  });

  it('serves repeated reads from the TTL cache', async () => {
    const fetchMock = stubFeed({ '/feed/showcase.json': FEED_PAYLOAD });
    const storage = { writeToStorage: vi.fn(async () => {}), readFromStorage: vi.fn(async () => null) };
    await fetchShowcaseData('https://feed.example.test', 'token-123', storage);
    await getShowcaseData('https://feed.example.test', 'token-123', storage);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to stored data when the feed fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('feed down'); }));
    const stored = {
      entries: [{ slug: 'stored-entry', strategyPillarKey: 'model-inference' }],
      pillars: [],
      fetchedAt: '2026-09-01T00:00:00Z',
    };
    const storage = {
      writeToStorage: vi.fn(async () => {}),
      readFromStorage: vi.fn(async () => stored),
    };

    const result = await getShowcaseData('https://feed.example.test', 'token-123', storage);
    expect(result.entries[0].slug).toBe('stored-entry');
  });

  it('rethrows when no cached or stored fallback exists', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('feed down'); }));
    const storage = {
      writeToStorage: vi.fn(async () => {}),
      readFromStorage: vi.fn(async () => null),
    };

    await expect(getShowcaseData('https://feed.example.test', 'token-123', storage))
      .rejects.toThrow('feed down');
  });
});
