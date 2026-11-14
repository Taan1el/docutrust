import { describe, expect, it, vi } from 'vitest';
import { createUpdateController, updateReady, type ContainerLike, type RegistrationLike, type WorkerLike } from '../local/offline.js';

function worker(state = 'installing'): WorkerLike & { listeners: (() => void)[]; postMessage: ReturnType<typeof vi.fn>; state: string } {
  const listeners: (() => void)[] = [];
  return { state, listeners, postMessage: vi.fn(), addEventListener: (_type, listener) => { listeners.push(listener); } };
}

function setup(controller: unknown = {}) {
  const changes: (() => void)[] = [];
  const container: ContainerLike = { controller, addEventListener: (_type, listener) => { changes.push(listener); } };
  const registrationListeners: (() => void)[] = [];
  const registration: RegistrationLike = { waiting: null, installing: null, addEventListener: (_type, listener) => { registrationListeners.push(listener); } };
  const reload = vi.fn();
  return { updates: createUpdateController(container, reload), registration, registrationListeners, changes, reload, container };
}

describe('update notice state', () => {
  it('needs both a waiting worker and a controlling one', () => {
    expect(updateReady({}, {})).toBe(true);
    expect(updateReady(null, {})).toBe(false);
    expect(updateReady({}, null)).toBe(false);
    expect(updateReady(null, null)).toBe(false);
  });

  it('shows nothing on the first install, which has no controller to replace', () => {
    const { updates, registration, registrationListeners } = setup(null);
    registration.waiting = worker();
    updates.track(registration);
    expect(updates.getState().ready).toBe(false);
    expect(registrationListeners).toHaveLength(1);
  });

  it('is ready when a worker is already waiting at load', () => {
    const { updates, registration } = setup();
    registration.waiting = worker('installed');
    updates.track(registration);
    expect(updates.getState().ready).toBe(true);
  });

  it('becomes ready once a new worker finishes installing and tells subscribers', () => {
    const { updates, registration, registrationListeners } = setup();
    const listener = vi.fn();
    updates.subscribe(listener);
    updates.track(registration);
    expect(updates.getState().ready).toBe(false);
    const installing = worker('installing');
    registration.installing = installing;
    registrationListeners[0]();
    installing.state = 'installed';
    registration.waiting = installing;
    installing.listeners[0]();
    expect(updates.getState().ready).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not report ready for a worker that is still installing', () => {
    const { updates, registration, registrationListeners } = setup();
    updates.track(registration);
    const installing = worker('installing');
    registration.installing = installing;
    registrationListeners[0]();
    installing.listeners[0]();
    expect(updates.getState().ready).toBe(false);
  });

  it('asks the waiting worker to take over and reloads once when control changes', () => {
    const { updates, registration, changes, reload } = setup();
    const waiting = worker('installed');
    registration.waiting = waiting;
    updates.track(registration);
    expect(changes).toHaveLength(0);
    updates.activate();
    updates.activate();
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(changes).toHaveLength(1);
    expect(reload).not.toHaveBeenCalled();
    changes[0]();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does nothing when asked to activate without a waiting worker', () => {
    const { updates, changes } = setup();
    updates.activate();
    expect(changes).toHaveLength(0);
  });
});
