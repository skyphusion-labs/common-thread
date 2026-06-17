// worker.js — Common Thread Web Frontend

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Common Thread • Web Interface</title>
<script src="https://cdn.tailwindcss.com"></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>
body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
.dropzone { transition: all .2s ease; }
.dropzone.dragover { background:#f0f9ff; border-color:#3b82f6; }
</style>
</head>
<body class="bg-slate-50 text-slate-900">
<div class="max-w-screen-2xl mx-auto">
  <div class="bg-white border-b px-6 py-3 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 bg-slate-900 rounded-2xl flex items-center justify-center"><i class="fa-solid fa-link text-white text-xl"></i></div>
      <div>
        <span class="font-semibold text-2xl tracking-tight">Common Thread</span>
        <span class="ml-2 text-sm text-slate-500">Web Interface</span>
      </div>
    </div>
    <div class="flex items-center gap-3 text-sm">
      <a href="https://github.com/skyphusion-labs/common-thread" target="_blank" class="px-3 py-1.5 rounded-xl border hover:bg-slate-50">GitHub</a>
      <a href="https://github.com/skyphusion-labs/common-thread/blob/main/paper" target="_blank" class="px-4 py-1.5 rounded-xl bg-slate-900 text-white hover:bg-black">Read the Paper</a>
      <div class="text-xs text-slate-500">Target: <span id="target-display" class="font-mono">https://your-backend.workers.dev</span></div>
    </div>
  </div>

  <div class="flex">
    <div class="w-64 bg-white border-r min-h-screen p-4">
      <div class="text-xs uppercase tracking-widest text-slate-500 mb-2 px-2">Workflow</div>
      <nav class="space-y-1 text-sm">
        <a href="#" onclick="showTab('quick')" class="nav-link flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-100 nav-active" data-tab="quick">Quick Analysis</a>
        <a href="#" onclick="showTab('backend')" class="nav-link flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-100" data-tab="backend">Backend Integration</a>
      </nav>

      <div class="mt-8 px-2">
        <div class="text-xs uppercase tracking-widest text-slate-500 mb-1">Backend Target</div>
        <input id="backend-target" value="https://your-backend.workers.dev" class="w-full text-xs font-mono border rounded-lg px-2 py-1.5" onchange="updateTarget()">
        <div class="text-[10px] text-slate-500 mt-1">Service binding takes priority when configured.</div>
      </div>
    </div>

    <div class="flex-1 p-6">
      <div id="tab-quick">
        <h2 class="text-2xl font-semibold mb-1">Quick Client-Side Analysis</h2>
        <p class="text-sm text-slate-600 mb-4">Upload Apify JSON (profiles + follower/following lists).</p>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="bg-white rounded-2xl border p-5">
            <div class="font-medium text-sm mb-1">Profiles / Accounts</div>
            <div id="profile-drop" class="dropzone border-2 border-dashed border-slate-300 rounded-xl p-5 text-center text-xs cursor-pointer">Drop Apify profile JSON<input type="file" id="profile-file" accept=".json" class="hidden" multiple></div>
            <div id="profile-status" class="mt-1 text-xs"></div>
          </div>
          <div class="bg-white rounded-2xl border p-5">
            <div class="font-medium text-sm mb-1">Follower Lists</div>
            <div id="follower-drop" class="dropzone border-2 border-dashed border-slate-300 rounded-xl p-5 text-center text-xs cursor-pointer">Drop follower list JSON(s)<input type="file" id="follower-file" accept=".json" class="hidden" multiple></div>
            <div id="follower-status" class="mt-1 text-xs"></div>
          </div>
          <div class="bg-white rounded-2xl border p-5">
            <div class="font-medium text-sm mb-1">Following Lists</div>
            <div id="following-drop" class="dropzone border-2 border-dashed border-slate-300 rounded-xl p-5 text-center text-xs cursor-pointer">Drop following list JSON(s)<input type="file" id="following-file" accept=".json" class="hidden" multiple></div>
            <div id="following-status" class="mt-1 text-xs"></div>
          </div>
        </div>

        <div class="mt-4 bg-white rounded-2xl border p-5">
          <div class="flex items-center justify-between mb-3">
            <div class="font-semibold">Seed Accounts <span id="seed-count" class="text-slate-500">(0)</span></div>
            <button onclick="loadSampleData()" class="text-xs px-2 py-1 rounded border hover:bg-slate-50">Load Sample</button>
          </div>
          <div class="max-h-40 overflow-auto text-xs" id="seed-preview"></div>
          <div class="mt-3 flex gap-2">
            <button onclick="runAllExtractors()" class="flex-1 px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-sm font-medium" id="run-btn" disabled>Run Analysis</button>
            <button onclick="clearAllData()" class="px-3 py-2 border rounded-xl text-sm">Clear</button>
          </div>
        </div>

        <div id="results-panel" class="hidden mt-6">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold">Results</h3>
            <div class="flex gap-2">
              <button onclick="exportFullReport()" class="px-3 py-1.5 text-sm border rounded-xl">Full JSON</button>
            </div>
          </div>
          <div id="summary-cards" class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4"></div>
          <div class="bg-white rounded-2xl border overflow-hidden">
            <div class="px-4 py-2 border-b bg-slate-50 text-sm font-medium">Pairs</div>
            <div class="overflow-auto max-h-80">
              <table class="w-full text-sm" id="pairs-table">
                <thead class="bg-slate-50"><tr><th class="px-3 py-1.5 text-left">A</th><th class="px-3 py-1.5 text-left">B</th><th class="px-3 py-1.5 text-right">Jaccard</th></tr></thead>
                <tbody id="pairs-body"></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div id="tab-backend" class="hidden mt-6">
        <h2 class="text-2xl font-semibold mb-2">Backend Integration</h2>
        <p class="text-sm text-slate-600 mb-4">Calls go through this worker (uses the service binding when configured).</p>

        <div class="flex gap-2 mb-3 flex-wrap">
          <button onclick="callBackend('GET', '/')" class="px-3 py-1.5 text-sm border rounded-xl">GET / (health)</button>
          <button onclick="callBackend('GET', '/investigations')" class="px-3 py-1.5 text-sm border rounded-xl">GET /investigations</button>
        </div>

        <button onclick="pushCurrentAnalysisToBackend()" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm">Push Current Analysis</button>

        <div class="mt-4">
          <div class="font-semibold mb-2">Response</div>
          <pre id="backend-response" class="bg-slate-900 text-emerald-300 p-4 rounded-2xl text-xs overflow-auto max-h-80"></pre>
        </div>
      </div>
    </div>
  </div>
</div>

<script>
var state = { accounts: new Map(), results: null };

function updateTarget() {
  var val = document.getElementById('backend-target').value.trim();
  document.getElementById('target-display').textContent = val || '(service binding)';
}

function showTab(tab) {
  var tabs = document.querySelectorAll('[id^="tab-"]');
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.add('hidden');
  document.getElementById('tab-' + tab).classList.remove('hidden');
}

function updateSeedPreview() {
  var el = document.getElementById('seed-preview');
  var count = document.getElementById('seed-count');
  var list = Array.from(state.accounts.values());
  count.textContent = '(' + list.length + ')';
  var html = '';
  for (var i = 0; i < Math.min(list.length, 12); i++) {
    html = html + '<div class="py-0.5">@' + list[i].account + '</div>';
  }
  if (list.length > 12) {
    html = html + '<div class="text-slate-400">... +' + (list.length - 12) + ' more</div>';
  }
  el.innerHTML = html;
}

function setupDropzones() {
  function setup(dropId, fileId, statusId, kind) {
    var drop = document.getElementById(dropId);
    var input = document.getElementById(fileId);
    var status = document.getElementById(statusId);
    drop.onclick = function() { input.click(); };
    drop.ondragover = function(e) { e.preventDefault(); drop.classList.add('dragover'); };
    drop.ondragleave = function() { drop.classList.remove('dragover'); };
    drop.ondrop = function(e) {
      e.preventDefault(); drop.classList.remove('dragover');
      handleUploadFiles(e.dataTransfer.files, kind, status);
    };
    input.onchange = function() {
      handleUploadFiles(input.files, kind, status);
      input.value = '';
    };
  }
  setup('profile-drop', 'profile-file', 'profile-status', 'profile');
  setup('follower-drop', 'follower-file', 'follower-status', 'follower');
  setup('following-drop', 'following-file', 'following-status', 'following');
}

async function handleUploadFiles(files, kind, statusEl) {
  if (!files || !files.length) return;
  statusEl.innerHTML = '<span class="text-blue-600">Processing ' + files.length + ' file(s)...</span>';
  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    try {
      var text = await file.text();
      var json = JSON.parse(text);
      if (kind === 'profile') parseAndMergeProfiles(json);
      else if (kind === 'follower' || kind === 'following') parseAndMergeLists(json, kind === 'follower');
    } catch (e) {
      alert('Failed to parse ' + file.name + ': ' + e.message);
    }
  }
  updateSeedPreview();
  document.getElementById('run-btn').disabled = state.accounts.size < 2;
  statusEl.innerHTML = '<span class="text-emerald-600">Loaded. ' + state.accounts.size + ' accounts total.</span>';
}

