import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

/**
 * Hosted maintenance is a web-worker flag. The public page must not offer
 * Create, and a Worker GET / 200 must not read as a healthy backend.
 * Self-host leaves the flag unset.
 */

const source = readFileSync(new URL('../../web/worker.js', import.meta.url), 'utf8');
const workerScript = source.replace(
  'export default {',
  'globalThis.__renderHtml = renderHtml; globalThis.__renderAppJs = renderAppJs; const __workerExport = {'
);

function loadWorker(): {
  __renderHtml: (env: Record<string, string | undefined>) => string;
  __renderAppJs: (env: Record<string, string | undefined>) => string;
} {
  const context = {
    console,
    URL,
    Response,
    fetch() {
      throw new Error('worker fetch');
    },
  };
  createContext(context);
  runInContext(workerScript, context, { filename: 'web/worker.js' });
  return context as {
    __renderHtml: (env: Record<string, string | undefined>) => string;
    __renderAppJs: (env: Record<string, string | undefined>) => string;
  };
}

function runApp(js: string): {
  calls: string[];
  checkHealth: () => Promise<void>;
  createInvestigation: () => Promise<void>;
  badge: { textContent: string };
  alert: { textContent: string };
} {
  const calls: string[] = [];
  const elements = new Map<string, {
    value: string;
    textContent: string;
    className: string;
    disabled: boolean;
    checked: boolean;
    classList: { add: () => void; remove: () => void; toggle: () => void };
    addEventListener: () => void;
  }>();
  function el(id: string) {
    let found = elements.get(id);
    if (!found) {
      found = {
        value: '',
        textContent: '',
        className: '',
        disabled: false,
        checked: false,
        classList: { add() {}, remove() {}, toggle() {} },
        addEventListener() {},
      };
      elements.set(id, found);
    }
    return found;
  }
  el('inv-id').value = 'probe-id';
  el('inv-name').value = 'Probe';
  el('inv-description').value = '';
  const context = {
    console,
    Headers,
    URLSearchParams,
    setTimeout,
    fetch(url: string) {
      calls.push(String(url));
      return Promise.resolve({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ status: 'ok', name: 'common-thread', version: '0' }),
        text: async () => '',
      });
    },
    window: {} as { onload?: () => void },
    localStorage: {
      getItem: () => null,
      setItem() {},
    },
    document: {
      getElementById: (id: string) => el(id),
      querySelectorAll: () => [],
      body: { addEventListener() {} },
    },
  };
  createContext(context);
  runInContext(js, context, { filename: 'app.js' });
  const api = context as unknown as {
    checkHealth: () => Promise<void>;
    createInvestigation: () => Promise<void>;
  };
  return {
    calls,
    checkHealth: api.checkHealth,
    createInvestigation: api.createInvestigation,
    badge: el('health-badge'),
    alert: el('alert'),
  };
}

describe('hosted maintenance', () => {
  const worker = loadWorker();

  it('hides the banner and leaves Create enabled when the flag is unset', () => {
    const html = worker.__renderHtml({});
    const js = worker.__renderAppJs({});
    expect(html).toContain('id="hosted-maintenance-banner" class="hidden mx-6');
    expect(html).toContain('data-action="createInvestigation"  class=');
    expect(html).not.toContain('__CREATE_DISABLED__');
    expect(html).not.toContain('__MAINTENANCE_BANNER_CLASS__');
    expect(js).toContain('var HOSTED_MAINTENANCE = false');
    expect(js).toContain('var PUBLIC_BYOK_ONLY = false');
    expect(js).not.toContain('__HOSTED_MAINTENANCE__');
  });

  it('shows the banner and disables Create when the flag is 1', () => {
    const html = worker.__renderHtml({ HOSTED_MAINTENANCE: '1' });
    const js = worker.__renderAppJs({ HOSTED_MAINTENANCE: '1', PUBLIC_BYOK_ONLY: '1' });
    expect(html).toContain('The hosted instance is suspended.');
    expect(html).toContain('id="hosted-maintenance-banner" class=" mx-6');
    expect(html).not.toContain('id="hosted-maintenance-banner" class="hidden');
    expect(html).toContain('data-action="createInvestigation" disabled class=');
    expect(js).toContain('var HOSTED_MAINTENANCE = true');
    expect(js).toContain('var PUBLIC_BYOK_ONLY = true');
  });

  it('does not call the API for health or create while suspended', async () => {
    const app = runApp(worker.__renderAppJs({ HOSTED_MAINTENANCE: 'true' }));
    await app.checkHealth();
    expect(app.badge.textContent).toBe('Hosted tier suspended');
    expect(app.calls).toEqual([]);
    await app.createInvestigation();
    expect(app.calls).toEqual([]);
    expect(app.alert.textContent).toMatch(/Create is unavailable/);
  });

  it('still calls the API when the flag is unset', async () => {
    const app = runApp(worker.__renderAppJs({}));
    await app.checkHealth();
    expect(app.badge.textContent).toBe('Backend OK');
    expect(app.calls).toEqual(['/api/proxy/']);
    await app.createInvestigation();
    expect(app.calls.some((url) => url.startsWith('/api/proxy/investigations'))).toBe(true);
  });
});
