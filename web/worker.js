// worker.js — Common Thread Web Frontend

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Common Thread</title>
<script src="https://cdn.tailwindcss.com"></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<style>
body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
.dropzone { transition: all .2s ease; }
.dropzone.dragover { background:#f0f9ff; border-color:#3b82f6; }
.nav-active { background:#f1f5f9; font-weight:600; }
.band-insufficient { background:#fef2f2; color:#991b1b; }
.band-consistent { background:#fffbeb; color:#92400e; }
.band-strongly_consistent { background:#ecfdf5; color:#065f46; }
</style>
</head>
<body class="bg-slate-50 text-slate-900">
<div class="max-w-screen-2xl mx-auto">
  <header class="bg-white border-b px-6 py-3 flex items-center justify-between gap-4">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 bg-slate-900 rounded-2xl flex items-center justify-center"><i class="fa-solid fa-link text-white text-xl"></i></div>
      <div>
        <div class="font-semibold text-2xl tracking-tight">Common Thread</div>
        <div class="text-xs text-slate-500">Sockpuppet attribution from public behavioral signals</div>
      </div>
    </div>
    <div class="flex items-center gap-2 text-sm">
      <span id="health-badge" class="px-2 py-1 rounded-lg text-xs bg-slate-100 text-slate-600">Checking backend…</span>
      __SITE_HEADER__
      <a href="https://github.com/skyphusion-labs/common-thread" target="_blank" class="px-3 py-1.5 rounded-xl border hover:bg-slate-50">GitHub</a>
    </div>
  </header>

  <div class="flex">
    <aside class="w-64 bg-white border-r min-h-[calc(100vh-4rem)] p-4 shrink-0">
      <div class="text-xs uppercase tracking-widest text-slate-500 mb-2 px-2">Workflow</div>
      <nav class="space-y-1 text-sm" id="nav">
        <a href="#" data-tab="setup" class="nav-link flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-100 nav-active"><i class="fa-solid fa-gear w-4"></i> Setup</a>
        <a href="#" data-tab="investigation" class="nav-link flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-100"><i class="fa-solid fa-folder-open w-4"></i> Investigation</a>
        <a href="#" data-tab="upload" class="nav-link flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-100"><i class="fa-solid fa-upload w-4"></i> Upload Data</a>
        <a href="#" data-tab="features" class="nav-link flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-100"><i class="fa-solid fa-table w-4"></i> Features</a>
        <a href="#" data-tab="attribute" class="nav-link flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-100"><i class="fa-solid fa-brain w-4"></i> Attribution</a>
        <a href="#" data-tab="results" class="nav-link flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-100"><i class="fa-solid fa-file-lines w-4"></i> Results</a>
      </nav>
      <div class="mt-6 px-2 text-xs text-slate-500">
        <div class="font-medium text-slate-700 mb-1">Active investigation</div>
        <div id="sidebar-investigation" class="font-mono break-all text-[11px]">—</div>
      </div>
    </aside>

    <main class="flex-1 p-6 min-w-0">
      <div id="alert" class="hidden mb-4 px-4 py-3 rounded-xl text-sm"></div>

      <!-- Setup -->
      <section id="tab-setup">
        <h2 class="text-2xl font-semibold mb-1">Setup</h2>
        <p class="text-sm text-slate-600 mb-6">Connect to the Common Thread backend and provide your own AI credentials for attribution reasoning.</p>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="bg-white rounded-2xl border p-5 space-y-4">
            <h3 class="font-semibold">Backend</h3>
            <label class="block text-xs text-slate-500">API base URL (optional if service binding is configured)</label>
            <input id="backend-url" class="w-full border rounded-xl px-3 py-2 text-sm font-mono" placeholder="Leave empty when service binding is configured">
            <p class="text-xs text-slate-500">Production UI: <a class="text-blue-700 underline" href="https://common-thread.skyphusion.org">common-thread.skyphusion.org</a>. API calls use the <code class="bg-slate-100 px-1 rounded">BACKEND</code> service binding when deployed.</p>
            <button onclick="checkHealth()" class="px-4 py-2 border rounded-xl text-sm hover:bg-slate-50">Test connection</button>
          </div>

          <div class="bg-white rounded-2xl border p-5 space-y-4">
            <h3 class="font-semibold">AI credentials (BYOK)</h3>
            <p class="text-xs text-slate-600">Attribution calls Anthropic via Cloudflare AI Gateway. Keys stay in your browser and are sent only when you run attribution — they are never stored on our servers.</p>
            <label class="block text-xs text-slate-500">AI Gateway URL</label>
            <input id="ai-gateway-url" class="w-full border rounded-xl px-3 py-2 text-sm font-mono" placeholder="https://gateway.ai.cloudflare.com/v1/ACCOUNT/GATEWAY/anthropic">
            <p class="text-[11px] text-slate-500">Or use direct Anthropic API: <code class="bg-slate-100 px-1 rounded">https://api.anthropic.com</code></p>
            <label class="block text-xs text-slate-500">Anthropic API key</label>
            <input id="anthropic-api-key" type="password" class="w-full border rounded-xl px-3 py-2 text-sm font-mono" placeholder="sk-ant-…" autocomplete="off">
            <label class="flex items-center gap-2 text-xs text-slate-600">
              <input id="remember-keys" type="checkbox" class="rounded">
              Remember credentials in this browser (localStorage)
            </label>
            <button onclick="saveSettings()" class="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm hover:bg-black">Save settings</button>
          </div>
        </div>

        <div class="mt-6 bg-white rounded-2xl border p-5 text-sm text-slate-700 space-y-5">
          <h3 class="font-semibold text-base text-slate-900">How to get API keys</h3>
          <p class="text-xs text-slate-600">Attribution uses Anthropic models for triage and reasoning. You pay Anthropic directly; the public host does not need to supply keys if users bring their own (BYOK).</p>

          <div>
            <h4 class="font-medium mb-1">1. Anthropic API key</h4>
            <ol class="list-decimal list-inside text-xs space-y-1 text-slate-600">
              <li>Create an account at <a class="text-blue-700 underline" href="https://console.anthropic.com/" target="_blank" rel="noopener">console.anthropic.com</a>.</li>
              <li>Open <strong>API keys</strong> and create a key (starts with <code class="bg-slate-100 px-1 rounded">sk-ant-</code>).</li>
              <li>Add billing or credits in Anthropic's console before running attribution.</li>
            </ol>
          </div>

          <div>
            <h4 class="font-medium mb-1">2a. Cloudflare AI Gateway (recommended)</h4>
            <ol class="list-decimal list-inside text-xs space-y-1 text-slate-600">
              <li>In the <a class="text-blue-700 underline" href="https://dash.cloudflare.com/" target="_blank" rel="noopener">Cloudflare dashboard</a>, go to <strong>AI → AI Gateway</strong>.</li>
              <li>Create a gateway (or reuse an existing one).</li>
              <li>Open the gateway and choose the <strong>Anthropic</strong> provider.</li>
              <li>Copy the gateway base URL ending in <code class="bg-slate-100 px-1 rounded">/anthropic</code>, for example:<br>
                <code class="block mt-1 bg-slate-100 px-2 py-1 rounded text-[11px] font-mono">https://gateway.ai.cloudflare.com/v1/&lt;account_id&gt;/&lt;gateway_name&gt;/anthropic</code></li>
              <li>Paste that URL into <strong>AI Gateway URL</strong> above and your Anthropic key into <strong>Anthropic API key</strong>.</li>
            </ol>
            <p class="text-[11px] text-slate-500 mt-2">AI Gateway adds caching, rate limits, and usage visibility without changing the methodology.</p>
          </div>

          <div>
            <h4 class="font-medium mb-1">2b. Direct Anthropic API (no Gateway)</h4>
            <p class="text-xs text-slate-600">Set <strong>AI Gateway URL</strong> to <code class="bg-slate-100 px-1 rounded">https://api.anthropic.com</code> and use your Anthropic API key. The backend appends <code class="bg-slate-100 px-1 rounded">/v1/messages</code> automatically.</p>
          </div>

          <div class="text-xs text-slate-500 border-t pt-3">
            <strong>Privacy:</strong> BYOK credentials are sent only when you run attribution. They are not stored on the server. Optional browser storage uses <code class="bg-slate-100 px-1 rounded">localStorage</code> on your device only.
          </div>
        </div>
      </section>

      <!-- Investigation -->
      <section id="tab-investigation" class="hidden">
        <h2 class="text-2xl font-semibold mb-1">Investigation</h2>
        <p class="text-sm text-slate-600 mb-6">Create or select an investigation. All seeds, features, and attribution runs are scoped to it.</p>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="bg-white rounded-2xl border p-5 space-y-3">
            <h3 class="font-semibold">Create new</h3>
            <input id="inv-id" class="w-full border rounded-xl px-3 py-2 text-sm font-mono" placeholder="investigation-id">
            <input id="inv-name" class="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Display name">
            <textarea id="inv-description" class="w-full border rounded-xl px-3 py-2 text-sm" rows="2" placeholder="Optional description"></textarea>
            <button onclick="createInvestigation()" class="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm hover:bg-black">Create</button>
          </div>
          <div class="bg-white rounded-2xl border p-5">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-semibold">Existing</h3>
              <button onclick="loadInvestigations()" class="text-xs px-2 py-1 border rounded-lg hover:bg-slate-50">Refresh</button>
            </div>
            <div id="investigation-list" class="space-y-2 max-h-64 overflow-auto text-sm"></div>
          </div>
        </div>

        <div id="investigation-summary" class="hidden mt-6 bg-white rounded-2xl border p-5">
          <h3 class="font-semibold mb-3">Summary</h3>
          <div id="summary-content" class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm"></div>
          <div class="mt-4">
            <div class="flex items-center justify-between mb-2">
              <h4 class="font-medium text-sm">Seed accounts</h4>
              <button onclick="loadSeeds()" class="text-xs px-2 py-1 border rounded-lg hover:bg-slate-50">Refresh</button>
            </div>
            <div id="seeds-list" class="max-h-48 overflow-auto text-xs font-mono"></div>
          </div>
        </div>
      </section>

      <!-- Upload -->
      <section id="tab-upload" class="hidden">
        <h2 class="text-2xl font-semibold mb-1">Upload Apify Twitter data</h2>
        <p class="text-sm text-slate-600 mb-6">Upload Apify JSON exports (profiles, timelines, follower/following lists). The backend archives raw data and runs extractors.</p>

        <div id="upload-drop" class="dropzone bg-white border-2 border-dashed border-slate-300 rounded-2xl p-10 text-center cursor-pointer mb-4">
          <i class="fa-solid fa-cloud-arrow-up text-3xl text-slate-400 mb-2"></i>
          <div class="text-sm font-medium">Drop JSON files here or click to browse</div>
          <div class="text-xs text-slate-500 mt-1">Multiple files supported</div>
          <input type="file" id="upload-files" accept=".json,application/json" multiple class="hidden">
        </div>
        <div id="upload-file-list" class="text-xs text-slate-600 mb-4"></div>
        <button onclick="startIngest()" id="ingest-btn" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm disabled:opacity-50" disabled>Upload &amp; ingest</button>

        <div id="ingest-status" class="hidden mt-6 bg-white rounded-2xl border p-5">
          <h3 class="font-semibold mb-2">Ingest job</h3>
          <pre id="ingest-status-body" class="text-xs bg-slate-900 text-emerald-300 p-4 rounded-xl overflow-auto max-h-48"></pre>
        </div>
      </section>

      <!-- Features -->
      <section id="tab-features" class="hidden">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="text-2xl font-semibold mb-1">Features</h2>
            <p class="text-sm text-slate-600">Extracted signals from the backend pipeline.</p>
          </div>
          <button onclick="loadFeatures()" class="px-3 py-1.5 border rounded-xl text-sm hover:bg-white">Refresh</button>
        </div>
        <div id="features-summary" class="grid grid-cols-3 gap-3 mb-4"></div>
        <pre id="features-body" class="text-xs bg-slate-900 text-emerald-300 p-4 rounded-2xl overflow-auto max-h-[28rem]"></pre>
      </section>

      <!-- Attribution -->
      <section id="tab-attribute" class="hidden">
        <h2 class="text-2xl font-semibold mb-1">Attribution</h2>
        <p class="text-sm text-slate-600 mb-6">Run LLM reasoning over all active seed pairs. Requires AI credentials from Setup.</p>

        <div class="bg-white rounded-2xl border p-5 space-y-4 max-w-2xl">
          <label class="flex items-center gap-2 text-sm">
            <input id="skip-triage" type="checkbox" class="rounded">
            Skip triage (run reasoning on all pairs)
          </label>
          <label class="block text-xs text-slate-500">Account filter (comma-separated, optional)</label>
          <input id="account-filter" class="w-full border rounded-xl px-3 py-2 text-sm font-mono" placeholder="alice,bob">
          <div id="credential-hint" class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 hidden"></div>
          <button onclick="runAttribution()" id="attribute-btn" class="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm">Run attribution</button>
        </div>

        <div id="attribute-progress" class="hidden mt-6">
          <pre id="attribute-body" class="text-xs bg-slate-900 text-emerald-300 p-4 rounded-2xl overflow-auto max-h-64"></pre>
        </div>
      </section>

      <!-- Results -->
      <section id="tab-results" class="hidden">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="text-2xl font-semibold mb-1">Attribution results</h2>
            <p class="text-sm text-slate-600">Review runs and download evidence packets.</p>
          </div>
          <button onclick="loadRuns()" class="px-3 py-1.5 border rounded-xl text-sm hover:bg-white">Refresh</button>
        </div>
        <div id="runs-table-wrap" class="bg-white rounded-2xl border overflow-hidden mb-6">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 text-left">
              <tr>
                <th class="px-4 py-2">Run</th>
                <th class="px-4 py-2">Pair</th>
                <th class="px-4 py-2">Band</th>
                <th class="px-4 py-2">Summary</th>
                <th class="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody id="runs-body"></tbody>
          </table>
        </div>
        <div id="run-detail" class="hidden bg-white rounded-2xl border p-5">
          <h3 class="font-semibold mb-2">Run detail</h3>
          <pre id="run-detail-body" class="text-xs bg-slate-900 text-emerald-300 p-4 rounded-xl overflow-auto max-h-96"></pre>
        </div>
      </section>
    </main>
  </div>
</div>

<script>
var state = {
  investigationId: null,
  selectedFiles: [],
  ingestJobId: null,
  settings: {
    backendUrl: '',
    aiGatewayUrl: '',
    anthropicApiKey: '',
    rememberKeys: false,
  },
};

var STORAGE_KEY = 'common-thread-web-settings';

function loadSettingsFromStorage() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    var parsed = JSON.parse(raw);
    state.settings.backendUrl = parsed.backendUrl || '';
    state.settings.aiGatewayUrl = parsed.aiGatewayUrl || '';
    state.settings.rememberKeys = Boolean(parsed.rememberKeys);
    if (parsed.rememberKeys) {
      state.settings.anthropicApiKey = parsed.anthropicApiKey || '';
    }
  } catch (e) {
    console.warn('Failed to load settings', e);
  }
}

function applySettingsToForm() {
  document.getElementById('backend-url').value = state.settings.backendUrl;
  document.getElementById('ai-gateway-url').value = state.settings.aiGatewayUrl;
  document.getElementById('anthropic-api-key').value = state.settings.anthropicApiKey;
  document.getElementById('remember-keys').checked = state.settings.rememberKeys;
  updateCredentialHint();
}

function saveSettings() {
  state.settings.backendUrl = document.getElementById('backend-url').value.trim();
  state.settings.aiGatewayUrl = document.getElementById('ai-gateway-url').value.trim();
  state.settings.anthropicApiKey = document.getElementById('anthropic-api-key').value.trim();
  state.settings.rememberKeys = document.getElementById('remember-keys').checked;
  var toStore = {
    backendUrl: state.settings.backendUrl,
    aiGatewayUrl: state.settings.aiGatewayUrl,
    rememberKeys: state.settings.rememberKeys,
  };
  if (state.settings.rememberKeys) {
    toStore.anthropicApiKey = state.settings.anthropicApiKey;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  showAlert('Settings saved.', 'success');
  updateCredentialHint();
}

function updateCredentialHint() {
  var el = document.getElementById('credential-hint');
  if (!state.settings.aiGatewayUrl || !state.settings.anthropicApiKey) {
    el.classList.remove('hidden');
    el.textContent = 'Add AI Gateway URL and Anthropic API key in Setup before running attribution.';
  } else {
    el.classList.add('hidden');
  }
}

function showAlert(message, kind) {
  var el = document.getElementById('alert');
  el.textContent = message;
  el.className = 'mb-4 px-4 py-3 rounded-xl text-sm ' + (kind === 'error' ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200');
  el.classList.remove('hidden');
  setTimeout(function() { el.classList.add('hidden'); }, 6000);
}

function requireInvestigation() {
  if (!state.investigationId) {
    showAlert('Select or create an investigation first.', 'error');
    return false;
  }
  return true;
}

function updateSidebarInvestigation() {
  document.getElementById('sidebar-investigation').textContent = state.investigationId || '—';
}

function showTab(tab) {
  var sections = document.querySelectorAll('main > section');
  for (var i = 0; i < sections.length; i++) sections[i].classList.add('hidden');
  document.getElementById('tab-' + tab).classList.remove('hidden');
  var links = document.querySelectorAll('.nav-link');
  for (var j = 0; j < links.length; j++) {
    links[j].classList.toggle('nav-active', links[j].getAttribute('data-tab') === tab);
  }
  if (tab === 'investigation') loadInvestigations();
  if (tab === 'features') loadFeatures();
  if (tab === 'results') loadRuns();
}

async function api(method, path, options) {
  options = options || {};
  var url = '/api/proxy' + path;
  if (state.settings.backendUrl) {
    url += (path.indexOf('?') >= 0 ? '&' : '?') + 'backend=' + encodeURIComponent(state.settings.backendUrl);
  }
  var headers = new Headers(options.headers || {});
  if (options.withCredentials) {
    if (state.settings.aiGatewayUrl) headers.set('X-AI-Gateway-Url', state.settings.aiGatewayUrl);
    if (state.settings.anthropicApiKey) headers.set('X-Anthropic-Api-Key', state.settings.anthropicApiKey);
  }
  if (options.json !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  var init = {
    method: method,
    headers: headers,
  };
  if (options.json !== undefined) init.body = JSON.stringify(options.json);
  else if (options.body !== undefined) init.body = options.body;
  var res = await fetch(url, init);
  var contentType = res.headers.get('content-type') || '';
  if (contentType.indexOf('application/json') >= 0) {
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    return data;
  }
  if (contentType.indexOf('application/pdf') >= 0 || options.binary) {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res;
  }
  var text = await res.text();
  if (!res.ok) throw new Error(text || ('HTTP ' + res.status));
  return text;
}

async function checkHealth() {
  var badge = document.getElementById('health-badge');
  badge.textContent = 'Checking…';
  try {
    var data = await api('GET', '/');
    badge.textContent = data.status === 'ok' ? 'Backend OK' : 'Backend unknown';
    badge.className = 'px-2 py-1 rounded-lg text-xs bg-emerald-100 text-emerald-800';
    showAlert('Connected to ' + data.name + ' v' + data.version, 'success');
  } catch (e) {
    badge.textContent = 'Backend offline';
    badge.className = 'px-2 py-1 rounded-lg text-xs bg-red-100 text-red-800';
    showAlert('Connection failed: ' + e.message, 'error');
  }
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
}

async function createInvestigation() {
  var id = document.getElementById('inv-id').value.trim() || ('inv-' + Date.now());
  var name = document.getElementById('inv-name').value.trim() || id;
  var description = document.getElementById('inv-description').value.trim() || undefined;
  try {
    await api('POST', '/investigations', { json: { id: id, name: name, description: description } });
    selectInvestigation(id);
    showAlert('Investigation created.', 'success');
    loadInvestigations();
  } catch (e) {
    showAlert(e.message, 'error');
  }
}

function selectInvestigation(id) {
  state.investigationId = id;
  updateSidebarInvestigation();
  document.getElementById('investigation-summary').classList.remove('hidden');
  loadSummary();
  loadSeeds();
}

async function loadInvestigations() {
  var list = document.getElementById('investigation-list');
  list.innerHTML = '<div class="text-slate-400 text-xs">Loading…</div>';
  try {
    var data = await api('GET', '/investigations');
    if (!data.investigations || !data.investigations.length) {
      list.innerHTML = '<div class="text-slate-400 text-xs">No investigations yet.</div>';
      return;
    }
    list.innerHTML = '';
    for (var i = 0; i < data.investigations.length; i++) {
      var inv = data.investigations[i];
      var btn = document.createElement('button');
      btn.className = 'w-full text-left px-3 py-2 rounded-xl border hover:bg-slate-50 ' + (state.investigationId === inv.id ? 'border-slate-900 bg-slate-50' : '');
      btn.innerHTML = '<div class="font-medium">' + escapeHtml(inv.name) + '</div><div class="font-mono text-[11px] text-slate-500">' + escapeHtml(inv.id) + '</div>';
      btn.onclick = (function(investigationId) { return function() { selectInvestigation(investigationId); }; })(inv.id);
      list.appendChild(btn);
    }
  } catch (e) {
    list.innerHTML = '<div class="text-red-600 text-xs">' + escapeHtml(e.message) + '</div>';
  }
}

async function loadSummary() {
  if (!state.investigationId) return;
  try {
    var data = await api('GET', '/investigations/' + encodeURIComponent(state.investigationId) + '/summary');
    var el = document.getElementById('summary-content');
    el.innerHTML =
      '<div class="bg-slate-50 rounded-xl p-3"><div class="text-xs text-slate-500">Seeds</div><div class="text-xl font-semibold">' + data.seeds + '</div></div>' +
      '<div class="bg-slate-50 rounded-xl p-3"><div class="text-xs text-slate-500">Artifacts</div><div class="text-xl font-semibold">' + data.artifacts + '</div></div>';
  } catch (e) {
    showAlert(e.message, 'error');
  }
}

async function loadSeeds() {
  if (!state.investigationId) return;
  var el = document.getElementById('seeds-list');
  el.innerHTML = 'Loading…';
  try {
    var data = await api('GET', '/investigations/' + encodeURIComponent(state.investigationId) + '/seeds');
    if (!data.seeds || !data.seeds.length) {
      el.innerHTML = '<div class="text-slate-400">No seeds yet. Upload Apify data or add seeds via API.</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < data.seeds.length; i++) {
      var s = data.seeds[i];
      html += '<div class="py-0.5">' + escapeHtml(s.platform) + ':' + escapeHtml(s.account_identifier) + '</div>';
    }
    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = '<div class="text-red-600">' + escapeHtml(e.message) + '</div>';
  }
}

function setupUpload() {
  var drop = document.getElementById('upload-drop');
  var input = document.getElementById('upload-files');
  drop.onclick = function() { input.click(); };
  drop.ondragover = function(e) { e.preventDefault(); drop.classList.add('dragover'); };
  drop.ondragleave = function() { drop.classList.remove('dragover'); };
  drop.ondrop = function(e) {
    e.preventDefault();
    drop.classList.remove('dragover');
    addUploadFiles(e.dataTransfer.files);
  };
  input.onchange = function() {
    addUploadFiles(input.files);
    input.value = '';
  };
}

function addUploadFiles(fileList) {
  for (var i = 0; i < fileList.length; i++) state.selectedFiles.push(fileList[i]);
  renderUploadFileList();
}

function renderUploadFileList() {
  var el = document.getElementById('upload-file-list');
  var btn = document.getElementById('ingest-btn');
  if (!state.selectedFiles.length) {
    el.innerHTML = '';
    btn.disabled = true;
    return;
  }
  el.innerHTML = state.selectedFiles.map(function(f) { return '<div>• ' + escapeHtml(f.name) + ' (' + Math.round(f.size / 1024) + ' KB)</div>'; }).join('');
  btn.disabled = !requireInvestigationSilent();
}

function requireInvestigationSilent() {
  return Boolean(state.investigationId);
}

async function startIngest() {
  if (!requireInvestigation()) return;
  if (!state.selectedFiles.length) {
    showAlert('Select at least one JSON file.', 'error');
    return;
  }
  var btn = document.getElementById('ingest-btn');
  btn.disabled = true;
  btn.textContent = 'Uploading…';
  var statusPanel = document.getElementById('ingest-status');
  var statusBody = document.getElementById('ingest-status-body');
  statusPanel.classList.remove('hidden');
  statusBody.textContent = 'Uploading…';

  try {
    var form = new FormData();
    for (var i = 0; i < state.selectedFiles.length; i++) {
      form.append('file', state.selectedFiles[i]);
    }
    var data = await api('POST', '/investigations/' + encodeURIComponent(state.investigationId) + '/ingest/apify-twitter', { body: form });
    statusBody.textContent = JSON.stringify(data, null, 2);
    state.ingestJobId = data.jobId || null;
    showAlert('Ingest started.', 'success');
    if (state.ingestJobId) pollIngestJob();
    else {
      loadSummary();
      loadSeeds();
    }
    state.selectedFiles = [];
    renderUploadFileList();
  } catch (e) {
    statusBody.textContent = e.message;
    showAlert(e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Upload & ingest';
  }
}

async function pollIngestJob() {
  if (!state.investigationId || !state.ingestJobId) return;
  var statusBody = document.getElementById('ingest-status-body');
  for (var attempt = 0; attempt < 120; attempt++) {
    try {
      var data = await api('GET', '/investigations/' + encodeURIComponent(state.investigationId) + '/ingest-jobs/' + encodeURIComponent(state.ingestJobId));
      statusBody.textContent = JSON.stringify(data, null, 2);
      var status = data.job && data.job.status;
      if (status === 'completed' || status === 'failed') {
        if (status === 'completed') showAlert('Ingest completed.', 'success');
        else showAlert('Ingest failed. See job status.', 'error');
        loadSummary();
        loadSeeds();
        return;
      }
    } catch (e) {
      statusBody.textContent = e.message;
      return;
    }
    await new Promise(function(r) { setTimeout(r, 2000); });
  }
  showAlert('Ingest polling timed out. Check job status manually.', 'error');
}

async function loadFeatures() {
  if (!requireInvestigation()) return;
  var body = document.getElementById('features-body');
  var summary = document.getElementById('features-summary');
  body.textContent = 'Loading…';
  try {
    var data = await api('GET', '/investigations/' + encodeURIComponent(state.investigationId) + '/features?scope=all');
    summary.innerHTML =
      '<div class="bg-white border rounded-2xl p-4 text-center"><div class="text-xs text-slate-500">Account</div><div class="text-2xl font-semibold">' + data.count.account + '</div></div>' +
      '<div class="bg-white border rounded-2xl p-4 text-center"><div class="text-xs text-slate-500">Pair</div><div class="text-2xl font-semibold">' + data.count.pair + '</div></div>' +
      '<div class="bg-white border rounded-2xl p-4 text-center"><div class="text-xs text-slate-500">Total</div><div class="text-2xl font-semibold">' + data.count.total + '</div></div>';
    body.textContent = JSON.stringify(data, null, 2);
  } catch (e) {
    body.textContent = e.message;
    showAlert(e.message, 'error');
  }
}

async function runAttribution() {
  if (!requireInvestigation()) return;
  if (!state.settings.aiGatewayUrl || !state.settings.anthropicApiKey) {
    showAlert('Configure AI credentials in Setup first.', 'error');
    showTab('setup');
    return;
  }
  var btn = document.getElementById('attribute-btn');
  var panel = document.getElementById('attribute-progress');
  var body = document.getElementById('attribute-body');
  btn.disabled = true;
  btn.textContent = 'Running…';
  panel.classList.remove('hidden');
  body.textContent = 'Attribution in progress. This may take several minutes…';

  var payload = {};
  if (document.getElementById('skip-triage').checked) payload.skipTriage = true;
  var filter = document.getElementById('account-filter').value.trim();
  if (filter) payload.accountFilter = filter.split(',').map(function(s) { return s.trim(); }).filter(Boolean);

  try {
    var data = await api('POST', '/investigations/' + encodeURIComponent(state.investigationId) + '/attribute', {
      json: payload,
      withCredentials: true,
    });
    body.textContent = JSON.stringify(data, null, 2);
    showAlert('Attribution finished (' + data.pair_count + ' pairs).', 'success');
    showTab('results');
    loadRuns();
  } catch (e) {
    body.textContent = e.message;
    showAlert(e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Run attribution';
  }
}

function bandClass(band) {
  if (band === 'strongly_consistent') return 'band-strongly_consistent';
  if (band === 'consistent') return 'band-consistent';
  return 'band-insufficient';
}

async function loadRuns() {
  if (!requireInvestigation()) return;
  var tbody = document.getElementById('runs-body');
  tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-3 text-slate-400">Loading…</td></tr>';
  try {
    var data = await api('GET', '/investigations/' + encodeURIComponent(state.investigationId) + '/runs');
    if (!data.runs || !data.runs.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-3 text-slate-400">No attribution runs yet.</td></tr>';
      return;
    }
    tbody.innerHTML = '';
    for (var i = 0; i < data.runs.length; i++) {
      var run = data.runs[i];
      var tr = document.createElement('tr');
      tr.className = 'border-t';
      var pairLabel = (run.account_a || '?') + ' ↔ ' + (run.account_b || '?');
      tr.innerHTML =
        '<td class="px-4 py-2 font-mono text-xs">' + run.id + '</td>' +
        '<td class="px-4 py-2 text-xs">' + escapeHtml(pairLabel) + '</td>' +
        '<td class="px-4 py-2"><span class="px-2 py-0.5 rounded-lg text-xs ' + bandClass(run.confidence_band) + '">' + escapeHtml(run.confidence_band || '—') + '</span></td>' +
        '<td class="px-4 py-2 text-xs text-slate-600">' + escapeHtml(run.output_summary || '—') + '</td>' +
        '<td class="px-4 py-2 text-xs space-x-2">' +
          '<button class="underline" data-action="view">View</button>' +
          '<button class="underline" data-action="markdown">Markdown</button>' +
          '<button class="underline" data-action="json">JSON</button>' +
          '<button class="underline" data-action="pdf">PDF</button>' +
        '</td>';
      tr.querySelector('[data-action="view"]').onclick = (function(runId) { return function() { viewRun(runId); }; })(run.id);
      tr.querySelector('[data-action="markdown"]').onclick = (function(runId) { return function() { downloadPacket(runId, 'markdown'); }; })(run.id);
      tr.querySelector('[data-action="json"]').onclick = (function(runId) { return function() { downloadPacket(runId, 'json'); }; })(run.id);
      tr.querySelector('[data-action="pdf"]').onclick = (function(runId) { return function() { downloadPacket(runId, 'pdf'); }; })(run.id);
      tbody.appendChild(tr);
    }
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-3 text-red-600">' + escapeHtml(e.message) + '</td></tr>';
  }
}

async function viewRun(runId) {
  try {
    var data = await api('GET', '/investigations/' + encodeURIComponent(state.investigationId) + '/runs/' + runId);
    document.getElementById('run-detail').classList.remove('hidden');
    document.getElementById('run-detail-body').textContent = JSON.stringify(data, null, 2);
  } catch (e) {
    showAlert(e.message, 'error');
  }
}

async function downloadPacket(runId, format) {
  try {
    var path = '/investigations/' + encodeURIComponent(state.investigationId) + '/packet/' + runId;
    var query = [];
    if (format === 'markdown') query.push('format=markdown');
    if (format === 'pdf') query.push('format=pdf');
    if (query.length) path += '?' + query.join('&');
    var url = '/api/proxy' + path;
    if (state.settings.backendUrl) {
      url += (path.indexOf('?') >= 0 ? '&' : '?') + 'backend=' + encodeURIComponent(state.settings.backendUrl);
    }
    var res = await fetch(url);
    if (!res.ok) {
      var errText = await res.text();
      try {
        var errJson = JSON.parse(errText);
        throw new Error(errJson.error || ('HTTP ' + res.status));
      } catch (parseErr) {
        if (parseErr instanceof Error && parseErr.message !== ('HTTP ' + res.status)) throw parseErr;
        throw new Error(errText || ('HTTP ' + res.status));
      }
    }
    var blob = await res.blob();
    var ext = format === 'markdown' ? 'md' : format === 'pdf' ? 'pdf' : 'json';
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'common-thread-' + state.investigationId + '-run-' + runId + '.' + ext;
    a.click();
    URL.revokeObjectURL(a.href);
    if (format === 'pdf') showAlert('PDF downloaded.', 'success');
  } catch (e) {
    var msg = e.message || String(e);
    if (format === 'pdf' && msg.indexOf('PDF') < 0) {
      msg += ' PDF export requires the backend PDF container (VPC_PDF + PDF_SECRET). See docs/DEPLOYMENT.md.';
    }
    showAlert(msg, 'error');
  }
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function init() {
  loadSettingsFromStorage();
  applySettingsToForm();
  setupUpload();
  updateSidebarInvestigation();
  updateCredentialHint();

  document.getElementById('nav').addEventListener('click', function(e) {
    var link = e.target.closest('[data-tab]');
    if (!link) return;
    e.preventDefault();
    showTab(link.getAttribute('data-tab'));
  });

  document.getElementById('inv-name').addEventListener('input', function(e) {
    var idField = document.getElementById('inv-id');
    if (!idField.value.trim()) idField.placeholder = slugify(e.target.value) || 'investigation-id';
  });

  checkHealth();
}

window.onload = init;
</script>
</body>
</html>`;

const PROXY_FORWARD_HEADERS = [
  'content-type',
  'x-ai-gateway-url',
  'x-anthropic-api-key',
];

function buildProxyHeaders(request) {
  const headers = new Headers();
  for (const name of PROXY_FORWARD_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function renderHtml(env) {
  const publicUrl = (env.PUBLIC_URL || '').replace(/\/$/, '');
  const siteHeader = publicUrl
    ? '<a href="' + publicUrl + '" class="text-xs text-slate-500 hidden sm:inline hover:underline">' + publicUrl + '</a>'
    : '';
  return HTML.replace('__SITE_HEADER__', siteHeader);
}

function resolveBackendBase(env, url) {
  const override = url.searchParams.get('backend');
  if (override) return override.replace(/\/$/, '');
  if (env.DEFAULT_BACKEND_URL) return env.DEFAULT_BACKEND_URL.replace(/\/$/, '');
  // Service binding is preferred; this fallback is only for misconfigured deploys.
  return 'http://127.0.0.1:8787';
}

// Cloudflare Worker
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/') {
      const html = renderHtml(env);
      return new Response(html, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }

    if (url.pathname.startsWith('/api/proxy')) {
      const backendPath = url.pathname.slice('/api/proxy'.length) || '/';
      const backendBase = resolveBackendBase(env, url);
      const targetUrl = new URL(backendBase + backendPath);
      // Drop proxy-only query params before forwarding.
      targetUrl.searchParams.delete('backend');

      const headers = buildProxyHeaders(request);
      const init = {
        method: request.method,
        headers,
      };

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        init.body = await request.arrayBuffer();
      }

      try {
        const targetRequest = new Request(targetUrl.toString(), init);
        if (env.BACKEND) {
          return await env.BACKEND.fetch(targetRequest);
        }
        return await fetch(targetRequest);
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 502,
          headers: { 'content-type': 'application/json' },
        });
      }
    }

    return new Response('Not found', { status: 404 });
  },
};
