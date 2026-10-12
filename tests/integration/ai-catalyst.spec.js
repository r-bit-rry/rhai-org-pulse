const { test, expect } = require('@playwright/test');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { DEFAULT_PAGE_WAIT_TIME } = require('./constants');
const { setupErrorTracking, logCapturedErrors, pageHasContent, pageLoadComplete, mainContentIsVisible } = require('./helpers');

/**
 * Integration tests for AI Catalyst module (includes Showcase)
 *
 * These tests verify:
 * - Module loads and renders correctly
 * - Catalog view displays entries and filters
 * - Detail view navigates and renders entry content
 * - API endpoints return expected data
 *
 * The "feed sync" suite runs the real sync flow against a local feed stub
 * (plain HTTP server on an ephemeral loopback port). It requires a writable
 * backend: `POC_EXPLORER_FEED_TOKEN=<any value> npm run dev:server` without
 * DEMO_MODE. Against demo-mode deployments (read-only fixture storage) the
 * suite skips itself via the /config probe.
 *
 * Tag: @ai-catalyst
 * Usage: npx playwright test --grep @ai-catalyst
 */

test.describe('AI Catalyst Module @ai-catalyst', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('should be visible in sidebar navigation', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const moduleNav = page.locator('aside nav').filter({ hasText: 'AI Catalyst' });
    const count = await moduleNav.count();
    expect(count).toBeGreaterThan(0);

    const moduleLink = moduleNav.first();
    await expect(moduleLink).toBeVisible();

    const appErrors = page.errors.filter(e => !/status of (429|404)/.test(e.message));
    expect(appErrors).toHaveLength(0);
  });

  test('should navigate to catalog view when clicked', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const moduleHeader = page.locator('aside nav button').filter({ hasText: 'AI Catalyst' }).first();
    await moduleHeader.click();
    await page.waitForTimeout(500);

    const viewLink = page.locator('aside nav button').filter({ hasText: 'Catalog' }).first();
    await viewLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(page.url()).toMatch(/ai-catalyst\/catalog/);

    const mainContentVisible = await mainContentIsVisible(page);
    expect(mainContentVisible).toBe(true);

    const appErrors = page.errors.filter(e => !/status of (429|404)/.test(e.message));
    expect(appErrors).toHaveLength(0);
  });

  test('should expose the September board and its data science candidates', async ({ page }) => {
    await page.goto('/#/ai-catalyst/board');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const heading = page.locator('h1').filter({ hasText: 'Monthly Board' });
    await expect(heading).toBeVisible();

    const monthSelect = page.locator('select').first();
    await expect(monthSelect).toHaveValue('2026-09');

    const dataScienceFilter = page.locator('button').filter({ hasText: 'Data Science' }).first();
    await expect(dataScienceFilter).toBeVisible();
    await dataScienceFilter.click();

    const cards = page.locator('main .grid h3');
    await expect(cards).toHaveCount(18);

    const appErrors = page.errors.filter(e => !/status of (429|404)/.test(e.message));
    expect(appErrors).toHaveLength(0);
  });
});

