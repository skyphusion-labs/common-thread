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
            <p class="text-xs text-slate-500">Production UI: <a class="text-blue-700 underline" href="https://common-thread.skyphusion.org">common-thread.skyphusion.org</a>. Direct API: <a class="text-blue-700 underline" href="https://common-thread-backend.skyphusion.org">common-thread-backend.skyphusion.org</a> (contact <a class="text-blue-700 underline" href="mailto:common-thread@skyphusion.org">common-thread@skyphusion.org</a> before using the hosted API in your own project). This UI uses the <code class="bg-slate-100 px-1 rounded">BACKEND</code> service binding when deployed (leave the field above empty).</p>
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
        <p class="text-sm text-slate-600 mb-4">Each investigation is private. You receive an unguessable access token at creation — store it to reopen or share read access.</p>

        <div class="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 space-y-1">
          <p><strong>Honest security note:</strong> Access tokens are capability secrets, not passwords. They stop casual browsing and guessing, but anyone with the token can read the investigation (and modify it while active). Tokens stored in this browser use <code class="bg-amber-100 px-1 rounded">localStorage</code> on your device — not encrypted. For high-sensitivity work, self-host the backend or use dedicated access controls.</p>
          <p>If you lose the token, the investigation cannot be recovered from the server.</p>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="bg-white rounded-2xl border p-5 space-y-3">
            <h3 class="font-semibold">Create new</h3>
            <input id="inv-id" class="w-full border rounded-xl px-3 py-2 text-sm font-mono" placeholder="investigation-id">
            <input id="inv-name" class="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Display name">
            <textarea id="inv-description" class="w-full border rounded-xl px-3 py-2 text-sm" rows="2" placeholder="Optional description"></textarea>
            <button onclick="createInvestigation()" class="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm hover:bg-black">Create</button>
          </div>
          <div class="bg-white rounded-2xl border p-5 space-y-3">
            <h3 class="font-semibold">Open with access token</h3>
            <input id="open-inv-id" class="w-full border rounded-xl px-3 py-2 text-sm font-mono" placeholder="investigation-id">
            <input id="open-inv-token" type="password" class="w-full border rounded-xl px-3 py-2 text-sm font-mono" placeholder="ct_…" autocomplete="off">
            <button onclick="openInvestigation()" class="px-4 py-2 border rounded-xl text-sm hover:bg-slate-50">Open</button>
            <div class="text-xs text-slate-500 border-t pt-3">
              <div class="font-medium text-slate-700 mb-2">Saved on this browser</div>
              <div id="saved-investigation-list" class="space-y-2 max-h-40 overflow-auto"></div>
            </div>
          </div>
        </div>

        <div id="token-reveal" class="hidden mt-6 bg-emerald-50 border border-emerald-200 rounded-2xl p-5 space-y-3">
          <h3 class="font-semibold text-emerald-900">Save your access token</h3>
          <p class="text-xs text-emerald-800">This token is shown once. Copy it now — the server cannot recover it.</p>
          <div class="flex gap-2">
            <input id="token-reveal-value" readonly class="flex-1 border rounded-xl px-3 py-2 text-xs font-mono bg-white">
            <button onclick="copyRevealedToken()" class="px-3 py-2 border rounded-xl text-xs hover:bg-white">Copy token</button>
            <button onclick="copyShareLink()" class="px-3 py-2 border rounded-xl text-xs hover:bg-white">Copy link</button>
          </div>
        </div>

        <div id="investigation-summary" class="hidden mt-6 bg-white rounded-2xl border p-5">
          <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h3 class="font-semibold">Summary</h3>
            <div class="flex items-center gap-2">
              <span id="investigation-status-badge" class="text-xs px-2 py-1 rounded-lg bg-slate-100 text-slate-700">active</span>
              <button id="seal-btn" onclick="sealInvestigation()" class="text-xs px-3 py-1.5 border rounded-lg hover:bg-slate-50">Seal (read-only)</button>
            </div>
          </div>
          <p id="sealed-banner" class="hidden mb-3 text-xs text-violet-800 bg-violet-50 border border-violet-200 rounded-xl px-3 py-2">This investigation is sealed. You can review data and download evidence packets, but ingest and attribution are disabled.</p>
          <div id="summary-content" class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm"></div>
          <div class="mt-4">
            <div class="flex items-center justify-between mb-2">
              <h4 class="font-medium text-sm">Seed accounts</h4>
              <button onclick="loadSeeds()" class="text-xs px-2 py-1 border rounded-lg hover:bg-slate-50">Refresh</button>
            </div>
            <div id="seeds-list" class="max-h-48 overflow-auto text-xs font-mono"></div>
          </div>
          <div class="mt-4">
            <h4 class="font-medium text-sm mb-1">Triggering events (§4.2.2)</h4>
            <p class="text-xs text-slate-500 mb-2">Configure practitioner-supplied events for response-latency extractors. Save before ingest when latency signals matter.</p>
            <textarea id="triggering-events-json" class="w-full border rounded-xl px-3 py-2 text-xs font-mono h-28" placeholder='[{"id":"evt1","timestamp":"2025-01-01T12:00:00.000Z","label":"optional label"}]'></textarea>
            <button onclick="saveTriggeringEvents()" class="mt-2 text-xs px-3 py-1.5 border rounded-lg hover:bg-slate-50">Save triggering events</button>
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
          <button onclick="runAttribution()" id="attribute-btn" class="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed">Run attribution</button>
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
  accessToken: null,
  investigationStatus: 'active',
  selectedFiles: [],
  ingestJobId: null,
  attributionJobId: null,
  attributionPolling: false,
  settings: {
    backendUrl: '',
    aiGatewayUrl: '',
    anthropicApiKey: '',
    rememberKeys: false,
  },
};

