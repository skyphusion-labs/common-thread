# Web assets: regenerating the inlined CSS

The web frontend Worker (`web/worker.js`) is deliberately **self-contained**: no
external CDN or runtime dependency (house rule), so a strict Content-Security-
Policy can run with no `unsafe-inline`. Consequences:

- **CSS** is prebuilt Tailwind, minified and inlined into the `CSS` constant,
  served at `/app.css`.
- **Icons** are inline SVG (Feather geometry, MIT), not an icon font.
- **App JS** is served from the `APP_JS` constant at `/app.js` (the
  `PUBLIC_BYOK_ONLY` flag is projected in per request); the page carries no
  inline `<script>` or `onclick=` handlers (delegated `data-action` instead).

## Regenerating `CSS` after a class change

Tailwind scans `web/worker.js` for class names (both the HTML markup and the
class strings built in `APP_JS`), so adding a utility class anywhere in that file
means the CSS must be rebuilt:

```bash
# from repo root
mkdir -p /tmp/twbuild
printf '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n' > /tmp/twbuild/input.css
cat > /tmp/twbuild/tailwind.config.js <<'CFG'
module.exports = { content: ["web/worker.js"], corePlugins: { preflight: true } };
CFG
npx --yes tailwindcss@3 -c /tmp/twbuild/tailwind.config.js \
  -i /tmp/twbuild/input.css -o /tmp/twbuild/out.css --minify
```

Then append the custom (non-utility) styles -- `body` font, `.dropzone`,
`.nav-active`, `.band-*` -- and inline the result into the `CSS` constant.

**Escaping (important):** Tailwind selectors contain backslash escapes
(`.lg\:grid-cols-2`, `.max-h-\[28rem\]`). Because `CSS` is a JS template literal,
you MUST escape `\` -> `\\` (and any backtick / `${`) before embedding, or the
backslashes are consumed and the selectors break -- the same failure class as a
raw `\n` inside a template-literal string. Verify after embedding:

```bash
node --check web/worker.js
node --input-type=module -e 'import w from "./web/worker.js"; const css = await (await w.fetch(new Request("http://x/app.css"), {})).text(); console.log(css.includes(".lg\\:grid-cols-2"));'   # must print true
```

There is **no build step at deploy time**; the generated CSS is a committed
static artifact embedded in the Worker source.