test.describe('AI Catalyst Catalog @ai-catalyst', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('should display entries in card grid', async ({ page }) => {
    await page.goto('/#/ai-catalyst/catalog');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const hasContent = await pageHasContent(page);
    expect(hasContent).toBe(true);

    const pageHasFinishedLoading = await pageLoadComplete(page);
    expect(pageHasFinishedLoading).toBe(true);

    const heading = page.locator('h1').filter({ hasText: 'AI Catalyst Showcase' });
    await expect(heading).toBeVisible();

    const cards = page.locator('main .grid .rounded-xl');
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThan(0);
    console.log(`Catalog card count: ${cardCount}`);

    const appErrors = page.errors.filter(e => !/status of (429|404)/.test(e.message));
    expect(appErrors).toHaveLength(0);
  });

  test('should display pillar filter tiles', async ({ page }) => {
    await page.goto('/#/ai-catalyst/catalog');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const allPillarsButton = page.locator('button').filter({ hasText: 'All Pillars' });
    await expect(allPillarsButton).toBeVisible();

    const appErrors = page.errors.filter(e => !/status of (429|404)/.test(e.message));
    expect(appErrors).toHaveLength(0);
  });

  test('should have search and filter controls', async ({ page }) => {
    await page.goto('/#/ai-catalyst/catalog');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const searchInput = page.locator('input[placeholder="Search projects..."]');
    await expect(searchInput).toBeVisible();

    const needFilter = page.locator('select').filter({ hasText: 'All customer needs' });
    await expect(needFilter).toBeVisible();

    const capFilter = page.locator('select').filter({ hasText: 'All capabilities' });
    await expect(capFilter).toBeVisible();

    const appErrors = page.errors.filter(e => !/status of (429|404)/.test(e.message));
    expect(appErrors).toHaveLength(0);
  });

  test('should navigate to detail view on card click', async ({ page }) => {
    await page.goto('/#/ai-catalyst/catalog');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const firstCardTitle = page.locator('main .grid h3').first();
    await firstCardTitle.click();
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(page.url()).toMatch(/ai-catalyst\/showcase-detail\?slug=/);

    const backButton = page.locator('button').filter({ hasText: 'Back to catalog' });
    await expect(backButton).toBeVisible();

    const appErrors = page.errors.filter(e => !/status of (429|404)/.test(e.message));
    expect(appErrors).toHaveLength(0);
  });
});

test.describe('AI Catalyst Showcase API @ai-catalyst', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('should return entries from API', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const response = await page.request.get('/api/modules/ai-catalyst/showcase/entries');
    expect(response.ok()).toBe(true);

    const data = await response.json();
    expect(data).toHaveProperty('entries');
    expect(data).toHaveProperty('pillars');
    expect(data).toHaveProperty('totalEntries');
    expect(data.entries.length).toBeGreaterThan(0);
    expect(data.pillars.length).toBeGreaterThan(0);
    console.log(`API returned ${data.totalEntries} entries, ${data.pillars.length} pillars`);
  });

  test('should include the data science pillar metadata', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const response = await page.request.get('/api/modules/ai-catalyst/showcase/entries');
    expect(response.ok()).toBe(true);

    const data = await response.json();
    const pillar = data.pillars.find(p => p.pillarKey === 'data-science-engineering');
    expect(pillar).toMatchObject({
      title: 'Data Science & Data Engineering',
      shortTitle: 'Data Science',
      sortOrder: 50,
      color: '#06b6d4'
    });
  });
});

test.describe('AI Catalyst Monthly Board API @ai-catalyst', () => {
  test('should return the complete September board with data science results', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const response = await page.request.get('/api/modules/ai-catalyst/boards/2026-09');
    expect(response.ok()).toBe(true);

    const data = await response.json();
    expect(data.month).toBe('2026-09');
    expect(data.total).toBe(145);
    expect(data.candidates).toHaveLength(145);
    expect(new Set(data.candidates.map(candidate => candidate.category))).toEqual(new Set([
      'agentic-ai',
      'management-observability-security',
      'model-inference',
      'model-customization',
      'data-science-engineering'
    ]));
    expect(data.candidates.filter(candidate => candidate.category === 'data-science-engineering')).toHaveLength(18);
    expect(data.candidates.every(candidate => candidate.impactScore != null)).toBe(true);

    const juneResponse = await page.request.get('/api/modules/ai-catalyst/boards/2026-06');
    expect(juneResponse.ok()).toBe(true);

    const juneData = await juneResponse.json();
    expect(new Set(juneData.pillars.map(pillar => pillar.pillarKey))).toEqual(new Set([
      'agentic-ai',
      'management-observability-security',
      'model-inference',
      'model-customization'
    ]));
    expect(juneData.pillars.some(pillar => pillar.pillarKey === 'data-science-engineering')).toBe(false);
  });
});