var STORAGE_KEY = 'common-thread-web-settings';
var INVESTIGATIONS_KEY = 'common-thread-investigations';
// Public-mode gate (server-projected). When true, attribution is BYOK-only:
// the host provides no AI credentials and the UI refuses to submit without a key.
var BYOK_REQUIRED = __BYOK_REQUIRED__;

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

function hasByokCredentials() {
  return Boolean(state.settings.aiGatewayUrl && state.settings.anthropicApiKey);
}

function updateAttributeButtonLabel() {
  var btn = document.getElementById('attribute-btn');
  if (!btn) return;
  // Do not stomp on the transient Submitting/Queued/Running labels mid-run.
  if (state.attributionPolling) return;
  if (BYOK_REQUIRED) {
    btn.textContent = 'Run attribution';
    return;
  }
  btn.textContent = hasByokCredentials()
    ? 'Run attribution (your key, immediate)'
    : 'Run attribution (server-side, may queue)';
}

function updateCredentialHint() {
  var el = document.getElementById('credential-hint');
  if (!hasByokCredentials()) {
    el.classList.remove('hidden');
    el.textContent = BYOK_REQUIRED
      ? 'This public instance provides no AI credentials. Add your AI Gateway URL and Anthropic API key in Setup to run attribution; the host will not run it for you.'
      : 'No AI key set. Attribution will run server-side on the deployment credentials (if configured) and may be queued; add a key in Setup to run immediately with your own.';
  } else {
    el.classList.add('hidden');
    el.textContent = '';
  }
  updateAttributeButtonLabel();
  updateWritableUi();
}

