import { describe, it, expect, vi, afterEach } from 'vitest'

const registerRoutes = (await import('../../server/index.js')).default

const FEED_BOARDS_PAYLOAD = {
  boards: ['board-2026-09', 'board-2026-10'],
}

const BOARD_2026_09_PAYLOAD = {
  kind: 'board',
  name: 'board-2026-09',
  count: 2,
  columns: ['title', 'unique_id', 'capability_labels', 'gpu_required', 'impact_score'],
  rows: [
    {
      title: 'Agent Framework',
      unique_id: 'org/agent-framework',
      link: 'https://github.com/org/agent-framework',
      item_type: 'repo',
      source: 'github',
      sources: 'github, hn',
      category: 'agentic-ai',
      capability_labels: 'agents, kubernetes',
      red_hat_stack: 'OpenShift AI, vLLM',
      impact_score: '9',
      feasibility_score: '7.5',
      stars: '1137',
      contributors: '6',
      gpu_required: 'yes',
      has_dockerfile: 'yes',
      board_passes_gate: 'yes',
      board_feasibility_estimated: 'no',
      vram_gb: '24',
      pm_decision: 'Approve(mock-reviewer)',
      pm_review_history: JSON.stringify([{ reviewer: 'mock-reviewer', decision: 'Approve' }]),
    },
    {
      title: 'Legacy Pipe Era Entry',
      unique_id: 'org/pipe-era',
      capability_labels: 'agents|kubernetes',
      gpu_required: 'no',
      impact_score: '',
      pm_review_history: '',
    },
    { title: '', unique_id: '', impact_score: '' },
  ],
}

const BOARD_2026_10_PAYLOAD = {
  kind: 'board',
  name: 'board-2026-10',
  count: 1,
  columns: ['title', 'unique_id'],
  rows: [
    { title: 'October Entry', unique_id: 'org/october', gpu_required: 'no' },
  ],
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  }
}

