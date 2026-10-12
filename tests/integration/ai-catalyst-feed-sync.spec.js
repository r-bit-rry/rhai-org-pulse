const { test, expect } = require('@playwright/test');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { DEFAULT_PAGE_WAIT_TIME } = require('./constants');
const { setupErrorTracking, logCapturedErrors } = require('./helpers');

/**
 * Integration tests for the AI Catalyst feed sync against a local stub
 *
 * Each test starts its own plain-HTTP feed stub on an ephemeral loopback port
 * and seeds its own state (configure the stub via the config API, then run
 * one successful sync), so no test depends on another test's leftovers. The
 * suite runs in order in a single worker (mode: 'default' overrides the
 * repo-wide fullyParallel setting) because every test shares the backend's
 * writable storage — but a failure never skips the remaining tests.
 *
 * Requires a writable backend booted WITHOUT demo mode and with:
 *   POC_EXPLORER_FEED_TOKEN=<any value> POC_EXPLORER_ALLOW_LOOPBACK=1
 * Against demo-mode or unconfigured deployments the suite skips itself via
 * the /config probe (CI's plain `make test-module MODULE=ai-catalyst` path).
 *
 * Tag: @ai-catalyst
 * Usage: npx playwright test tests/integration/ai-catalyst-feed-sync.spec.js --workers=1
 */

const STUB_BOARD_MONTH = '2026-04';
const STUB_BOARD_PAYLOAD = {
  kind: 'board',
  name: `board-${STUB_BOARD_MONTH}`,
  count: 2,
  columns: ['title', 'unique_id', 'impact_score', 'gpu_required'],
  rows: [
    { title: 'Stub Board Candidate', unique_id: 'org/stub-candidate', source: 'github', category: 'model-inference', impact_score: '8.5', gpu_required: 'yes', has_dockerfile: 'yes' },
    { title: 'Second Stub Candidate', unique_id: 'org/stub-candidate-2', source: 'hn', category: 'agentic-ai', impact_score: '7', gpu_required: 'no' },
  ],
};

// Distinctive showcase entry served only by the stub, so rendering tests can
// prove the catalog displays data that round-tripped through the sync. It
// deliberately avoids the data-science-engineering pillar to stay compatible
// with the "No projects match your filters" test in ai-catalyst.spec.js.
const STUB_SHOWCASE_MARKER_ENTRY = {
  slug: 'stub-synced-entry',
  title: 'Stub Synced Showcase Entry',
  status: 'active',
  sort_order: 99,
  short_summary: 'Entry served by the local feed stub',
  strategy_pillar_key: 'model-inference',
};

const SHOWCASE_ENTRY_FEED_KEYS = {
  slug: 'slug', title: 'title', status: 'status', sort_order: 'sortOrder',
  short_summary: 'shortSummary', customer_problem: 'customerProblem',
  solution_summary: 'solutionSummary', capability_tags: 'capabilityTags',
  customer_need_tags: 'customerNeedTags', strategy_pillar_key: 'strategyPillarKey',
};
const SHOWCASE_PILLAR_FEED_KEYS = {
  pillar_key: 'pillarKey', title: 'title', short_title: 'shortTitle',
  summary: 'summary', sort_order: 'sortOrder', visual_url: 'visualUrl', color: 'color',
};

function toFeedRows(items, keyMap) {
  return items.map(item => Object.fromEntries(
    Object.entries(keyMap).map(([feedKey, prop]) => [feedKey, item[prop]]),
  ));
}

function loadFixtureShowcaseData() {
  return require('../../fixtures/ai-catalyst/showcase/showcase-data.json');
}

function startFeedStub() {
  const fixtureShowcase = loadFixtureShowcaseData();
  const stub = {
    requests: [],
    malformedBoards: new Set(),
    baseUrl: null,
    server: null,
  };

  stub.server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    stub.requests.push({ path: req.url, auth: req.headers.authorization || '' });
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
      return send(401, { error: 'unauthorized' });
    }
    if (url.pathname === '/feed/boards.json') {
      return send(200, { boards: [`board-${STUB_BOARD_MONTH}`] });
    }
    if (url.pathname === '/feed/board.json') {
      const board = url.searchParams.get('board');
      if (stub.malformedBoards.has(board)) return send(200, {});
      return send(200, STUB_BOARD_PAYLOAD);
    }
    if (url.pathname === '/feed/showcase.json') {
      return send(200, {
        showcase_entries: [...toFeedRows(fixtureShowcase.entries, SHOWCASE_ENTRY_FEED_KEYS), STUB_SHOWCASE_MARKER_ENTRY],
        strategy_pillars: toFeedRows(fixtureShowcase.pillars, SHOWCASE_PILLAR_FEED_KEYS),
        site_config: {},
        generated_at: new Date().toISOString(),
      });
    }
    return send(404, { error: 'not found' });
  });

  return new Promise(resolve => {
    stub.server.listen(0, '127.0.0.1', () => {
      stub.baseUrl = `http://127.0.0.1:${stub.server.address().port}`;
      resolve(stub);
    });
  });
}

