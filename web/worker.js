// worker.js — Common Thread Web Frontend
//
// Self-contained: NO external CDN or runtime dependency (house rule). Tailwind
// CSS is prebuilt and inlined below (regen: see web/README-assets.md); icons
// are inline SVG (Feather geometry, MIT). Served as same-origin /app.css and
// /app.js so a strict Content-Security-Policy needs no 'unsafe-inline'.

const CSS = `*,:after,:before{--tw-border-spacing-x:0;--tw-border-spacing-y:0;--tw-translate-x:0;--tw-translate-y:0;--tw-rotate:0;--tw-skew-x:0;--tw-skew-y:0;--tw-scale-x:1;--tw-scale-y:1;--tw-pan-x: ;--tw-pan-y: ;--tw-pinch-zoom: ;--tw-scroll-snap-strictness:proximity;--tw-gradient-from-position: ;--tw-gradient-via-position: ;--tw-gradient-to-position: ;--tw-ordinal: ;--tw-slashed-zero: ;--tw-numeric-figure: ;--tw-numeric-spacing: ;--tw-numeric-fraction: ;--tw-ring-inset: ;--tw-ring-offset-width:0px;--tw-ring-offset-color:#fff;--tw-ring-color:rgba(59,130,246,.5);--tw-ring-offset-shadow:0 0 #0000;--tw-ring-shadow:0 0 #0000;--tw-shadow:0 0 #0000;--tw-shadow-colored:0 0 #0000;--tw-blur: ;--tw-brightness: ;--tw-contrast: ;--tw-grayscale: ;--tw-hue-rotate: ;--tw-invert: ;--tw-saturate: ;--tw-sepia: ;--tw-drop-shadow: ;--tw-backdrop-blur: ;--tw-backdrop-brightness: ;--tw-backdrop-contrast: ;--tw-backdrop-grayscale: ;--tw-backdrop-hue-rotate: ;--tw-backdrop-invert: ;--tw-backdrop-opacity: ;--tw-backdrop-saturate: ;--tw-backdrop-sepia: ;--tw-contain-size: ;--tw-contain-layout: ;--tw-contain-paint: ;--tw-contain-style: }::backdrop{--tw-border-spacing-x:0;--tw-border-spacing-y:0;--tw-translate-x:0;--tw-translate-y:0;--tw-rotate:0;--tw-skew-x:0;--tw-skew-y:0;--tw-scale-x:1;--tw-scale-y:1;--tw-pan-x: ;--tw-pan-y: ;--tw-pinch-zoom: ;--tw-scroll-snap-strictness:proximity;--tw-gradient-from-position: ;--tw-gradient-via-position: ;--tw-gradient-to-position: ;--tw-ordinal: ;--tw-slashed-zero: ;--tw-numeric-figure: ;--tw-numeric-spacing: ;--tw-numeric-fraction: ;--tw-ring-inset: ;--tw-ring-offset-width:0px;--tw-ring-offset-color:#fff;--tw-ring-color:rgba(59,130,246,.5);--tw-ring-offset-shadow:0 0 #0000;--tw-ring-shadow:0 0 #0000;--tw-shadow:0 0 #0000;--tw-shadow-colored:0 0 #0000;--tw-blur: ;--tw-brightness: ;--tw-contrast: ;--tw-grayscale: ;--tw-hue-rotate: ;--tw-invert: ;--tw-saturate: ;--tw-sepia: ;--tw-drop-shadow: ;--tw-backdrop-blur: ;--tw-backdrop-brightness: ;--tw-backdrop-contrast: ;--tw-backdrop-grayscale: ;--tw-backdrop-hue-rotate: ;--tw-backdrop-invert: ;--tw-backdrop-opacity: ;--tw-backdrop-saturate: ;--tw-backdrop-sepia: ;--tw-contain-size: ;--tw-contain-layout: ;--tw-contain-paint: ;--tw-contain-style: }/*! tailwindcss v3.4.19 | MIT License | https://tailwindcss.com*/*,:after,:before{box-sizing:border-box;border:0 solid #e5e7eb}:after,:before{--tw-content:""}:host,html{line-height:1.5;-webkit-text-size-adjust:100%;-moz-tab-size:4;-o-tab-size:4;tab-size:4;font-family:ui-sans-serif,system-ui,sans-serif,Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol,Noto Color Emoji;font-feature-settings:normal;font-variation-settings:normal;-webkit-tap-highlight-color:transparent}body{margin:0;line-height:inherit}hr{height:0;color:inherit;border-top-width:1px}abbr:where([title]){-webkit-text-decoration:underline dotted;text-decoration:underline dotted}h1,h2,h3,h4,h5,h6{font-size:inherit;font-weight:inherit}a{color:inherit;text-decoration:inherit}b,strong{font-weight:bolder}code,kbd,pre,samp{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,Liberation Mono,Courier New,monospace;font-feature-settings:normal;font-variation-settings:normal;font-size:1em}small{font-size:80%}sub,sup{font-size:75%;line-height:0;position:relative;vertical-align:baseline}sub{bottom:-.25em}sup{top:-.5em}table{text-indent:0;border-color:inherit;border-collapse:collapse}button,input,optgroup,select,textarea{font-family:inherit;font-feature-settings:inherit;font-variation-settings:inherit;font-size:100%;font-weight:inherit;line-height:inherit;letter-spacing:inherit;color:inherit;margin:0;padding:0}button,select{text-transform:none}button,input:where([type=button]),input:where([type=reset]),input:where([type=submit]){-webkit-appearance:button;background-color:transparent;background-image:none}:-moz-focusring{outline:auto}:-moz-ui-invalid{box-shadow:none}progress{vertical-align:baseline}::-webkit-inner-spin-button,::-webkit-outer-spin-button{height:auto}[type=search]{-webkit-appearance:textfield;outline-offset:-2px}::-webkit-search-decoration{-webkit-appearance:none}::-webkit-file-upload-button{-webkit-appearance:button;font:inherit}summary{display:list-item}blockquote,dd,dl,figure,h1,h2,h3,h4,h5,h6,hr,p,pre{margin:0}fieldset{margin:0}fieldset,legend{padding:0}menu,ol,ul{list-style:none;margin:0;padding:0}dialog{padding:0}textarea{resize:vertical}input::-moz-placeholder,textarea::-moz-placeholder{opacity:1;color:#9ca3af}input::placeholder,textarea::placeholder{opacity:1;color:#9ca3af}[role=button],button{cursor:pointer}:disabled{cursor:default}audio,canvas,embed,iframe,img,object,svg,video{display:block;vertical-align:middle}img,video{max-width:100%;height:auto}[hidden]:where(:not([hidden=until-found])){display:none}.\\!container{width:100%!important}.container{width:100%}@media (min-width:640px){.\\!container{max-width:640px!important}.container{max-width:640px}}@media (min-width:768px){.\\!container{max-width:768px!important}.container{max-width:768px}}@media (min-width:1024px){.\\!container{max-width:1024px!important}.container{max-width:1024px}}@media (min-width:1280px){.\\!container{max-width:1280px!important}.container{max-width:1280px}}@media (min-width:1536px){.\\!container{max-width:1536px!important}.container{max-width:1536px}}.mx-auto{margin-left:auto;margin-right:auto}.mb-1{margin-bottom:.25rem}.mb-2{margin-bottom:.5rem}.mb-3{margin-bottom:.75rem}.mb-4{margin-bottom:1rem}.mb-6{margin-bottom:1.5rem}.mt-1{margin-top:.25rem}.mt-2{margin-top:.5rem}.mt-4{margin-top:1rem}.mt-6{margin-top:1.5rem}.block{display:block}.inline-block{display:inline-block}.inline{display:inline}.flex{display:flex}.table{display:table}.grid{display:grid}.hidden{display:none}.h-10{height:2.5rem}.h-11{height:2.75rem}.h-28{height:7rem}.h-4{height:1rem}.h-5{height:1.25rem}.h-6{height:1.5rem}.h-8{height:2rem}.max-h-40{max-height:10rem}.max-h-48{max-height:12rem}.max-h-64{max-height:16rem}.max-h-96{max-height:24rem}.max-h-\\[28rem\\]{max-height:28rem}.min-h-\\[calc\\(100vh-4rem\\)\\]{min-height:calc(100vh - 4rem)}.w-10{width:2.5rem}.w-11{width:2.75rem}.w-4{width:1rem}.w-5{width:1.25rem}.w-6{width:1.5rem}.w-64{width:16rem}.w-8{width:2rem}.w-full{width:100%}.min-w-0{min-width:0}.max-w-2xl{max-width:42rem}.max-w-screen-2xl{max-width:1536px}.flex-1{flex:1 1 0%}.shrink-0{flex-shrink:0}.cursor-pointer{cursor:pointer}.list-inside{list-style-position:inside}.list-decimal{list-style-type:decimal}.grid-cols-1{grid-template-columns:repeat(1,minmax(0,1fr))}.grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}.grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}.flex-wrap{flex-wrap:wrap}.items-start{align-items:flex-start}.items-center{align-items:center}.justify-center{justify-content:center}.justify-between{justify-content:space-between}.gap-2{gap:.5rem}.gap-3{gap:.75rem}.gap-4{gap:1rem}.gap-6{gap:1.5rem}.space-x-2>:not([hidden])~:not([hidden]){--tw-space-x-reverse:0;margin-right:calc(.5rem*var(--tw-space-x-reverse));margin-left:calc(.5rem*(1 - var(--tw-space-x-reverse)))}.space-y-1>:not([hidden])~:not([hidden]){--tw-space-y-reverse:0;margin-top:calc(.25rem*(1 - var(--tw-space-y-reverse)));margin-bottom:calc(.25rem*var(--tw-space-y-reverse))}.space-y-2>:not([hidden])~:not([hidden]){--tw-space-y-reverse:0;margin-top:calc(.5rem*(1 - var(--tw-space-y-reverse)));margin-bottom:calc(.5rem*var(--tw-space-y-reverse))}.space-y-3>:not([hidden])~:not([hidden]){--tw-space-y-reverse:0;margin-top:calc(.75rem*(1 - var(--tw-space-y-reverse)));margin-bottom:calc(.75rem*var(--tw-space-y-reverse))}.space-y-4>:not([hidden])~:not([hidden]){--tw-space-y-reverse:0;margin-top:calc(1rem*(1 - var(--tw-space-y-reverse)));margin-bottom:calc(1rem*var(--tw-space-y-reverse))}.space-y-5>:not([hidden])~:not([hidden]){--tw-space-y-reverse:0;margin-top:calc(1.25rem*(1 - var(--tw-space-y-reverse)));margin-bottom:calc(1.25rem*var(--tw-space-y-reverse))}.overflow-auto{overflow:auto}.overflow-hidden{overflow:hidden}.break-all{word-break:break-all}.rounded{border-radius:.25rem}.rounded-2xl{border-radius:1rem}.rounded-lg{border-radius:.5rem}.rounded-xl{border-radius:.75rem}.border{border-width:1px}.border-2{border-width:2px}.border-b{border-bottom-width:1px}.border-r{border-right-width:1px}.border-t{border-top-width:1px}.border-dashed{border-style:dashed}.border-amber-200{--tw-border-opacity:1;border-color:rgb(253 230 138/var(--tw-border-opacity,1))}.border-emerald-200{--tw-border-opacity:1;border-color:rgb(167 243 208/var(--tw-border-opacity,1))}.border-red-200{--tw-border-opacity:1;border-color:rgb(254 202 202/var(--tw-border-opacity,1))}.border-slate-300{--tw-border-opacity:1;border-color:rgb(203 213 225/var(--tw-border-opacity,1))}.border-violet-200{--tw-border-opacity:1;border-color:rgb(221 214 254/var(--tw-border-opacity,1))}.bg-amber-100{--tw-bg-opacity:1;background-color:rgb(254 243 199/var(--tw-bg-opacity,1))}.bg-amber-50{--tw-bg-opacity:1;background-color:rgb(255 251 235/var(--tw-bg-opacity,1))}.bg-emerald-100{--tw-bg-opacity:1;background-color:rgb(209 250 229/var(--tw-bg-opacity,1))}.bg-emerald-50{--tw-bg-opacity:1;background-color:rgb(236 253 245/var(--tw-bg-opacity,1))}.bg-emerald-600{--tw-bg-opacity:1;background-color:rgb(5 150 105/var(--tw-bg-opacity,1))}.bg-red-100{--tw-bg-opacity:1;background-color:rgb(254 226 226/var(--tw-bg-opacity,1))}.bg-red-50{--tw-bg-opacity:1;background-color:rgb(254 242 242/var(--tw-bg-opacity,1))}.bg-slate-100{--tw-bg-opacity:1;background-color:rgb(241 245 249/var(--tw-bg-opacity,1))}.bg-slate-50{--tw-bg-opacity:1;background-color:rgb(248 250 252/var(--tw-bg-opacity,1))}.bg-slate-900{--tw-bg-opacity:1;background-color:rgb(15 23 42/var(--tw-bg-opacity,1))}.bg-violet-100{--tw-bg-opacity:1;background-color:rgb(237 233 254/var(--tw-bg-opacity,1))}.bg-violet-50{--tw-bg-opacity:1;background-color:rgb(245 243 255/var(--tw-bg-opacity,1))}.bg-violet-600{--tw-bg-opacity:1;background-color:rgb(124 58 237/var(--tw-bg-opacity,1))}.bg-white{--tw-bg-opacity:1;background-color:rgb(255 255 255/var(--tw-bg-opacity,1))}.bg-gradient-to-br{background-image:linear-gradient(to bottom right,var(--tw-gradient-stops))}.from-violet-50{--tw-gradient-from:#f5f3ff var(--tw-gradient-from-position);--tw-gradient-to:rgba(245,243,255,0) var(--tw-gradient-to-position);--tw-gradient-stops:var(--tw-gradient-from),var(--tw-gradient-to)}.to-white{--tw-gradient-to:#fff var(--tw-gradient-to-position)}.p-10{padding:2.5rem}.p-3{padding:.75rem}.p-4{padding:1rem}.p-5{padding:1.25rem}.p-6{padding:1.5rem}.px-1{padding-left:.25rem;padding-right:.25rem}.px-2{padding-left:.5rem;padding-right:.5rem}.px-3{padding-left:.75rem;padding-right:.75rem}.px-4{padding-left:1rem;padding-right:1rem}.px-6{padding-left:1.5rem;padding-right:1.5rem}.py-0\\.5{padding-top:.125rem;padding-bottom:.125rem}.py-1{padding-top:.25rem;padding-bottom:.25rem}.py-1\\.5{padding-top:.375rem;padding-bottom:.375rem}.py-2{padding-top:.5rem;padding-bottom:.5rem}.py-3{padding-top:.75rem;padding-bottom:.75rem}.pt-1{padding-top:.25rem}.pt-3{padding-top:.75rem}.text-left{text-align:left}.text-center{text-align:center}.font-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,Liberation Mono,Courier New,monospace}.text-2xl{font-size:1.5rem;line-height:2rem}.text-\\[10px\\]{font-size:10px}.text-\\[11px\\]{font-size:11px}.text-base{font-size:1rem;line-height:1.5rem}.text-lg{font-size:1.125rem;line-height:1.75rem}.text-sm{font-size:.875rem;line-height:1.25rem}.text-xl{font-size:1.25rem;line-height:1.75rem}.text-xs{font-size:.75rem;line-height:1rem}.font-medium{font-weight:500}.font-semibold{font-weight:600}.uppercase{text-transform:uppercase}.tracking-tight{letter-spacing:-.025em}.tracking-widest{letter-spacing:.1em}.text-amber-700{--tw-text-opacity:1;color:rgb(180 83 9/var(--tw-text-opacity,1))}.text-amber-900{--tw-text-opacity:1;color:rgb(120 53 15/var(--tw-text-opacity,1))}.text-blue-700{--tw-text-opacity:1;color:rgb(29 78 216/var(--tw-text-opacity,1))}.text-emerald-300{--tw-text-opacity:1;color:rgb(110 231 183/var(--tw-text-opacity,1))}.text-emerald-800{--tw-text-opacity:1;color:rgb(6 95 70/var(--tw-text-opacity,1))}.text-emerald-900{--tw-text-opacity:1;color:rgb(6 78 59/var(--tw-text-opacity,1))}.text-red-600{--tw-text-opacity:1;color:rgb(220 38 38/var(--tw-text-opacity,1))}.text-red-800{--tw-text-opacity:1;color:rgb(153 27 27/var(--tw-text-opacity,1))}.text-slate-400{--tw-text-opacity:1;color:rgb(148 163 184/var(--tw-text-opacity,1))}.text-slate-500{--tw-text-opacity:1;color:rgb(100 116 139/var(--tw-text-opacity,1))}.text-slate-600{--tw-text-opacity:1;color:rgb(71 85 105/var(--tw-text-opacity,1))}.text-slate-700{--tw-text-opacity:1;color:rgb(51 65 85/var(--tw-text-opacity,1))}.text-slate-900{--tw-text-opacity:1;color:rgb(15 23 42/var(--tw-text-opacity,1))}.text-violet-800{--tw-text-opacity:1;color:rgb(91 33 182/var(--tw-text-opacity,1))}.text-white{--tw-text-opacity:1;color:rgb(255 255 255/var(--tw-text-opacity,1))}.underline{text-decoration-line:underline}.filter{filter:var(--tw-blur) var(--tw-brightness) var(--tw-contrast) var(--tw-grayscale) var(--tw-hue-rotate) var(--tw-invert) var(--tw-saturate) var(--tw-sepia) var(--tw-drop-shadow)}.transition{transition-property:color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,-webkit-backdrop-filter;transition-property:color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,backdrop-filter;transition-property:color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,backdrop-filter,-webkit-backdrop-filter;transition-timing-function:cubic-bezier(.4,0,.2,1);transition-duration:.15s}.hover\\:bg-black:hover{--tw-bg-opacity:1;background-color:rgb(0 0 0/var(--tw-bg-opacity,1))}.hover\\:bg-emerald-700:hover{--tw-bg-opacity:1;background-color:rgb(4 120 87/var(--tw-bg-opacity,1))}.hover\\:bg-slate-100:hover{--tw-bg-opacity:1;background-color:rgb(241 245 249/var(--tw-bg-opacity,1))}.hover\\:bg-slate-50:hover{--tw-bg-opacity:1;background-color:rgb(248 250 252/var(--tw-bg-opacity,1))}.hover\\:bg-violet-700:hover{--tw-bg-opacity:1;background-color:rgb(109 40 217/var(--tw-bg-opacity,1))}.hover\\:bg-white:hover{--tw-bg-opacity:1;background-color:rgb(255 255 255/var(--tw-bg-opacity,1))}.hover\\:underline:hover{text-decoration-line:underline}.disabled\\:cursor-not-allowed:disabled{cursor:not-allowed}.disabled\\:opacity-50:disabled{opacity:.5}@media (min-width:640px){.sm\\:inline{display:inline}}@media (min-width:768px){.md\\:grid-cols-4{grid-template-columns:repeat(4,minmax(0,1fr))}}@media (min-width:1024px){.lg\\:grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}}
body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
.dropzone { transition: all .2s ease; }
.dropzone.dragover { background:#f0f9ff; border-color:#3b82f6; }
.nav-active { background:#f1f5f9; font-weight:600; }
.band-insufficient { background:#fef2f2; color:#991b1b; }
.band-consistent { background:#fffbeb; color:#92400e; }
.band-strongly_consistent { background:#ecfdf5; color:#065f46; }`;

