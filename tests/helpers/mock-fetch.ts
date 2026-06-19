/**
 * undici MockAgent wrapper for the node test project (#46).
 *
 * The reasoner suites used `fetchMock` from `cloudflare:test` to intercept the
 * AI Gateway HTTP calls. In the node project we use undici's MockAgent directly
 * -- it IS the same implementation `cloudflare:test` exposes, with the same
 * .get(origin).intercept({path,method}).reply(status, body, {headers}) surface
 * -- and wire it to Node's global fetch via setGlobalDispatcher.
 *
 * Usage mirrors the old cloudflare:test lifecycle:
 *   const fetchMock = installMockFetch();      // beforeAll
 *   fetchMock.activate(); fetchMock.disableNetConnect();   // beforeEach
 *   ... fetchMock.get(origin).intercept({...}).reply(...) ...
 *   fetchMock.assertNoPendingInterceptors();   // afterEach
 *   restoreMockFetch();                        // afterAll
 */

import { MockAgent, setGlobalDispatcher, getGlobalDispatcher, type Dispatcher } from 'undici';

let previousDispatcher: Dispatcher | null = null;
let agent: MockAgent | null = null;

/**
 * Create a MockAgent, route Node's global fetch through it, and return it. The
 * returned agent exposes get()/intercept()/reply()/disableNetConnect()/
 * assertNoPendingInterceptors() -- the same surface the suites used on
 * cloudflare:test's fetchMock. `activate()` is provided as a no-op shim (the
 * agent is active once installed) so existing call sites need no change.
 */
export function installMockFetch(): MockAgent & { activate(): void } {
  previousDispatcher = getGlobalDispatcher();
  agent = new MockAgent();
  setGlobalDispatcher(agent);
  const a = agent as MockAgent & { activate(): void };
  if (typeof a.activate !== 'function') {
    a.activate = () => {};
  }
  return a;
}

/** Restore the original global dispatcher (afterAll). */
export function restoreMockFetch(): void {
  if (previousDispatcher) {
    setGlobalDispatcher(previousDispatcher);
    previousDispatcher = null;
  }
  agent = null;
}
