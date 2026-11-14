// @vitest-environment node
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { build, resolveConfig } from 'vite';
import { LOCAL_CSP } from '../../localBuild.js';

const clientRoot = fileURLToPath(new URL('../../', import.meta.url));
let output: string;
let html: string;
let worker: string;
let files: string[];

async function listFiles(directory: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const results = await Promise.all(entries.map((entry) => entry.isDirectory()
    ? listFiles(path.join(directory, entry.name), `${prefix}${entry.name}/`)
    : [`${prefix}${entry.name}`]));
  return results.flat();
}

beforeAll(async () => {
  output = await mkdtemp(path.join(tmpdir(), 'docutrust-local-build-'));
  await build({ root: clientRoot, mode: 'pages', logLevel: 'silent', build: { outDir: output, emptyOutDir: true } });
  html = await readFile(path.join(output, 'index.html'), 'utf8');
  worker = await readFile(path.join(output, 'sw.js'), 'utf8');
  files = await listFiles(output);
}, 30_000);

afterAll(async () => {
  if (!output) return;
  const resolved = path.resolve(output);
  if (path.dirname(resolved) !== path.resolve(tmpdir()) || !path.basename(resolved).startsWith('docutrust-local-build-')) {
    throw new Error('Build test output is outside its temporary directory.');
  }
  await rm(resolved, { recursive: true, force: true });
});