const AI_CATALYST_DATA_DIR = path.join(__dirname, '..', '..', 'data', 'ai-catalyst');
const SYNC_TOUCHED_FILES = [
  'index.json',
  'board-config.json',
  'showcase/showcase-data.json',
  'showcase/config.json',
  `boards/${STUB_BOARD_MONTH}.json`,
];

function snapshotDataState() {
  const snapshot = { existing: {}, absent: [] };
  for (const rel of SYNC_TOUCHED_FILES) {
    const file = path.join(AI_CATALYST_DATA_DIR, rel);
    if (fs.existsSync(file)) snapshot.existing[rel] = fs.readFileSync(file);
    else snapshot.absent.push(rel);
  }
  return snapshot;
}

function restoreDataState(snapshot) {
  for (const rel of snapshot.absent) {
    const file = path.join(AI_CATALYST_DATA_DIR, rel);
    if (fs.existsSync(file)) fs.rmSync(file);
  }
  for (const [rel, contents] of Object.entries(snapshot.existing)) {
    fs.writeFileSync(path.join(AI_CATALYST_DATA_DIR, rel), contents);
  }
}

test.describe('AI Catalyst feed sync (local stub) @ai-catalyst', () => {
  // Shared backend storage forces in-order single-worker execution, but
  // unlike serial mode a failure here never skips the remaining tests.
  test.describe.configure({ mode: 'default' });

  let environment = null;
  let dataSnapshot = null;
  let stub = null;

  test.beforeAll(async ({ request }) => {
    dataSnapshot = snapshotDataState();
    const res = await request.get('/api/modules/ai-catalyst/config');
    environment = res.ok() ? await res.json() : null;
  });

  test.afterAll(() => {
    if (dataSnapshot) restoreDataState(dataSnapshot);
  });

  test.beforeEach(async () => {
    test.skip(
      !environment || environment.demoMode || !environment.configured,
      'feed sync tests need a writable (non-demo) backend with POC_EXPLORER_FEED_TOKEN configured',
    );
    stub = await startFeedStub();
  });

  test.afterEach(() => {
    if (stub && stub.server && stub.server.listening) stub.server.close();
  });

  // Seed helper: point the module at this test's own stub and run one
  // successful board sync, so every test starts from known state.
  async function seedSyncedBoard(request) {
    const saveRes = await request.post('/api/modules/ai-catalyst/board-config', {
      data: { feedUrl: stub.baseUrl },
    });
    expect(saveRes.ok()).toBe(true);
    stub.malformedBoards.clear();
    const syncRes = await request.post('/api/modules/ai-catalyst/sync');
    expect(syncRes.ok()).toBe(true);
    expect(await syncRes.json()).toMatchObject({ status: 'ok', synced: 1, total: 1, failed: [] });
  }

  test('should save the stub feed URL through the board config API', async ({ request }) => {
    const saveRes = await request.post('/api/modules/ai-catalyst/board-config', {
      data: { feedUrl: stub.baseUrl },
    });
    expect(saveRes.ok()).toBe(true);
    expect(await saveRes.json()).toEqual({ status: 'saved' });

    const configRes = await request.get('/api/modules/ai-catalyst/board-config');
    expect(await configRes.json()).toEqual({ feedUrl: stub.baseUrl });

    const statusRes = await request.get('/api/modules/ai-catalyst/config');
    expect(await statusRes.json()).toMatchObject({ configured: true, demoMode: false });
  });

  test('should sync boards from the local feed stub', async ({ request }) => {
    await seedSyncedBoard(request);

    const boardRequests = stub.requests.filter(r => r.path.includes('/feed/board.json'));
    expect(boardRequests).toHaveLength(1);
    expect(boardRequests[0].auth.startsWith('Bearer ')).toBe(true);
    expect(boardRequests[0].auth.length).toBeGreaterThan('Bearer '.length);

    const boardsRes = await request.get('/api/modules/ai-catalyst/boards');
    const { boards } = await boardsRes.json();
    const stubEntry = boards.find(b => b.month === STUB_BOARD_MONTH);
    expect(stubEntry).toMatchObject({ month: STUB_BOARD_MONTH, candidateCount: 2 });
    expect(stubEntry.lastSynced).toEqual(expect.any(String));
  });

  test('should expose persisted sync results through the module API', async ({ request }) => {
    await seedSyncedBoard(request);

    const res = await request.get(`/api/modules/ai-catalyst/boards/${STUB_BOARD_MONTH}`);
    expect(res.ok()).toBe(true);

    const data = await res.json();
    expect(data.month).toBe(STUB_BOARD_MONTH);
    expect(data.total).toBe(2);
    expect(data.candidates[0]).toMatchObject({
      title: 'Stub Board Candidate',
      uniqueId: 'org/stub-candidate',
      impactScore: 8.5,
      gpuRequired: true,
      hasDockerfile: true,
    });
  });

  test('should keep synced board data when the feed serves a malformed 200', async ({ request }) => {
    await seedSyncedBoard(request);

    const boardsBefore = await (await request.get('/api/modules/ai-catalyst/boards')).json();
    const entryBefore = boardsBefore.boards.find(b => b.month === STUB_BOARD_MONTH);

    stub.malformedBoards.add(`board-${STUB_BOARD_MONTH}`);
    // Ensure a re-stamped timestamp would differ from the one captured above.
    await new Promise(resolve => setTimeout(resolve, 25));

    const syncRes = await request.post('/api/modules/ai-catalyst/sync');
    expect(syncRes.ok()).toBe(true);
    const syncBody = await syncRes.json();
    expect(syncBody).toMatchObject({ status: 'ok', synced: 0, total: 1 });
    expect(syncBody.failed).toHaveLength(1);
    expect(syncBody.failed[0].board).toBe(`board-${STUB_BOARD_MONTH}`);
    expect(syncBody.failed[0].error).toContain('rows');

    const boardRes = await request.get(`/api/modules/ai-catalyst/boards/${STUB_BOARD_MONTH}`);
    expect(boardRes.ok()).toBe(true);
    const boardData = await boardRes.json();
    expect(boardData.total).toBe(2);
    expect(boardData.candidates.map(c => c.uniqueId)).toEqual(['org/stub-candidate', 'org/stub-candidate-2']);

    const boardsAfter = await (await request.get('/api/modules/ai-catalyst/boards')).json();
    const entryAfter = boardsAfter.boards.find(b => b.month === STUB_BOARD_MONTH);
    expect(entryAfter.candidateCount).toBe(2);
    expect(entryAfter.lastSynced).toBe(entryBefore.lastSynced);
  });

  test('should render synced board data in the monthly board view', async ({ page, request }) => {
    await seedSyncedBoard(request);

    setupErrorTracking(page);
    await page.goto('/#/ai-catalyst/board');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // The default month is whatever the index holds (newest first) — derive
    // it from the synced state instead of assuming local data, then pick the
    // month this test synced.
    const boards = await (await request.get('/api/modules/ai-catalyst/boards')).json();
    await expect(page.locator('select').first()).toHaveValue(boards.boards[0].month);
    await page.locator('select').first().selectOption(STUB_BOARD_MONTH);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    await expect(page.locator('main .grid h3').filter({ hasText: 'Stub Board Candidate' })).toBeVisible();
    await expect(page.locator('main .grid h3').filter({ hasText: 'Second Stub Candidate' })).toBeVisible();

    const appErrors = page.errors.filter(e => !/status of (429|404)/.test(e.message));
    expect(appErrors).toHaveLength(0);
    logCapturedErrors(page, { title: 'render synced board data' });
  });

  test('should sync the showcase from the stub and render it in the catalog', async ({ page }) => {
    setupErrorTracking(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const saveRes = await page.request.post('/api/modules/ai-catalyst/showcase/config', {
      data: { feedUrl: stub.baseUrl },
    });
    expect(saveRes.ok()).toBe(true);

    const refreshRes = await page.request.post('/api/modules/ai-catalyst/showcase/refresh');
    expect(refreshRes.ok()).toBe(true);
    expect(await refreshRes.json()).toMatchObject({ status: 'refreshed', entries: 5, pillars: 5 });
    expect(stub.requests.some(r => r.path.includes('/feed/showcase.json'))).toBe(true);

    const entriesRes = await page.request.get('/api/modules/ai-catalyst/showcase/entries');
    const entriesData = await entriesRes.json();
    expect(entriesData.entries.map(e => e.slug)).toContain('stub-synced-entry');

    const persisted = JSON.parse(fs.readFileSync(
      path.join(AI_CATALYST_DATA_DIR, 'showcase/showcase-data.json'), 'utf-8',
    ));
    expect(persisted.entries.map(e => e.slug)).toContain('stub-synced-entry');

    await page.goto('/#/ai-catalyst/catalog');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    await expect(page.locator('main .grid h3').filter({ hasText: 'Stub Synced Showcase Entry' })).toBeVisible();

    const appErrors = page.errors.filter(e => !/status of (429|404)/.test(e.message));
    expect(appErrors).toHaveLength(0);
    logCapturedErrors(page, { title: 'render synced showcase data' });
  });

  test('should reject feed URLs with unapproved origins before fetching', async ({ request }) => {
    const saveRes = await request.post('/api/modules/ai-catalyst/board-config', {
      data: { feedUrl: 'https://evil.example.test' },
    });
    expect(saveRes.ok()).toBe(true);

    const syncRes = await request.post('/api/modules/ai-catalyst/sync');
    expect(syncRes.status()).toBe(500);

    const body = await syncRes.json();
    expect(body.error).toContain('not an approved origin');
    expect(stub.requests).toHaveLength(0);
  });
});