function parseAndMergeProfiles(json) {
  if (!Array.isArray(json)) json = [json];
  for (var i = 0; i < json.length; i++) {
    var item = json[i];
    if (!item || typeof item !== 'object') continue;
    var username = (item.userName || item.username || item.handle || '').toString().trim().toLowerCase().replace(/^@/, '');
    if (!username) continue;
    if (!state.accounts.has(username)) state.accounts.set(username, { account: username, features: new Map() });
    var acc = state.accounts.get(username);
    var fc = Number(item.followers || item.followersCount || item.followerCount);
    if (!isNaN(fc)) acc.features.set('follower_count', { kind: 'numeric', value: fc });
  }
}

function parseAndMergeLists(json, isFollower) {
  var arr = Array.isArray(json) ? json : [json];
  for (var i = 0; i < arr.length; i++) {
    var entry = arr[i];
    if (!entry || typeof entry !== 'object') continue;
    var target = (entry.username || entry.userName || entry.target || '').toString().trim().toLowerCase().replace(/^@/, '');
    if (!target) continue;
    var list = entry.followers || entry.following || [];
    if (!Array.isArray(list)) list = [];
    var handles = list.map(function(h) {
      if (typeof h === 'string') return h.trim().toLowerCase().replace(/^@/, '');
      if (h && typeof h === 'object') return (h.username || h.userName || h.handle || '').toString().trim().toLowerCase().replace(/^@/, '');
      return null;
    }).filter(Boolean);
    if (!state.accounts.has(target)) state.accounts.set(target, { account: target, features: new Map() });
    var acc = state.accounts.get(target);
    var key = isFollower ? 'follower_set' : 'following_set';
    if (!acc.features.has(key)) acc.features.set(key, { kind: 'json', value: [] });
    var current = acc.features.get(key).value;
    for (var k = 0; k < handles.length; k++) {
      if (current.indexOf(handles[k]) === -1) current.push(handles[k]);
    }
  }
}