test.describe('AI Catalyst Report @ai-catalyst', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('should navigate to report view', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const moduleHeader = page.locator('aside nav button').filter({ hasText: 'AI Catalyst' }).first();
    await moduleHeader.click();
    await page.waitForTimeout(500);

    const reportLink = page.locator('aside nav button').filter({ hasText: 'Report' }).first();
    await reportLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(page.url()).toMatch(/ai-catalyst\/report/);

    const mainContentVisible = await mainContentIsVisible(page);
    expect(mainContentVisible).toBe(true);

    const appErrors = page.errors.filter(e => !/status of (429|404)/.test(e.message));
    expect(appErrors).toHaveLength(0);
  });

  test('should display report heading and charts', async ({ page }) => {
    await page.goto('/#/ai-catalyst/report');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const heading = page.locator('h1').filter({ hasText: 'Monthly Report' });
    await expect(heading).toBeVisible();

    const pageHasFinishedLoading = await pageLoadComplete(page);
    expect(pageHasFinishedLoading).toBe(true);

    const scatterChart = page.locator('[data-testid="scatter-chart"]');
    await expect(scatterChart).toBeVisible();

    const highlightCards = page.locator('[data-testid="highlight-card"]');
    const cardCount = await highlightCards.count();
    expect(cardCount).toBe(4);

    const appErrors = page.errors.filter(e => !/status of (429|404)/.test(e.message));
    expect(appErrors).toHaveLength(0);
  });

  test('should display distribution charts', async ({ page }) => {
    await page.goto('/#/ai-catalyst/report');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const pageHasFinishedLoading = await pageLoadComplete(page);
    expect(pageHasFinishedLoading).toBe(true);

    const donut = page.locator('[data-testid="category-donut"]');
    await expect(donut).toBeVisible();

    const sourceBar = page.locator('[data-testid="source-bar"]');
    await expect(sourceBar).toBeVisible();

    const languageBar = page.locator('[data-testid="language-bar"]');
    await expect(languageBar).toBeVisible();

    const appErrors = page.errors.filter(e => !/status of (429|404)/.test(e.message));
    expect(appErrors).toHaveLength(0);
  });

  test('should label the data science category in the September report', async ({ page }) => {
    await page.goto('/#/ai-catalyst/report');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const heading = page.locator('h1').filter({ hasText: 'Monthly Report' });
    await expect(heading).toBeVisible();
    await expect(page.locator('select').first()).toHaveValue('2026-09');

    const report = page.locator('main');
    await expect(report).toContainText('Data Science');
    await expect(report.locator('[data-testid="category-donut"]')).toBeVisible();
  });
});

test.describe('AI Catalyst Catalog pillars @ai-catalyst', () => {
  test('should expose the new pillar even before showcase entries are added', async ({ page }) => {
    await page.goto('/#/ai-catalyst/catalog');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const dataScienceTile = page.locator('button').filter({ hasText: 'Data Science' }).first();
    await expect(dataScienceTile).toBeVisible();

    await dataScienceTile.click();
    await expect(page.locator('main')).toContainText('No projects match your filters.');
  });
});