function showAlert(message, kind) {
  var el = document.getElementById('alert');
  el.textContent = message;
  el.className = 'mb-4 px-4 py-3 rounded-xl text-sm ' + (kind === 'error' ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200');
  el.classList.remove('hidden');
  setTimeout(function() { el.classList.add('hidden'); }, 6000);
}

function isInvestigationWritable() {
  return state.investigationStatus === 'active';
}

function updateWritableUi() {
  var writable = isInvestigationWritable();
  var ingestBtn = document.getElementById('ingest-btn');
  var attributeBtn = document.getElementById('attribute-btn');
  if (ingestBtn) ingestBtn.disabled = !writable || state.selectedFiles.length === 0;
  if (attributeBtn) attributeBtn.disabled = !writable || (BYOK_REQUIRED && !hasByokCredentials());
  var sealBtn = document.getElementById('seal-btn');
  if (sealBtn) sealBtn.classList.toggle('hidden', !writable);
  var sealedBanner = document.getElementById('sealed-banner');
  if (sealedBanner) sealedBanner.classList.toggle('hidden', writable);
  var statusBadge = document.getElementById('investigation-status-badge');
  if (statusBadge) {
    statusBadge.textContent = state.investigationStatus || 'active';
    statusBadge.className = 'text-xs px-2 py-1 rounded-lg ' + (
      writable ? 'bg-emerald-100 text-emerald-800' : 'bg-violet-100 text-violet-800'
    );
  }
}

function loadSavedInvestigations() {
  try {
    var raw = localStorage.getItem(INVESTIGATIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveInvestigationBookmark(entry) {
  var list = loadSavedInvestigations().filter(function(item) { return item.id !== entry.id; });
  list.unshift(entry);
  localStorage.setItem(INVESTIGATIONS_KEY, JSON.stringify(list.slice(0, 20)));
  renderSavedInvestigations();
}

function renderSavedInvestigations() {
  var container = document.getElementById('saved-investigation-list');
  if (!container) return;
  var list = loadSavedInvestigations();
  if (!list.length) {
    container.innerHTML = '<div class="text-slate-400">None saved yet.</div>';
    return;
  }
  container.innerHTML = '';
  for (var i = 0; i < list.length; i++) {
  (function(item) {
    var btn = document.createElement('button');
    btn.className = 'w-full text-left px-2 py-1.5 rounded-lg border hover:bg-slate-50 text-xs';
    btn.innerHTML = '<div class="font-medium">' + escapeHtml(item.name || item.id) + '</div><div class="font-mono text-[10px] text-slate-500">' + escapeHtml(item.id) + '</div>';
    btn.onclick = function() { openInvestigationWith(item.id, item.accessToken); };
    container.appendChild(btn);
  })(list[i]);
  }
}

function investigationAuthHeaders(path) {
  if (!state.accessToken || !state.investigationId) return {};
  if (path.indexOf('/investigations/' + encodeURIComponent(state.investigationId)) !== 0 &&
      path.indexOf('/investigations/' + state.investigationId) !== 0) {
    return {};
  }
  return { 'X-Investigation-Token': state.accessToken };
}

function requireInvestigation() {
  if (!state.investigationId || !state.accessToken) {
    showAlert('Open or create an investigation first (access token required).', 'error');
    return false;
  }
  return true;
}

function requireWritableInvestigation() {
  if (!requireInvestigation()) return false;
  if (!isInvestigationWritable()) {
    showAlert('This investigation is sealed (read-only).', 'error');
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
  if (tab === 'investigation') renderSavedInvestigations();
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
  var authHeaders = investigationAuthHeaders(path);
  for (var authKey in authHeaders) {
    if (Object.prototype.hasOwnProperty.call(authHeaders, authKey)) {
      headers.set(authKey, authHeaders[authKey]);
    }
  }
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
    var data = await api('POST', '/investigations', { json: { id: id, name: name, description: description } });
    if (!data.access_token) throw new Error('Server did not return an access token.');
    await openInvestigationWith(id, data.access_token, { name: name, status: data.status || 'active' });
    document.getElementById('token-reveal').classList.remove('hidden');
    document.getElementById('token-reveal-value').value = data.access_token;
    showAlert('Investigation created. Copy and save the access token now.', 'success');
  } catch (e) {
    showAlert(e.message, 'error');
  }
}

async function openInvestigation() {
  var id = document.getElementById('open-inv-id').value.trim();
  var token = document.getElementById('open-inv-token').value.trim();
  if (!id || !token) {
    showAlert('Investigation ID and access token are required.', 'error');
    return;
  }
  try {
    await openInvestigationWith(id, token);
    document.getElementById('token-reveal').classList.add('hidden');
    showAlert('Investigation opened.', 'success');
  } catch (e) {
    showAlert(e.message, 'error');
  }
}

async function openInvestigationWith(id, token, meta) {
  state.investigationId = id;
  state.accessToken = token;
  var data = await api('GET', '/investigations/' + encodeURIComponent(id));
  var inv = data.investigation || {};
  state.investigationStatus = inv.status || (meta && meta.status) || 'active';
  saveInvestigationBookmark({
    id: id,
    accessToken: token,
    name: inv.name || (meta && meta.name) || id,
    status: state.investigationStatus,
  });
  document.getElementById('open-inv-id').value = id;
  document.getElementById('open-inv-token').value = token;
  renderInvestigationMetadata(data.metadata || {});
  selectInvestigation(id);
}

function renderInvestigationMetadata(metadata) {
  var ta = document.getElementById('triggering-events-json');
  if (!ta) return;
  var events = metadata && metadata.triggering_events ? metadata.triggering_events : [];
  ta.value = events.length ? JSON.stringify(events, null, 2) : '';
}

async function saveTriggeringEvents() {
  if (!requireWritableInvestigation()) return;
  try {
    var raw = document.getElementById('triggering-events-json').value.trim();
    var events = [];
    if (raw) {
      events = JSON.parse(raw);
      if (!Array.isArray(events)) throw new Error('Triggering events must be a JSON array');
    }
    await api('PATCH', '/investigations/' + encodeURIComponent(state.investigationId) + '/metadata', {
      json: { triggering_events: events },
    });
    showAlert('Triggering events saved.', 'success');
  } catch (e) {
    showAlert(e.message, 'error');
  }
}

function copyRevealedToken() {
  var value = document.getElementById('token-reveal-value').value;
  if (!value) return;
  navigator.clipboard.writeText(value).then(function() {
    showAlert('Access token copied.', 'success');
  });
}

function copyShareLink() {
  if (!state.investigationId || !state.accessToken) return;
  var link = window.location.origin + window.location.pathname +
    '?investigation=' + encodeURIComponent(state.investigationId) +
    '&token=' + encodeURIComponent(state.accessToken);
  navigator.clipboard.writeText(link).then(function() {
    showAlert('Share link copied. Anyone with this link can access the investigation.', 'success');
  });
}

async function sealInvestigation() {
  if (!requireInvestigation()) return;
  if (!confirm('Seal this investigation? Ingest and attribution will be disabled permanently for this investigation.')) return;
  try {
    var data = await api('POST', '/investigations/' + encodeURIComponent(state.investigationId) + '/seal');
    state.investigationStatus = (data.investigation && data.investigation.status) || 'sealed';
    saveInvestigationBookmark({
      id: state.investigationId,
      accessToken: state.accessToken,
      name: (data.investigation && data.investigation.name) || state.investigationId,
      status: state.investigationStatus,
    });
    updateWritableUi();
    showAlert(data.message || 'Investigation sealed.', 'success');
  } catch (e) {
    showAlert(e.message, 'error');
  }
}

function selectInvestigation(id) {
  state.investigationId = id;
  updateSidebarInvestigation();
  updateWritableUi();
  document.getElementById('investigation-summary').classList.remove('hidden');
  loadSummary();
  loadSeeds();
}

async function loadSummary() {
  if (!state.investigationId) return;
  try {
    var meta = await api('GET', '/investigations/' + encodeURIComponent(state.investigationId));
    if (meta.investigation) {
      state.investigationStatus = meta.investigation.status || 'active';
      updateWritableUi();
    }
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
  btn.disabled = !requireInvestigationSilent() || !isInvestigationWritable();
}

function requireInvestigationSilent() {
  return Boolean(state.investigationId && state.accessToken);
}

async function startIngest() {
  if (!requireWritableInvestigation()) return;
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
    updateWritableUi();
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
  if (!requireWritableInvestigation()) return;
  if (BYOK_REQUIRED && !hasByokCredentials()) {
    showAlert('Add your AI Gateway URL and Anthropic API key in Setup. This public instance does not run attribution on host credentials.', 'error');
    showTab('setup');
    return;
  }
  // Credentials are optional (issue #69). With a BYOK key the run is synchronous
  // (the key is sent and the backend returns 200); without one it runs on the
  // deployment credentials and the backend may return 202 with a queued job to
  // poll. BYOK stays sync-only per Conrad; the mode is derived, never chosen.
  var useByok = hasByokCredentials();
  var btn = document.getElementById('attribute-btn');
  var panel = document.getElementById('attribute-progress');
  var body = document.getElementById('attribute-body');
  btn.disabled = true;
  btn.textContent = 'Submitting…';
  panel.classList.remove('hidden');
  body.textContent = useByok
    ? 'Attribution in progress with your credentials. This may take several minutes…'
    : 'Submitting attribution to the server…';

  var payload = {};
  if (document.getElementById('skip-triage').checked) payload.skipTriage = true;
  var filter = document.getElementById('account-filter').value.trim();
  if (filter) payload.accountFilter = filter.split(',').map(function(s) { return s.trim(); }).filter(Boolean);

  try {
    var data = await api('POST', '/investigations/' + encodeURIComponent(state.investigationId) + '/attribute', {
      json: payload,
      withCredentials: useByok,
    });
    if (data && data.mode === 'async') {
      // Server-creds path: a job was queued. Poll it to a terminal state.
      state.attributionJobId = data.jobId || null;
      body.textContent = JSON.stringify(data, null, 2) +
        '\\n\\nQueued server-side. Polling for completion; you can safely leave this tab, ' +
        'the results land under Results regardless.';
      if (state.attributionJobId) {
        showAlert('Attribution queued (job ' + state.attributionJobId + ').', 'success');
        await pollAttributionJob();
      } else {
        showAlert('Server queued a job but returned no job id; check Results shortly.', 'error');
      }
    } else {
      // Sync path (BYOK, or server-creds inline with no executor). Done now.
      body.textContent = JSON.stringify(data, null, 2);
      var pairs = (data && typeof data.pair_count === 'number') ? data.pair_count : '?';
      showAlert('Attribution finished (' + pairs + ' pairs).', 'success');
      showTab('results');
      loadRuns();
    }
  } catch (e) {
    var errMsg = e.message || String(e);
    if (BYOK_REQUIRED && /Attribution requires/i.test(errMsg)) {
      errMsg = 'Attribution needs your own AI credentials. Add your AI Gateway URL and Anthropic API key in Setup, then run again.';
    }
    body.textContent = errMsg;
    showAlert(errMsg, 'error');
  } finally {
    state.attributionPolling = false;
    btn.disabled = false;
    updateAttributeButtonLabel();
    updateWritableUi();
  }
}

async function pollAttributionJob() {
  if (!state.investigationId || !state.attributionJobId) return;
  state.attributionPolling = true;
  var body = document.getElementById('attribute-body');
  var btn = document.getElementById('attribute-btn');
  var interval = 2000;         // start at 2s
  var maxInterval = 10000;     // cap each wait at 10s
  var budgetSeconds = 20 * 60; // stop polling after ~20 min; the job continues server-side
  var elapsed = 0;
  var consecutiveFailures = 0;
  var maxConsecutiveFailures = 3;
  while (elapsed < budgetSeconds) {
    var data;
    try {
      data = await api('GET', '/investigations/' + encodeURIComponent(state.investigationId) +
        '/attribution-jobs/' + encodeURIComponent(state.attributionJobId));
      consecutiveFailures = 0; // a good read clears the transient-failure streak
    } catch (e) {
      consecutiveFailures++;
      // A transient status-check blip over a ~20 min window is the expected case;
      // only give up after several in a row. The job keeps running server-side.
      if (consecutiveFailures >= maxConsecutiveFailures) {
        body.textContent = e.message;
        showAlert('Attribution status checks failed ' + consecutiveFailures + ' times in a row; giving up polling. The job continues server-side; check Results shortly.', 'error');
        return;
      }
      showAlert('Attribution status check failed (' + consecutiveFailures + ' of ' + maxConsecutiveFailures + '); retrying shortly.', 'error');
      await new Promise(function(r) { setTimeout(r, interval); });
      elapsed += Math.round(interval / 1000);
      interval = Math.min(Math.round(interval * 1.5), maxInterval);
      continue;
    }
    var job = data && data.job;
    var status = job && job.status;
    if (btn) btn.textContent = status === 'running' ? 'Running…' : 'Queued…';
    body.textContent = JSON.stringify(data, null, 2) +
      '\\n\\nPolling every ' + Math.round(interval / 1000) + 's; safe to leave this tab, ' +
      'results land under Results.';
    if (status === 'completed' || status === 'failed') {
      state.attributionJobId = null; // terminal: stop tracking this job
      if (status === 'completed') {
        var pairs = (job && typeof job.pair_count === 'number') ? job.pair_count : '?';
        showAlert('Attribution completed (' + pairs + ' pairs).', 'success');
        showTab('results');
        loadRuns();
      } else {
        var reason = (job && job.error_message) ? job.error_message : 'no error message provided';
        body.textContent = JSON.stringify(data, null, 2) + '\\n\\nFailed: ' + reason +
          '\\n(Any pairs finished before the failure are still saved under Results.)';
        showAlert('Attribution failed: ' + reason, 'error');
        loadRuns();
      }
      return;
    }
    await new Promise(function(r) { setTimeout(r, interval); });
    elapsed += Math.round(interval / 1000);
    interval = Math.min(Math.round(interval * 1.5), maxInterval);
  }
  showAlert('Attribution is taking longer than expected; it continues server-side. Check Results shortly.', 'error');
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
  renderSavedInvestigations();
  updateWritableUi();

  var params = new URLSearchParams(window.location.search);
  var linkId = params.get('investigation');
  var linkToken = params.get('token');
  if (linkId && linkToken) {
    openInvestigationWith(linkId, linkToken).then(function() {
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, '', window.location.pathname);
      }
      showTab('investigation');
      showAlert('Opened investigation from link.', 'success');
    }).catch(function(e) {
      showAlert(e.message, 'error');
    });
  }

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

// Headers always forwarded to the backend: neither is a credential.
const PROXY_FORWARD_HEADERS = [
  'content-type',
  'x-ai-gateway-url',
];

// Capability / credential secrets. Forwarded ONLY to a trusted backend target
// (the service binding, the deployer-configured DEFAULT_BACKEND_URL, or an
// allowlisted / loopback dev override) -- never to an arbitrary caller-supplied
// `?backend=` host. See resolveBackend() (issue #66).
const PROXY_SENSITIVE_HEADERS = [
  'authorization',
  'x-anthropic-api-key',
  'x-investigation-token',
];

function buildProxyHeaders(request, forwardSensitive) {
  const headers = new Headers();
  for (const name of PROXY_FORWARD_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (forwardSensitive) {
    for (const name of PROXY_SENSITIVE_HEADERS) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
  }
  return headers;
}

function renderHtml(env) {
  const publicUrl = (env.PUBLIC_URL || '').replace(/\/$/, '');
  const siteHeader = publicUrl
    ? '<a href="' + publicUrl + '" class="text-xs text-slate-500 hidden sm:inline hover:underline">' + publicUrl + '</a>'
    : '';
  const byokRequired = String(env.BYOK_REQUIRED || '').toLowerCase() === 'true';
  return HTML
    .replace('__SITE_HEADER__', siteHeader)
    .replace('__BYOK_REQUIRED__', byokRequired ? 'true' : 'false');
}

function normalizeBase(value) {
  return String(value).replace(/\/+$/, '');
}

function isLoopbackOrigin(origin) {
  return /^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(origin);
}

function backendOriginAllowlist(env) {
  return String(env.BACKEND_ORIGIN_ALLOWLIST || '')
    .split(',')
    .map(s => normalizeBase(s.trim()))
    .filter(Boolean);
}

/**
 * Decide which backend a proxied request targets, and whether that target is
 * trusted enough to receive capability / credential headers.
 *
 * Trust model (issue #66):
 *   - `env.BACKEND` service binding present  -> dispatch via the binding. A
 *     caller-supplied `?backend=` override is REJECTED with an explicit 400
 *     rather than silently ignored.
 *   - No binding, caller supplied `?backend=` -> honored ONLY when its origin is
 *     a loopback dev address or listed in `BACKEND_ORIGIN_ALLOWLIST`. Any other
 *     override is REJECTED (403) and never fetched, so credentials are never
 *     forwarded to an attacker-named host (no SSRF, no credential exfiltration).
 *   - No binding, no override -> the deployer-configured `DEFAULT_BACKEND_URL`,
 *     else a loopback fallback for local dev.
 *
 * Local-dev workflow this preserves: run the web worker with no service binding
 * (`wrangler dev --config web/wrangler.toml`), set the UI "Backend URL" field to
 * the local backend (e.g. http://127.0.0.1:8787 from `npm run dev`), which sends
 * `?backend=<url>`. Loopback origins are allowed with no extra config; a remote
 * dev backend must be added to `BACKEND_ORIGIN_ALLOWLIST`.
 *
 * Returns { viaBinding, base, trusted } or { error: { status, message } }.
 */
function resolveBackend(env, url) {
  const hasBinding = !!env.BACKEND;
  const rawOverride = url.searchParams.get('backend');

  if (rawOverride) {
    if (hasBinding) {
      return {
        error: {
          status: 400,
          message: 'backend override is not permitted when a service binding is configured',
        },
      };
    }
    let parsed;
    try {
      parsed = new URL(rawOverride);
    } catch {
      return { error: { status: 400, message: 'invalid backend override URL' } };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { error: { status: 400, message: 'backend override must use http or https' } };
    }
    const allowed =
      isLoopbackOrigin(parsed.origin) ||
      backendOriginAllowlist(env).includes(normalizeBase(parsed.origin));
    if (!allowed) {
      return {
        error: {
          status: 403,
          message: 'backend override origin is not allowed on this deployment',
        },
      };
    }
    return { viaBinding: false, base: normalizeBase(rawOverride), trusted: true };
  }

  if (hasBinding) {
    // Base is unused for routing under a binding (the bound worker routes on
    // path); a stable placeholder keeps URL construction valid.
    return { viaBinding: true, base: 'https://backend.invalid', trusted: true };
  }
  if (env.DEFAULT_BACKEND_URL) {
    return { viaBinding: false, base: normalizeBase(env.DEFAULT_BACKEND_URL), trusted: true };
  }
  return { viaBinding: false, base: 'http://127.0.0.1:8787', trusted: true };
}

function proxyJson(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  });
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
      const decision = resolveBackend(env, url);
      if (decision.error) {
        return proxyJson(decision.error.status, { error: decision.error.message });
      }

      const backendPath = url.pathname.slice('/api/proxy'.length) || '/';
      const targetUrl = new URL(decision.base + backendPath + url.search);
      // Drop proxy-only query params before forwarding.
      targetUrl.searchParams.delete('backend');

      // Credential headers are forwarded only to a trusted target (see
      // resolveBackend); an untrusted override is rejected above before any fetch.
      const headers = buildProxyHeaders(request, decision.trusted);
      const init = {
        method: request.method,
        headers,
      };

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        init.body = await request.arrayBuffer();
      }

      try {
        const targetRequest = new Request(targetUrl.toString(), init);
        if (decision.viaBinding) {
          return await env.BACKEND.fetch(targetRequest);
        }
        return await fetch(targetRequest);
      } catch (e) {
        return proxyJson(502, { error: e.message });
      }
    }

    return new Response('Not found', { status: 404 });
  },
};