function stubFeedFeed(responses, { url = 'https://pocexplorer.redhataicatalyst.com', token = 'token-123' } = {}) {
  const fetchMock = vi.fn(async (requestUrl, options) => {
    if (!options || options.headers.Authorization !== `Bearer ${token}`) {
      return jsonResponse(401, { error: 'unauthorized' })
    }
    for (const [suffix, body] of Object.entries(responses)) {
      if (String(requestUrl) === url + suffix) return jsonResponse(200, body)
    }
    return jsonResponse(404, { error: 'unknown board', known: ['board-2026-09'] })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    map,
    readFromStorage: vi.fn(async key => (map.has(key) ? map.get(key) : null)),
    writeToStorage: vi.fn(async (key, value) => { map.set(key, value) }),
  }
}

function makeContext(overrides = {}) {
  const storage = overrides.storage || makeStorage()
  const handlers = {}
  const router = {
    get: vi.fn((path, ...args) => { handlers[path] = args.at(-1) }),
    post: vi.fn((path, ...args) => { handlers[path] = args.at(-1) }),
  }
  const context = {
    storage,
    requireAuth: vi.fn((req, res, next) => next()),
    requireAdmin: vi.fn((req, res, next) => next()),
    requireScope: vi.fn(() => vi.fn((req, res, next) => next())),
    resolveSecret: vi.fn(),
    secrets: { POC_EXPLORER_FEED_TOKEN: 'token-123' },
    registerScopes: vi.fn(),
    registerRefresh: vi.fn(),
    registerDiagnostics: vi.fn(),
    registerExport: vi.fn(),
    ...overrides.context,
  }
  registerRoutes(router, context)
  return { handlers, context, storage }
}

describe('ai-catalyst server module', () => {
  it('exports a function', () => {
    expect(typeof registerRoutes).toBe('function')
  })

  it('registers expected GET routes', () => {
    const registered = []
    const router = {
      get: vi.fn((...args) => registered.push({ method: 'get', path: args[0] })),
      post: vi.fn((...args) => registered.push({ method: 'post', path: args[0] }))
    }
    const context = {
      storage: {
        readFromStorage: vi.fn(async () => null),
        writeToStorage: vi.fn(async () => {})
      },
      requireAuth: vi.fn((req, res, next) => next()),
      requireAdmin: vi.fn((req, res, next) => next()),
      requireScope: vi.fn(() => vi.fn((req, res, next) => next())),
      resolveSecret: vi.fn(),
      secrets: {},
      registerScopes: vi.fn(),
      registerRefresh: vi.fn(),
      registerDiagnostics: vi.fn(),
      registerExport: vi.fn()
    }

    registerRoutes(router, context)

    const getPaths = registered.filter(r => r.method === 'get').map(r => r.path)
    expect(getPaths).toContain('/board-config')
    expect(getPaths).toContain('/config')
    expect(getPaths).toContain('/boards')
    expect(getPaths).toContain('/boards/:month')
    expect(getPaths).toContain('/candidates/:id')
    expect(getPaths).toContain('/stats')
    expect(getPaths).toContain('/showcase/config')
    expect(getPaths).toContain('/showcase/entries')
    expect(getPaths).toContain('/showcase/entries/:slug')
  })

  it('registers POST routes including showcase', () => {
    const registered = []
    const router = {
      get: vi.fn(),
      post: vi.fn((...args) => registered.push({ method: 'post', path: args[0] }))
    }
    const context = {
      storage: {
        readFromStorage: vi.fn(async () => null),
        writeToStorage: vi.fn(async () => {})
      },
      requireAuth: vi.fn((req, res, next) => next()),
      requireAdmin: vi.fn((req, res, next) => next()),
      requireScope: vi.fn(() => vi.fn((req, res, next) => next())),
      resolveSecret: vi.fn(),
      secrets: {},
      registerScopes: vi.fn(),
      registerRefresh: vi.fn(),
      registerDiagnostics: vi.fn(),
      registerExport: vi.fn()
    }

    registerRoutes(router, context)

    const postPaths = registered.filter(r => r.method === 'post').map(r => r.path)
    expect(postPaths).toContain('/board-config')
    expect(postPaths).toContain('/sync')
    expect(postPaths).toContain('/showcase/config')
    expect(postPaths).toContain('/showcase/refresh')
  })

  it('registers scopes', () => {
    const router = { get: vi.fn(), post: vi.fn() }
    const context = {
      storage: { readFromStorage: vi.fn(async () => null), writeToStorage: vi.fn(async () => {}) },
      requireAuth: vi.fn((req, res, next) => next()),
      requireAdmin: vi.fn((req, res, next) => next()),
      requireScope: vi.fn(() => vi.fn((req, res, next) => next())),
      resolveSecret: vi.fn(),
      secrets: {},
      registerScopes: vi.fn(),
      registerRefresh: vi.fn(),
      registerDiagnostics: vi.fn(),
      registerExport: vi.fn()
    }

    registerRoutes(router, context)

    expect(context.registerScopes).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ key: 'ai-catalyst:read' }),
        expect.objectContaining({ key: 'ai-catalyst:showcase' })
      ])
    )
  })

  it('registers refresh handlers', () => {
    const router = { get: vi.fn(), post: vi.fn() }
    const context = {
      storage: { readFromStorage: vi.fn(async () => null), writeToStorage: vi.fn(async () => {}) },
      requireAuth: vi.fn((req, res, next) => next()),
      requireAdmin: vi.fn((req, res, next) => next()),
      requireScope: vi.fn(() => vi.fn((req, res, next) => next())),
      resolveSecret: vi.fn(),
      secrets: {},
      registerScopes: vi.fn(),
      registerRefresh: vi.fn(),
      registerDiagnostics: vi.fn(),
      registerExport: vi.fn()
    }

    registerRoutes(router, context)

    expect(context.registerRefresh).toHaveBeenCalledWith(
      'ai-catalyst:sync-boards',
      expect.objectContaining({ cadence: '1h' })
    )
    expect(context.registerRefresh).toHaveBeenCalledWith(
      'ai-catalyst:showcase-sync',
      expect.objectContaining({ cadence: '1h' })
    )
  })

  it('registers diagnostics hook', () => {
    const router = { get: vi.fn(), post: vi.fn() }
    const context = {
      storage: { readFromStorage: vi.fn(async () => null), writeToStorage: vi.fn(async () => {}) },
      requireAuth: vi.fn((req, res, next) => next()),
      requireAdmin: vi.fn((req, res, next) => next()),
      requireScope: vi.fn(() => vi.fn((req, res, next) => next())),
      resolveSecret: vi.fn(),
      secrets: {},
      registerScopes: vi.fn(),
      registerRefresh: vi.fn(),
      registerDiagnostics: vi.fn(),
      registerExport: vi.fn()
    }

    registerRoutes(router, context)

    expect(context.registerDiagnostics).toHaveBeenCalled()
  })

  it('registers export hook', () => {
    const router = { get: vi.fn(), post: vi.fn() }
    const context = {
      storage: { readFromStorage: vi.fn(async () => null), writeToStorage: vi.fn(async () => {}) },
      requireAuth: vi.fn((req, res, next) => next()),
      requireAdmin: vi.fn((req, res, next) => next()),
      requireScope: vi.fn(() => vi.fn((req, res, next) => next())),
      resolveSecret: vi.fn(),
      secrets: {},
      registerScopes: vi.fn(),
      registerRefresh: vi.fn(),
      registerDiagnostics: vi.fn(),
      registerExport: vi.fn()
    }

    registerRoutes(router, context)

    expect(context.registerExport).toHaveBeenCalled()
  })

  it('scopes board pillars to the complete month while keeping showcase pillars complete', async () => {
    const handlers = {}
    const candidates = [
      { uniqueId: 'inference-item', category: 'model-inference', impactScore: 9 },
      { uniqueId: 'data-item', category: 'data-science-engineering', impactScore: 8 }
    ]
    const showcaseData = {
      fetchedAt: '2026-09-16T10:00:00Z',
      pillars: [
        { pillarKey: 'model-inference', title: 'Model Inference', sortOrder: 1 },
        { pillarKey: 'data-science-engineering', title: 'Data Science', sortOrder: 2 },
        { pillarKey: 'model-customization', title: 'Model Customization', sortOrder: 3 }
      ],
      entries: [{ slug: 'inference-showcase', strategyPillarKey: 'model-inference', status: 'active' }]
    }
    const index = { boards: [{ month: '2026-09', candidateCount: candidates.length }] }
    const storage = {
      readFromStorage: vi.fn(async key => {
        if (key === 'ai-catalyst/index.json') return index
        if (key === 'ai-catalyst/boards/2026-09.json') return candidates
        if (key === 'ai-catalyst/showcase/showcase-data.json') return showcaseData
        return null
      }),
      writeToStorage: vi.fn(async () => {})
    }
    const router = {
      get: vi.fn((path, ...args) => { handlers[path] = args.at(-1) }),
      post: vi.fn()
    }
    const context = {
      storage,
      requireAuth: vi.fn((req, res, next) => next()),
      requireAdmin: vi.fn((req, res, next) => next()),
      requireScope: vi.fn(() => vi.fn((req, res, next) => next())),
      resolveSecret: vi.fn(),
      secrets: {},
      registerScopes: vi.fn(),
      registerRefresh: vi.fn(),
      registerDiagnostics: vi.fn(),
      registerExport: vi.fn()
    }

    registerRoutes(router, context)

    const boardResponse = { json: vi.fn(), status: vi.fn() }
    await handlers['/boards/:month'](
      { params: { month: '2026-09' }, query: { category: 'model-inference' } },
      boardResponse
    )

    expect(boardResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      filtered: 1,
      pillars: expect.arrayContaining([
        expect.objectContaining({ pillarKey: 'model-inference' }),
        expect.objectContaining({ pillarKey: 'data-science-engineering' })
      ])
    }))
    expect(boardResponse.json.mock.calls[0][0].pillars).toHaveLength(2)

    const detailResponse = { json: vi.fn(), status: vi.fn() }
    await handlers['/candidates/:id']({ params: { id: 'data-item' } }, detailResponse)
    expect(detailResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      boardMonth: '2026-09',
      pillar: expect.objectContaining({ pillarKey: 'data-science-engineering' })
    }))

    const showcaseResponse = { json: vi.fn(), status: vi.fn() }
    await handlers['/showcase/entries']({}, showcaseResponse)

    expect(showcaseResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      pillars: expect.arrayContaining([
        expect.objectContaining({ pillarKey: 'model-inference' }),
        expect.objectContaining({ pillarKey: 'data-science-engineering' }),
        expect.objectContaining({ pillarKey: 'model-customization' })
      ])
    }))
    expect(showcaseResponse.json.mock.calls[0][0].pillars).toHaveLength(3)
  })
})