describe('Pages local app build', () => {
  it('places the exact CSP before resources and uses no remote resources', () => {
    const content = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
    expect(content?.replaceAll('&#39;', "'")).toBe(LOCAL_CSP);
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('<script'));
    expect(html).not.toMatch(/(?:src|href|content)\s*=\s*["'](?:https?:)?\/\//i);
    expect(html).not.toContain('og:url');
    expect(html).toContain('data:image/svg+xml,');
  });

  it('keeps the Pages CSP plugin out of development', async () => {
    const config = await resolveConfig({ root: clientRoot, mode: 'development' }, 'serve');
    expect(config.plugins.some((plugin) => plugin.name === 'local-first-build')).toBe(false);
  });

  it('emits a standalone manifest and full-size PNG icons', async () => {
    const manifest = JSON.parse(await readFile(path.join(output, 'manifest.webmanifest'), 'utf8'));
    expect(manifest).toMatchObject({ start_url: '/docutrust/', scope: '/docutrust/', display: 'standalone', theme_color: '#efe9dc', background_color: '#efe9dc' });
    for (const size of [192, 512]) {
      expect(manifest.icons).toContainEqual({ src: `/docutrust/icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any maskable' });
      const icon = await readFile(path.join(output, `icon-${size}.png`));
      expect(icon.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(icon.readUInt32BE(16)).toBe(size);
      expect(icon.readUInt32BE(20)).toBe(size);
    }
  });

  it('precaches every emitted file, fonts, its worker and the base page', () => {
    const match = worker.match(/const PRECACHE = (\[[^;]+\]);/);
    expect(match).not.toBeNull();
    const precache: string[] = JSON.parse(match![1]);
    expect(precache).toContain('/docutrust/');
    for (const file of files) expect(precache).toContain(`/docutrust/${file}`);
    expect(precache.some((file) => file.endsWith('.woff2'))).toBe(true);

    expect(precache).toContain('/docutrust/manifest.webmanifest');
    expect(precache).toContain('/docutrust/sw.js');
    expect(worker).toMatch(/const CACHE_NAME = CACHE_PREFIX \+ "[0-9a-f]{16}";/);
    expect(worker).toContain('const CACHE_PREFIX = "docutrust-offline-_docutrust_-";');
  });

  it('emits every font as a file allowed by the policy', async () => {
    for (const file of files.filter((name) => name.endsWith('.css'))) {
      expect(await readFile(path.join(output, file), 'utf8')).not.toMatch(/url\(["']?data:/i);
    }
  });

  function runWorker(overrides: Record<string, unknown> = {}) {
    const handlers: Record<string, (event: unknown) => void> = {};
    const match = worker.match(/const CACHE_PREFIX = ("[^;]+);/);
    const prefix: string = JSON.parse(match![1]);
    const deleted: string[] = [];
    const cachedResponse = { body: 'cached page' };
    const cache = {
      addAll: vi.fn(async (_requests: unknown[]) => undefined),
      match: vi.fn(async (_request: unknown, _options?: unknown): Promise<unknown> => cachedResponse),
    };
    const skipWaiting = vi.fn(async () => undefined);
    const fetchNetwork = vi.fn(async (_request: unknown, _init?: unknown): Promise<unknown> => { throw new Error('Server is off.'); });
    const context: Record<string, unknown> = {
      URL,
      Request: class { constructor(public url: string, public init: unknown) {} },
      caches: { open: async () => cache, keys: async () => [`${prefix}old`, 'another-app-cache'], delete: async (key: string) => { deleted.push(key); } },
      fetch: fetchNetwork,
      self: { location: { origin: 'https://local.test' }, addEventListener: (name: string, callback: (event: unknown) => void) => { handlers[name] = callback; }, skipWaiting, clients: { claim: async () => undefined } },
      ...overrides,
    };
    vm.runInNewContext(worker, context);
    return { handlers, prefix, deleted, cache, cachedResponse, skipWaiting, fetchNetwork, context };
  }

  function respond(handlers: Record<string, (event: unknown) => void>, url: string, mode: string): Promise<unknown> | undefined {
    let response: Promise<unknown> | undefined;
    handlers.fetch({ request: { method: 'GET', url, mode }, respondWith: (result: Promise<unknown>) => { response = result; } });
    return response;
  }

  it('chooses network-first for pages, cache-first for built files and ignores everything else', () => {
    const { context } = runWorker();
    const choose = context.strategyFor as (request: unknown) => string;
    expect(choose({ method: 'GET', url: 'https://local.test/docutrust/', mode: 'navigate' })).toBe('network-first');
    expect(choose({ method: 'GET', url: 'https://local.test/docutrust/assets/app.js', mode: 'cors' })).toBe('cache-first');
    expect(choose({ method: 'POST', url: 'https://local.test/docutrust/', mode: 'navigate' })).toBe('ignore');
    expect(choose({ method: 'GET', url: 'https://outside.test/docutrust/', mode: 'navigate' })).toBe('ignore');
    expect(choose({ method: 'GET', url: 'https://local.test/another-app/', mode: 'navigate' })).toBe('ignore');
  });

  it('precaches every file with requests that bypass the HTTP cache', async () => {
    const { handlers, cache } = runWorker();
    let installation: Promise<void> | undefined;
    handlers.install({ waitUntil: (result: Promise<void>) => { installation = result; } });
    await installation;
    const requests = cache.addAll.mock.calls[0][0] as { url: string; init: { cache: string } }[];
    expect(requests.length).toBeGreaterThan(5);
    expect(requests.every((request) => request.init.cache === 'reload')).toBe(true);
    expect(requests.map((request) => request.url)).toContain('/docutrust/');
  });

  it('serves a page from the network when online and from the cache when offline', async () => {
    const online = runWorker();
    const fresh = { body: 'fresh page' };
    online.fetchNetwork.mockResolvedValueOnce(fresh);
    expect(await respond(online.handlers, 'https://local.test/docutrust/', 'navigate')).toBe(fresh);
    expect(online.fetchNetwork.mock.calls[0][1]).toEqual({ cache: 'no-cache' });
    expect(online.cache.match).not.toHaveBeenCalled();

    const offline = runWorker();
    expect(await respond(offline.handlers, 'https://local.test/docutrust/', 'navigate')).toBe(offline.cachedResponse);
    expect(offline.fetchNetwork).toHaveBeenCalledTimes(1);
  });

  it('falls back to the cached index page for an unknown page while offline', async () => {
    const offline = runWorker();
    offline.cache.match.mockImplementation(async (request: unknown) => typeof request === 'string' ? offline.cachedResponse : undefined);
    expect(await respond(offline.handlers, 'https://local.test/docutrust/missing?x=1', 'navigate')).toBe(offline.cachedResponse);
  });

  it('serves built files from the cache without touching the network', async () => {
    const worker = runWorker();
    expect(await respond(worker.handlers, 'https://local.test/docutrust/assets/app.js', 'cors')).toBe(worker.cachedResponse);
    expect(worker.fetchNetwork).not.toHaveBeenCalled();
  });

  it('does not respond to other origins, other apps or non-GET requests', () => {
    const { handlers } = runWorker();
    const forbidden = vi.fn();
    for (const url of ['https://outside.test/docutrust/', 'https://local.test/another-app/']) {
      handlers.fetch({ request: { method: 'GET', url, mode: 'navigate' }, respondWith: forbidden });
    }
    handlers.fetch({ request: { method: 'POST', url: 'https://local.test/docutrust/', mode: 'navigate' }, respondWith: forbidden });
    expect(forbidden).not.toHaveBeenCalled();
  });

  it('waits for the page before activating and then skips waiting on request', async () => {
    const { handlers, skipWaiting } = runWorker();
    let installation: Promise<void> | undefined;
    handlers.install({ waitUntil: (result: Promise<void>) => { installation = result; } });
    await installation;
    expect(skipWaiting).not.toHaveBeenCalled();
    handlers.message({ data: { type: 'something-else' } });
    handlers.message({ data: null });
    expect(skipWaiting).not.toHaveBeenCalled();
    handlers.message({ data: { type: 'SKIP_WAITING' } });
    expect(skipWaiting).toHaveBeenCalledTimes(1);
  });

  it("deletes only this app's older caches when it activates", async () => {
    const { handlers, deleted, prefix } = runWorker();
    let activation: Promise<void> | undefined;
    handlers.activate({ waitUntil: (result: Promise<void>) => { activation = result; } });
    await activation;
    expect(deleted).toEqual([`${prefix}old`]);
  });
});
