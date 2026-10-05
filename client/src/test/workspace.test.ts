// @vitest-environment node
import { forceCloseDatabase, IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { File } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.stubGlobal('indexedDB', new IDBFactory());
});

describe('browser workspace storage', () => {
  it('starts in sample mode with no workspace', async () => {
    const storage = await import('../local/workspace.js');
    expect(await storage.loadWorkspace()).toBeNull();
    expect(await storage.loadMode()).toBe('sample');
  });

  it('persists workspace and mode across a module reload', async () => {
    let storage = await import('../local/workspace.js');
    const data = { version: 1, bundles: [{ filename: 'record.bin', signatures: ['synthetic'] }] };
    await storage.saveWorkspace(data, { mode: 'workspace' });
    vi.resetModules();
    storage = await import('../local/workspace.js');
    expect(await storage.loadWorkspace<typeof data>()).toEqual(data);
    expect(await storage.loadMode()).toBe('workspace');
  });

  it('keeps sample selection independent from workspace data', async () => {
    const storage = await import('../local/workspace.js');
    await storage.saveWorkspace({ rows: [1, 2] }, { mode: 'workspace' });
    await storage.saveMode('sample');
    expect(await storage.loadWorkspace()).toEqual({ rows: [1, 2] });
    await storage.saveMode('workspace');
    await storage.clearWorkspace();
    expect(await storage.loadWorkspace()).toBeNull();
    expect(await storage.loadMode()).toBe('workspace');
  });

  it('preserves a non-extractable signing key through storage and module reload', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const { createIdentity, signFile, verifyFile } = await import('../local/signatures.js');
    const identity = await createIdentity('Synthetic signer');
    let storage = await import('../local/workspace.js');
    await storage.saveWorkspace({ version: 1, identity, bundles: [] });
    vi.resetModules();
    storage = await import('../local/workspace.js');
    const restored = await storage.loadWorkspace<{ identity: typeof identity }>();
    expect(restored?.identity.privateKey.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('jwk', restored!.identity.privateKey)).rejects.toThrow();
    const file = new File([new Uint8Array([0, 255, 128])], 'record.bin') as unknown as globalThis.File;
    const bundle = await signFile(file, restored!.identity);
    expect(await verifyFile(file, bundle)).toMatchObject({ matchesFile: true, signatures: [{ valid: true }] });
  });

  it('atomically rejects an older tab without overwriting a newer signing key', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const { createIdentity } = await import('../local/signatures.js');
    const storageA = await import('../local/workspace.js');
    const first = await createIdentity('First key');
    await storageA.saveWorkspace({ identity: first, bundles: [] });
    const snapshotA = await storageA.loadWorkspaceSnapshot();
    vi.resetModules();
    const storageB = await import('../local/workspace.js');
    const second = await createIdentity('Second key');
    const snapshotB = await storageB.loadWorkspaceSnapshot();
    await storageB.saveWorkspace({ identity: second, bundles: [] }, { expectedRevision: snapshotB.revision });
    await expect(storageA.saveWorkspace({ identity: first, bundles: ['stale'] }, { expectedRevision: snapshotA.revision, mode: 'workspace' }))
      .rejects.toThrow('changed in another tab');
    const saved = await storageB.loadWorkspace<{ identity: typeof second; bundles: string[] }>();
    expect(saved?.identity.publicKeyJwk).toEqual(second.publicKeyJwk);
    expect(saved?.identity.privateKey.extractable).toBe(false);
    expect(saved?.bundles).toEqual([]);
    expect(await storageB.loadMode()).toBe('sample');
  });

  it('allows only one concurrent writer at an expected revision', async () => {
    const storageA = await import('../local/workspace.js');
    vi.resetModules();
    const storageB = await import('../local/workspace.js');
    const results = await Promise.allSettled([
      storageA.saveWorkspace({ writer: 'A' }, { expectedRevision: 0 }),
      storageB.saveWorkspace({ writer: 'B' }, { expectedRevision: 0 }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((await storageA.loadWorkspaceSnapshot()).revision).toBe(1);
  });

  it('never reuses an earlier revision after clearing and recreating a workspace', async () => {
    const storage = await import('../local/workspace.js');
    const oldRevision = await storage.saveWorkspace({ name: 'old' });
    await storage.clearWorkspace();
    expect(await storage.loadWorkspace()).toBeNull();
    await storage.saveWorkspace({ name: 'new' });
    await expect(storage.saveWorkspace({ name: 'stale' }, { expectedRevision: oldRevision })).rejects.toThrow('changed in another tab');
    expect(await storage.loadWorkspace()).toEqual({ name: 'new' });
  });

  it('orders overlapping writes and snapshots input at the call', async () => {
    const storage = await import('../local/workspace.js');
    const firstData = { rows: [1] };
    const firstWrite = storage.saveWorkspace(firstData);
    firstData.rows.push(99);
    expect(await storage.loadWorkspace()).toEqual({ rows: [1] });
    const secondWrite = storage.saveWorkspace({ rows: [2] });
    const clear = storage.clearWorkspace();
    const lastWrite = storage.saveWorkspace({ rows: [3] });
    const modeWrite = storage.saveMode('workspace');
    expect(await storage.loadWorkspace()).toEqual({ rows: [3] });
    await Promise.all([firstWrite, secondWrite, clear, lastWrite, modeWrite]);
    expect(await storage.loadMode()).toBe('workspace');
  });

  it('retains saved data after a failed transaction and accepts a later write', async () => {
    const storage = await import('../local/workspace.js');
    await storage.saveWorkspace({ rows: ['saved'] });
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(function (this: IDBObjectStore, ...args) {
      const request = put.apply(this, args);
      this.transaction.abort();
      return request;
    });
    await expect(storage.saveWorkspace({ rows: ['failed'] })).rejects.toThrow();
    expect(await storage.loadWorkspace()).toEqual({ rows: ['saved'] });
    await storage.saveWorkspace({ rows: ['recovered'] });
    expect(await storage.loadWorkspace()).toEqual({ rows: ['recovered'] });
  });

  it('rolls back workspace and mode together when either write fails', async () => {
    const storage = await import('../local/workspace.js');
    await storage.saveWorkspace({ rows: ['saved'] }, { mode: 'sample' });
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (args[1] === 'mode') throw new DOMException('Browser storage is full.', 'QuotaExceededError');
      return put.apply(this, args);
    });
    await expect(storage.saveWorkspace({ rows: ['failed'] }, { mode: 'workspace' })).rejects.toThrow('Browser storage is full.');
    expect(await storage.loadWorkspace()).toEqual({ rows: ['saved'] });
    expect(await storage.loadMode()).toBe('sample');
  });

  it('rejects uncloneable input without replacing saved data', async () => {
    const storage = await import('../local/workspace.js');
    await storage.saveWorkspace({ rows: ['saved'] });
    await expect(storage.saveWorkspace({ callback: () => undefined })).rejects.toThrow();
    expect(await storage.loadWorkspace()).toEqual({ rows: ['saved'] });
  });

  it('reopens browser storage after an unexpected connection close', async () => {
    const open = vi.spyOn(indexedDB, 'open');
    const storage = await import('../local/workspace.js');
    await storage.saveWorkspace({ rows: ['saved'] });
    forceCloseDatabase(open.mock.results[0].value.result);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(await storage.loadWorkspace()).toEqual({ rows: ['saved'] });
    await storage.saveWorkspace({ rows: ['recovered'] });
    expect(await storage.loadWorkspace()).toEqual({ rows: ['recovered'] });
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('rejects an unsupported saved record and permits explicit replacement', async () => {
    const open = vi.spyOn(indexedDB, 'open');
    const storage = await import('../local/workspace.js');
    await storage.saveWorkspace({ rows: ['saved'] });
    const database: IDBDatabase = open.mock.results[0].value.result;
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('settings', 'readwrite');
      transaction.objectStore('settings').put({ version: 99, data: { rows: ['unsupported'] } }, 'workspace');
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
    });
    await expect(storage.loadWorkspace()).rejects.toThrow('unsupported format');
    await storage.saveWorkspace({ rows: ['recovered'] }, { mode: 'workspace' });
    expect(await storage.loadWorkspace()).toEqual({ rows: ['recovered'] });
    expect(await storage.loadMode()).toBe('workspace');
  });
});