// ─── Feed sync against a local stub ─────────────────────────────────────
//
// Covers the POC Explorer feed integration end to end: configuration via the
// settings surface, successful sync, persisted API results, failure
// preservation, rendering of synced data, and destination validation.

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
// with the "No projects match your filters" test above.
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
  test.describe.configure({ mode: 'serial' });

  let stub = null;
  let environment = null;
  let dataSnapshot = null;

  test.beforeAll(async ({ request }) => {
    stub = await startFeedStub();
    dataSnapshot = snapshotDataState();
    const res = await request.get('/api/modules/ai-catalyst/config');
    environment = res.ok() ? await res.json() : null;
  });

  test.afterAll(() => {
    if (stub && stub.server) stub.server.close();
    if (dataSnapshot) restoreDataState(dataSnapshot);
  });

  test.beforeEach(() => {
    test.skip(
      !environment || environment.demoMode || !environment.configured,
      'feed sync tests need a writable (non-demo) backend with POC_EXPLORER_FEED_TOKEN configured',
    );
  });

  test('should save the stub feed URL through the settings surface', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const saveRes = await page.request.post('/api/modules/ai-catalyst/board-config', {
      data: { feedUrl: stub.baseUrl },
    });
    expect(saveRes.ok()).toBe(true);
    expect(await saveRes.json()).toEqual({ status: 'saved' });

    const configRes = await page.request.get('/api/modules/ai-catalyst/board-config');
    expect(await configRes.json()).toEqual({ feedUrl: stub.baseUrl });

    const statusRes = await page.request.get('/api/modules/ai-catalyst/config');
    expect(await statusRes.json()).toMatchObject({ configured: true, demoMode: false });
  });

  test('should sync boards from the local feed stub', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const syncRes = await page.request.post('/api/modules/ai-catalyst/sync');
    expect(syncRes.ok()).toBe(true);
    expect(await syncRes.json()).toMatchObject({
      status: 'ok', synced: 1, total: 1, failed: [],
    });

    const boardRequests = stub.requests.filter(r => r.path.includes('/feed/board.json'));
    expect(boardRequests).toHaveLength(1);
    expect(boardRequests[0].auth.startsWith('Bearer ')).toBe(true);
    expect(boardRequests[0].auth.length).toBeGreaterThan('Bearer '.length);

    const boardsRes = await page.request.get('/api/modules/ai-catalyst/boards');
    const { boards } = await boardsRes.json();
    const stubEntry = boards.find(b => b.month === STUB_BOARD_MONTH);
    expect(stubEntry).toMatchObject({ month: STUB_BOARD_MONTH, candidateCount: 2 });
    expect(stubEntry.lastSynced).toEqual(expect.any(String));
  });

  test('should expose persisted sync results through the module API', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const res = await page.request.get(`/api/modules/ai-catalyst/boards/${STUB_BOARD_MONTH}`);
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

  test('should keep synced board data when the feed serves a malformed 200', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const boardsBefore = await (await page.request.get('/api/modules/ai-catalyst/boards')).json();
    const entryBefore = boardsBefore.boards.find(b => b.month === STUB_BOARD_MONTH);

    stub.malformedBoards.add(`board-${STUB_BOARD_MONTH}`);
    // Ensure a re-stamped timestamp would differ from the one captured above.
    await page.waitForTimeout(25);

    const syncRes = await page.request.post('/api/modules/ai-catalyst/sync');
    expect(syncRes.ok()).toBe(true);
    const syncBody = await syncRes.json();
    expect(syncBody).toMatchObject({ status: 'ok', synced: 0, total: 1 });
    expect(syncBody.failed).toHaveLength(1);
    expect(syncBody.failed[0].board).toBe(`board-${STUB_BOARD_MONTH}`);
    expect(syncBody.failed[0].error).toContain('rows');

    const boardRes = await page.request.get(`/api/modules/ai-catalyst/boards/${STUB_BOARD_MONTH}`);
    expect(boardRes.ok()).toBe(true);
    const boardData = await boardRes.json();
    expect(boardData.total).toBe(2);
    expect(boardData.candidates.map(c => c.uniqueId)).toEqual(['org/stub-candidate', 'org/stub-candidate-2']);

    const boardsAfter = await (await page.request.get('/api/modules/ai-catalyst/boards')).json();
    const entryAfter = boardsAfter.boards.find(b => b.month === STUB_BOARD_MONTH);
    expect(entryAfter.candidateCount).toBe(2);
    expect(entryAfter.lastSynced).toBe(entryBefore.lastSynced);

    stub.malformedBoards.delete(`board-${STUB_BOARD_MONTH}`);
  });

  test('should render synced board data in the monthly board view', async ({ page }) => {
    setupErrorTracking(page);
    await page.goto('/#/ai-catalyst/board');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // The newest fixture board stays the default; pick the stub's month explicitly.
    await expect(page.locator('select').first()).toHaveValue('2026-09');
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

  test('should reject feed URLs with unapproved origins before fetching', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const saveRes = await page.request.post('/api/modules/ai-catalyst/board-config', {
      data: { feedUrl: 'https://evil.example.test' },
    });
    expect(saveRes.ok()).toBe(true);

    const requestsBefore = stub.requests.length;
    const syncRes = await page.request.post('/api/modules/ai-catalyst/sync');
    expect(syncRes.status()).toBe(500);

    const body = await syncRes.json();
    expect(body.error).toContain('not an approved origin');
    expect(stub.requests.length).toBe(requestsBefore);
  });
});