const APP_JS = `var state = {
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
var PUBLIC_BYOK_ONLY = __PUBLIC_BYOK_ONLY__;

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
  if (PUBLIC_BYOK_ONLY) {
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
    el.textContent = PUBLIC_BYOK_ONLY
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
  updateByokGate();
  var ingestBtn = document.getElementById('ingest-btn');
  var attributeBtn = document.getElementById('attribute-btn');
  if (ingestBtn) ingestBtn.disabled = !writable || state.selectedFiles.length === 0;
  if (attributeBtn) attributeBtn.disabled = !writable || (PUBLIC_BYOK_ONLY && !hasByokCredentials());
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
  if (PUBLIC_BYOK_ONLY && !hasByokCredentials()) {
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
    // Match the structured backend code (byok_required, HTTP 400) first;
    // keep the legacy 503 English match for the pre-contract transition window.
    if (PUBLIC_BYOK_ONLY && (/byok_required/i.test(errMsg) || /Attribution requires/i.test(errMsg))) {
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

function dispatchDataAction(e) {
  var el = e.target.closest('[data-action]');
  if (!el) return;
  var fn = window[el.getAttribute('data-action')];
  if (typeof fn === 'function') { e.preventDefault(); fn(); }
}

function gotoSetup() {
  showTab('setup');
}

// Public no-credentials first-run: show the branded BYOK explainer and hide the
// run controls until the visitor supplies their own key.
function updateByokGate() {
  var gate = document.getElementById('byok-gate');
  var controls = document.getElementById('attribute-controls');
  if (!gate) return;
  var blocked = PUBLIC_BYOK_ONLY && !hasByokCredentials();
  gate.classList.toggle('hidden', !blocked);
  if (controls) controls.classList.toggle('hidden', blocked);
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

  document.body.addEventListener('click', dispatchDataAction);
  updateByokGate();
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

window.onload = init;`;

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Common Thread</title>
<link rel="stylesheet" href="/app.css">
</head>
<body class="bg-slate-50 text-slate-900">
<div class="max-w-screen-2xl mx-auto">
  <header class="bg-white border-b px-6 py-3 flex items-center justify-between gap-4">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 bg-slate-900 rounded-2xl flex items-center justify-center"><svg class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></div>
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
        <a href="#" data-tab="setup" class="nav-link flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-100 nav-active"><svg class="w-4 h-4 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> Setup</a>
        <a href="#" data-tab="investigation" class="nav-link flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-100"><svg class="w-4 h-4 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> Investigation</a>
        <a href="#" data-tab="upload" class="nav-link flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-100"><svg class="w-4 h-4 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Upload Data</a>
        <a href="#" data-tab="features" class="nav-link flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-100"><svg class="w-4 h-4 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> Features</a>
        <a href="#" data-tab="attribute" class="nav-link flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-100"><svg class="w-4 h-4 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg> Attribution</a>
        <a href="#" data-tab="results" class="nav-link flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-100"><svg class="w-4 h-4 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> Results</a>
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
            <button data-action="checkHealth" class="px-4 py-2 border rounded-xl text-sm hover:bg-slate-50">Test connection</button>
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
            <button data-action="saveSettings" class="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm hover:bg-black">Save settings</button>
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
            <button data-action="createInvestigation" class="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm hover:bg-black">Create</button>
          </div>
          <div class="bg-white rounded-2xl border p-5 space-y-3">
            <h3 class="font-semibold">Open with access token</h3>
            <input id="open-inv-id" class="w-full border rounded-xl px-3 py-2 text-sm font-mono" placeholder="investigation-id">
            <input id="open-inv-token" type="password" class="w-full border rounded-xl px-3 py-2 text-sm font-mono" placeholder="ct_…" autocomplete="off">
            <button data-action="openInvestigation" class="px-4 py-2 border rounded-xl text-sm hover:bg-slate-50">Open</button>
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
            <button data-action="copyRevealedToken" class="px-3 py-2 border rounded-xl text-xs hover:bg-white">Copy token</button>
            <button data-action="copyShareLink" class="px-3 py-2 border rounded-xl text-xs hover:bg-white">Copy link</button>
          </div>
        </div>

        <div id="investigation-summary" class="hidden mt-6 bg-white rounded-2xl border p-5">
          <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h3 class="font-semibold">Summary</h3>
            <div class="flex items-center gap-2">
              <span id="investigation-status-badge" class="text-xs px-2 py-1 rounded-lg bg-slate-100 text-slate-700">active</span>
              <button id="seal-btn" data-action="sealInvestigation" class="text-xs px-3 py-1.5 border rounded-lg hover:bg-slate-50">Seal (read-only)</button>
            </div>
          </div>
          <p id="sealed-banner" class="hidden mb-3 text-xs text-violet-800 bg-violet-50 border border-violet-200 rounded-xl px-3 py-2">This investigation is sealed. You can review data and download evidence packets, but ingest and attribution are disabled.</p>
          <div id="summary-content" class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm"></div>
          <div class="mt-4">
            <div class="flex items-center justify-between mb-2">
              <h4 class="font-medium text-sm">Seed accounts</h4>
              <button data-action="loadSeeds" class="text-xs px-2 py-1 border rounded-lg hover:bg-slate-50">Refresh</button>
            </div>
            <div id="seeds-list" class="max-h-48 overflow-auto text-xs font-mono"></div>
          </div>
          <div class="mt-4">
            <h4 class="font-medium text-sm mb-1">Triggering events (§4.2.2)</h4>
            <p class="text-xs text-slate-500 mb-2">Configure practitioner-supplied events for response-latency extractors. Save before ingest when latency signals matter.</p>
            <textarea id="triggering-events-json" class="w-full border rounded-xl px-3 py-2 text-xs font-mono h-28" placeholder='[{"id":"evt1","timestamp":"2025-01-01T12:00:00.000Z","label":"optional label"}]'></textarea>
            <button data-action="saveTriggeringEvents" class="mt-2 text-xs px-3 py-1.5 border rounded-lg hover:bg-slate-50">Save triggering events</button>
          </div>
        </div>
      </section>

      <!-- Upload -->
      <section id="tab-upload" class="hidden">
        <h2 class="text-2xl font-semibold mb-1">Upload Apify Twitter data</h2>
        <p class="text-sm text-slate-600 mb-6">Upload Apify JSON exports (profiles, timelines, follower/following lists). The backend archives raw data and runs extractors.</p>

        <div id="upload-drop" class="dropzone bg-white border-2 border-dashed border-slate-300 rounded-2xl p-10 text-center cursor-pointer mb-4">
          <svg class="w-8 h-8 text-slate-400 mb-2 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/></svg>
          <div class="text-sm font-medium">Drop JSON files here or click to browse</div>
          <div class="text-xs text-slate-500 mt-1">Multiple files supported</div>
          <input type="file" id="upload-files" accept=".json,application/json" multiple class="hidden">
        </div>
        <div id="upload-file-list" class="text-xs text-slate-600 mb-4"></div>
        <button data-action="startIngest" id="ingest-btn" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm disabled:opacity-50" disabled>Upload &amp; ingest</button>

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
          <button data-action="loadFeatures" class="px-3 py-1.5 border rounded-xl text-sm hover:bg-white">Refresh</button>
        </div>
        <div id="features-summary" class="grid grid-cols-3 gap-3 mb-4"></div>
        <pre id="features-body" class="text-xs bg-slate-900 text-emerald-300 p-4 rounded-2xl overflow-auto max-h-[28rem]"></pre>
      </section>

      <!-- Attribution -->
      <section id="tab-attribute" class="hidden">
        <h2 class="text-2xl font-semibold mb-1">Attribution</h2>
        <p class="text-sm text-slate-600 mb-6">Run LLM reasoning over all active seed pairs. Requires AI credentials from Setup.</p>

        <div id="byok-gate" class="hidden mb-6 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-6 max-w-2xl">
          <div class="flex items-start gap-4">
            <div class="w-11 h-11 shrink-0 bg-violet-600 rounded-2xl flex items-center justify-center"><svg class="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg></div>
            <div class="space-y-3">
              <div>
                <h3 class="font-semibold text-lg text-slate-900">This public instance runs on your own API key</h3>
                <p class="text-sm text-slate-600 mt-1">Common Thread never charges you for attribution and never uses a shared key. Bring your own Anthropic API key (optionally via a Cloudflare AI Gateway) to run the reasoning step. Your key stays in your browser and is sent only when you run attribution.</p>
              </div>
              <ol class="text-sm text-slate-700 space-y-1 list-decimal list-inside">
                <li>Create an Anthropic API key at <a class="text-blue-700 underline" href="https://console.anthropic.com/" target="_blank" rel="noopener">console.anthropic.com</a>.</li>
                <li>Optionally set up a <a class="text-blue-700 underline" href="https://dash.cloudflare.com/" target="_blank" rel="noopener">Cloudflare AI Gateway</a> (adds caching and usage visibility).</li>
                <li>Paste both into Setup, then return here to run attribution.</li>
              </ol>
              <div class="flex flex-wrap gap-2 pt-1">
                <button data-action="gotoSetup" class="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm">Add your key in Setup</button>
                <a href="https://github.com/skyphusion-labs/common-thread/blob/main/docs/PUBLIC-USAGE.md" target="_blank" rel="noopener" class="px-4 py-2 border rounded-xl text-sm hover:bg-white">Read the usage guide</a>
              </div>
            </div>
          </div>
        </div>
        <div id="attribute-controls" class="bg-white rounded-2xl border p-5 space-y-4 max-w-2xl">
          <label class="flex items-center gap-2 text-sm">
            <input id="skip-triage" type="checkbox" class="rounded">
            Skip triage (run reasoning on all pairs)
          </label>
          <label class="block text-xs text-slate-500">Account filter (comma-separated, optional)</label>
          <input id="account-filter" class="w-full border rounded-xl px-3 py-2 text-sm font-mono" placeholder="alice,bob">
          <div id="credential-hint" class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 hidden"></div>
          <button data-action="runAttribution" id="attribute-btn" class="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed">Run attribution</button>
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
          <button data-action="loadRuns" class="px-3 py-1.5 border rounded-xl text-sm hover:bg-white">Refresh</button>
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