function loadSampleData() {
  state.accounts.clear();
  var sample = [
    { account: 'alice', follower_set: ['bob','charlie','dave','eve'] },
    { account: 'bob', follower_set: ['alice','charlie','dave'] },
    { account: 'charlie', follower_set: ['alice','bob'] }
  ];
  for (var i = 0; i < sample.length; i++) {
    var s = sample[i];
    var f = new Map();
    f.set('follower_set', { kind: 'json', value: s.follower_set });
    state.accounts.set(s.account, { account: s.account, features: f });
  }
  updateSeedPreview();
  document.getElementById('run-btn').disabled = false;
}

function clearAllData() {
  state.accounts.clear();
  state.results = null;
  document.getElementById('seed-preview').innerHTML = '';
  document.getElementById('seed-count').textContent = '(0)';
  document.getElementById('results-panel').classList.add('hidden');
  document.getElementById('run-btn').disabled = true;
  var statuses = document.querySelectorAll('[id$="-status"]');
  for (var i = 0; i < statuses.length; i++) statuses[i].innerHTML = '';
}

function runAllExtractors() {
  var list = Array.from(state.accounts.values());
  if (list.length < 2) return;
  var results = [];
  for (var i = 0; i < list.length; i++) {
    for (var j = i + 1; j < list.length; j++) {
      var a = list[i], b = list[j];
      var setA = new Set((a.features.get('follower_set') || {value:[]}).value);
      var setB = new Set((b.features.get('follower_set') || {value:[]}).value);
      var inter = 0;
      setA.forEach(function(x){ if (setB.has(x)) inter++; });
      var union = setA.size + setB.size - inter;
      var jac = union > 0 ? inter / union : 0;
      results.push({ a: a.account, b: b.account, jaccard: jac });
    }
  }
  state.results = { pairs: results };
  renderResults(state.results);
}

