import { useSyncExternalStore } from 'react';

/** The part of a service worker the update flow uses. */
export interface WorkerLike {
  state?: string;
  postMessage(message: unknown): void;
  addEventListener(type: 'statechange', listener: () => void): void;
}

export interface RegistrationLike {
  waiting: WorkerLike | null;
  installing: WorkerLike | null;
  addEventListener(type: 'updatefound', listener: () => void): void;
}

export interface ContainerLike {
  controller: unknown;
  addEventListener(type: 'controllerchange', listener: () => void, options?: { once: boolean }): void;
}

export interface UpdateState {
  ready: boolean;
}

/**
 * A notice is due only when a new worker is waiting and an older one controls the page.
 * The very first install has no controller and nothing to replace.
 */
export function updateReady(waiting: unknown, controller: unknown): boolean {
  return Boolean(waiting) && Boolean(controller);
}

/**
 * Tracks a waiting worker and activates it only when the person asks.
 * The page reloads once, after the new worker takes control.
 */
export function createUpdateController(container: ContainerLike, reload: () => void) {
  let state: UpdateState = { ready: false };
  let waiting: WorkerLike | null = null;
  let requested = false;
  const listeners = new Set<() => void>();

  function check(registration: RegistrationLike): void {
    if (!updateReady(registration.waiting, container.controller) || state.ready) return;
    waiting = registration.waiting;
    state = { ready: true };
    listeners.forEach((listener) => listener());
  }

  return {
    track(registration: RegistrationLike): void {
      check(registration);
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        installing?.addEventListener('statechange', () => {
          if (installing.state === 'installed') check(registration);
        });
      });
    },
    activate(): void {
      if (!waiting) return;
      if (!requested) {
        requested = true;
        // Listen only after a request: the first install also changes the controller.
        container.addEventListener('controllerchange', reload, { once: true });
      }
      waiting.postMessage({ type: 'SKIP_WAITING' });
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    getState: (): UpdateState => state,
  };
}

const updates = typeof navigator !== 'undefined' && 'serviceWorker' in navigator
  ? createUpdateController(navigator.serviceWorker as unknown as ContainerLike, () => window.location.reload())
  : null;
const idle: UpdateState = { ready: false };

export function useUpdateState(): UpdateState {
  return useSyncExternalStore(
    (listener) => updates?.subscribe(listener) ?? (() => undefined),
    () => updates?.getState() ?? idle,
  );
}

export function activateUpdate(): void {
  updates?.activate();
}

export function registerOffline(): void {
  if (import.meta.env.MODE !== 'pages' || !('serviceWorker' in navigator)) return;

  const register = () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
    }).then((registration) => {
      updates?.track(registration as unknown as RegistrationLike);
    }).catch((error: unknown) => {
      console.error('Offline storage could not start.', error);
    });
  };

  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