<script src="/app.js" defer></script>
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

const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'content-security-policy': CSP,
};

function renderHtml(env) {
  const publicUrl = (env.PUBLIC_URL || '').replace(/\/$/, '');
  const siteHeader = publicUrl
    ? '<a href="' + publicUrl + '" class="text-xs text-slate-500 hidden sm:inline hover:underline">' + publicUrl + '</a>'
    : '';
  return HTML.replace('__SITE_HEADER__', siteHeader);
}

// The public-mode flag is projected into the EXTERNAL app.js (not the HTML), so
// the served script is byte-stable per deploy and the strict CSP needs no inline.
function renderAppJs(env) {
  const byokOnly = String(env.PUBLIC_BYOK_ONLY || '').toLowerCase() === 'true';
  return APP_JS.replace('__PUBLIC_BYOK_ONLY__', byokOnly ? 'true' : 'false');
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
        headers: Object.assign({ 'content-type': 'text/html; charset=utf-8' }, SECURITY_HEADERS),
      });
    }

    if (request.method === 'GET' && url.pathname === '/app.css') {
      return new Response(CSS, {
        headers: Object.assign(
          { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'public, max-age=3600' },
          SECURITY_HEADERS),
      });
    }

    if (request.method === 'GET' && url.pathname === '/app.js') {
      return new Response(renderAppJs(env), {
        headers: Object.assign(
          { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'public, max-age=3600' },
          SECURITY_HEADERS),
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