describe('ai-catalyst board sync via POC Explorer feed', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('syncs boards and adapts stringified feed rows to the camelCase contract', async () => {
    const fetchMock = stubFeedFeed({
      '/feed/boards.json': FEED_BOARDS_PAYLOAD,
      '/feed/board.json?board=board-2026-09': BOARD_2026_09_PAYLOAD,
      '/feed/board.json?board=board-2026-10': BOARD_2026_10_PAYLOAD,
    })
    const { handlers, storage } = makeContext()

    const res = { json: vi.fn(), status: vi.fn() }
    await handlers['/sync']({}, res)

    expect(fetchMock).toHaveBeenCalledWith(
      'https://pocexplorer.redhataicatalyst.com/feed/boards.json',
      expect.objectContaining({ headers: { Authorization: 'Bearer token-123' } })
    )
    expect(res.status).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'ok', synced: 2, total: 2 }))

    const september = storage.map.get('ai-catalyst/boards/2026-09.json')
    expect(september).toHaveLength(2)

    expect(september[0]).toMatchObject({
      title: 'Agent Framework',
      uniqueId: 'org/agent-framework',
      itemType: 'repo',
      sources: ['github', 'hn'],
      capabilityLabels: ['agents', 'kubernetes'],
      redHatStack: ['OpenShift AI', 'vLLM'],
      impactScore: 9,
      feasibilityScore: 7.5,
      stars: 1137,
      contributors: 6,
      gpuRequired: true,
      hasDockerfile: true,
      boardPassesGate: true,
      boardFeasibilityEstimated: false,
      vramGb: 24,
      pmReviewHistory: [{ reviewer: 'mock-reviewer', decision: 'Approve' }],
    })

    expect(september[1]).toMatchObject({
      capabilityLabels: ['agents', 'kubernetes'],
      gpuRequired: false,
      impactScore: null,
      pmReviewHistory: [],
    })

    expect(storage.map.get('ai-catalyst/boards/2026-10.json')).toHaveLength(1)

    const index = storage.map.get('ai-catalyst/index.json')
    expect(index.boards.map(b => b.month)).toEqual(['2026-10', '2026-09'])
    expect(index.boards[1]).toMatchObject({ month: '2026-09', candidateCount: 2 })
    expect(index.boards[1].lastSynced).toEqual(expect.any(String))
  })

  it('keeps previously synced months in the index', async () => {
    stubFeedFeed({
      '/feed/boards.json': { boards: ['board-2026-10'] },
      '/feed/board.json?board=board-2026-10': BOARD_2026_10_PAYLOAD,
    })
    const { handlers, storage } = makeContext({
      storage: makeStorage({
        'ai-catalyst/index.json': {
          boards: [{ month: '2026-09', candidateCount: 2, lastSynced: '2026-09-16T10:00:00Z' }],
        },
        'ai-catalyst/boards/2026-09.json': [{ title: 'Old' }],
      }),
    })

    const res = { json: vi.fn(), status: vi.fn() }
    await handlers['/sync']({}, res)

    const index = storage.map.get('ai-catalyst/index.json')
    expect(index.boards.map(b => b.month)).toEqual(['2026-10', '2026-09'])
  })

  it('surfaces an actionable error on 401 responses', async () => {
    stubFeedFeed({})
    const { handlers } = makeContext({ context: { secrets: { POC_EXPLORER_FEED_TOKEN: 'bad-token' } } })

    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() }
    await handlers['/sync']({}, res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Sync failed: unauthorized — check POC_EXPLORER_FEED_TOKEN'
    })
  })

  it('reports unknown board errors per board without failing the whole sync', async () => {
    stubFeedFeed({ '/feed/boards.json': { boards: ['board-1999-01'] } })
    const { handlers } = makeContext()

    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() }
    await handlers['/sync']({}, res)

    expect(res.status).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      status: 'ok',
      synced: 0,
      total: 1,
      failed: [{ board: 'board-1999-01', error: expect.stringContaining('unknown board') }],
    }))
  })

  it('continues past per-board failures and reports them honestly', async () => {
    stubFeedFeed({
      '/feed/boards.json': FEED_BOARDS_PAYLOAD,
      '/feed/board.json?board=board-2026-09': BOARD_2026_09_PAYLOAD,
    })
    const { handlers, storage } = makeContext()

    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() }
    await handlers['/sync']({}, res)

    expect(res.status).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      status: 'ok',
      synced: 1,
      total: 2,
      failed: [{ board: 'board-2026-10', error: expect.stringContaining('unknown board') }],
    }))

    expect(storage.map.get('ai-catalyst/boards/2026-09.json')).toHaveLength(2)
    const index = storage.map.get('ai-catalyst/index.json')
    expect(index.boards.map(b => b.month)).toEqual(['2026-09'])
  })

  it('logs and returns per-board failures from the refresh handler', async () => {
    stubFeedFeed({
      '/feed/boards.json': FEED_BOARDS_PAYLOAD,
      '/feed/board.json?board=board-2026-09': BOARD_2026_09_PAYLOAD,
    })
    const { context } = makeContext()
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const syncBoardsConfig = context.registerRefresh.mock.calls.find(c => c[0] === 'ai-catalyst:sync-boards')[1]

    const result = await syncBoardsConfig.handler()

    expect(result).toMatchObject({
      status: 'success',
      synced: 1,
      total: 2,
      failed: [{ board: 'board-2026-10', error: expect.stringContaining('unknown board') }],
    })
    expect(errSpy).toHaveBeenCalledWith(
      '[ai-catalyst:boards] Board sync failures:',
      [{ board: 'board-2026-10', error: expect.stringContaining('unknown board') }],
    )
    errSpy.mockRestore()
  })

  it('skips syncing when no feed token is configured', async () => {
    const fetchMock = stubFeedFeed({})
    const { handlers } = makeContext({ context: { secrets: {} } })

    const res = { json: vi.fn(), status: vi.fn() }
    await handlers['/sync']({}, res)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'ok', skipped: true }))
  })

  it('reports feed configuration status', async () => {
    const { handlers } = makeContext()

    const res = { json: vi.fn(), status: vi.fn() }
    await handlers['/config']({}, res)

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ configured: true }))
  })

  it('reports unconfigured status without a token', async () => {
    const { handlers } = makeContext({ context: { secrets: {} } })

    const res = { json: vi.fn(), status: vi.fn() }
    await handlers['/config']({}, res)

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ configured: false }))
  })

  it('saves and reloads the board feed URL override', async () => {
    const { handlers } = makeContext()

    const saveRes = { json: vi.fn(), status: vi.fn().mockReturnThis() }
    await handlers['/board-config'](
      { body: { feedUrl: 'https://staging.pocexplorer.example.test' } },
      saveRes
    )
    expect(saveRes.json).toHaveBeenCalledWith({ status: 'saved' })
    expect(handlers).toBeDefined()

    const { handlers: reloaded } = makeContext({
      storage: makeStorage({
        'ai-catalyst/board-config.json': { feedUrl: 'https://staging.pocexplorer.example.test' },
      }),
    })
    const fetchMock = stubFeedFeed(
      { '/feed/boards.json': { boards: [] } },
      { url: 'https://staging.pocexplorer.example.test' }
    )
    const res = { json: vi.fn(), status: vi.fn() }
    await reloaded['/sync']({}, res)

    expect(fetchMock).toHaveBeenCalledWith(
      'https://staging.pocexplorer.example.test/feed/boards.json',
      expect.anything()
    )
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'ok', synced: 0 }))
  })

  it('rejects non-string feed URLs in board config', async () => {
    const { handlers } = makeContext()

    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() }
    await handlers['/board-config']({ body: { feedUrl: 123 } }, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'feedUrl must be a string' })
  })
})
