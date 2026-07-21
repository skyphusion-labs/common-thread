/**
 * undici MockAgent shim for the node test project (#46).
 *
 * The hybrid suites used `fetchMock` from `cloudflare:test` to intercept AI
 * Gateway calls. In the node project there is no `cloudflare:test`, so this
 * exposes the same small surface those suites (and helpers/llm.ts) depend on,
 * backed by undici's MockAgent installed as the global dispatcher.
 *
 * Node's global `fetch` is undici, so `setGlobalDispatcher(mockAgent)` makes
 * intercepts apply to the exact `fetch(url, ...)` calls the reasoner makes.
 * Interceptors are single-shot by default (like the cloudflare fetchMock),
 * so a suite queues one intercept per expected call and asserts none dangle.
 */

import {
  MockAgent,
  fetch as undiciFetch,
  setGlobalDispatcher,
  getGlobalDispatcher,
  type Dispatcher,
  type Interceptable,
} from 'undici';

let agent: MockAgent | null = null;
let previousDispatcher: Dispatcher | null = null;
let previousFetch: typeof globalThis.fetch | undefined;

/** Activate interception: install a fresh MockAgent as the global dispatcher. */
function activate(): void {
  if (agent) return;
  previousDispatcher = getGlobalDispatcher();
  previousFetch = globalThis.fetch;
  agent = new MockAgent();
  setGlobalDispatcher(agent);
  // Node 22's bundled fetch can ignore npm undici 8's global dispatcher; route
  // through the same undici build that owns MockAgent so intercepts apply.
  globalThis.fetch = undiciFetch as typeof fetch;
}

/** Fail (rather than hit the network) on any un-intercepted request. */
function disableNetConnect(): void {
  agent?.disableNetConnect();
}

/** Get the mock pool for an origin so a caller can .intercept(...).reply(...). */
function get(origin: string): Interceptable {
  if (!agent) {
    throw new Error('fetchMock.get() called before fetchMock.activate()');
  }
  return agent.get(origin);
}

/** Throw if any queued interceptor was never consumed. */
function assertNoPendingInterceptors(): void {
  agent?.assertNoPendingInterceptors();
}

/** Restore the dispatcher that was installed before activate(). */
function deactivate(): void {
  if (previousDispatcher) {
    setGlobalDispatcher(previousDispatcher);
  }
  if (previousFetch) {
    globalThis.fetch = previousFetch;
  }
  agent = null;
  previousDispatcher = null;
  previousFetch = undefined;
}

export const fetchMock = {
  activate,
  disableNetConnect,
  get,
  assertNoPendingInterceptors,
  deactivate,
};