function renderResults(res) {
  document.getElementById('results-panel').classList.remove('hidden');
  var cards = document.getElementById('summary-cards');
  cards.innerHTML =
    '<div class="bg-white border rounded-2xl p-4"><div class="text-xs text-slate-500">Accounts</div><div class="text-2xl font-semibold">' + state.accounts.size + '</div></div>' +
    '<div class="bg-white border rounded-2xl p-4"><div class="text-xs text-slate-500">Pairs</div><div class="text-2xl font-semibold">' + (res.pairs ? res.pairs.length : 0) + '</div></div>';

  var body = document.getElementById('pairs-body');
  body.innerHTML = '';
  if (res.pairs) {
    for (var i = 0; i < res.pairs.length; i++) {
      var p = res.pairs[i];
      var tr = document.createElement('tr');
      tr.className = 'border-t';
      tr.innerHTML = '<td class="px-3 py-1.5">@' + p.a + '</td><td class="px-3 py-1.5">@' + p.b + '</td><td class="px-3 py-1.5 text-right">' + p.jaccard.toFixed(4) + '</td>';
      body.appendChild(tr);
    }
  }
}

function exportFullReport() {
  var data = { generatedAt: new Date().toISOString(), accounts: Array.from(state.accounts.values()), results: state.results };
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a'); a.href = url; a.download = 'common-thread-report.json'; a.click(); URL.revokeObjectURL(url);
}

async function callBackend(method, path) {
  var respEl = document.getElementById('backend-response');
  respEl.textContent = 'Calling...';
  try {
    var res = await fetch('/api/proxy' + path, { method: method });
    var text = await res.text();
    respEl.textContent = text;
  } catch (e) {
    respEl.textContent = 'Error: ' + e.message;
    console.error(e);
  }
}

async function pushCurrentAnalysisToBackend() {
  var payload = { accounts: Array.from(state.accounts.values()), results: state.results };
  console.log('Payload:', payload);
  await callBackend('POST', '/features');
}

function init() {
  try {
    setupDropzones();
    updateTarget();
    document.getElementById('backend-target').addEventListener('input', updateTarget);
    document.getElementById('run-btn').disabled = state.accounts.size < 2;
    console.log('[Common Thread Web] init complete');
  } catch (e) {
    console.error('Init error:', e);
  }
}

window.onload = init;
</script>
</body>
</html>`;

// Cloudflare Worker
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/') {
      return new Response(HTML, {
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    if (url.pathname.startsWith('/api/proxy/')) {
      const backendPath = '/' + url.pathname.split('/api/proxy/')[1];
      const defaultUrl = env.DEFAULT_BACKEND_URL || 'https://your-backend.workers.dev';
      const target = defaultUrl + backendPath;

      try {
        if (env.BACKEND) {
          const init = { method: request.method, headers: request.headers };
          if (request.method !== 'GET' && request.method !== 'HEAD') {
            init.body = await request.arrayBuffer();
          }
          return await env.BACKEND.fetch(new Request(target, init));
        } else {
          return await fetch(target, { method: request.method, headers: request.headers, body: request.body });
        }
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 502 });
      }
    }

    return new Response('Not found', { status: 404 });
  }
};
