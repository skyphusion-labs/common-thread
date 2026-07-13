# PDF/A output and validation (§8.1.2)

Evidence packets export as **PDF/A-2b** by default via the self-hosted
`containers/pdf-worker/` pipeline (wkhtmltopdf → Ghostscript).

## Default profile

| Field | Value |
|-------|-------|
| `pdfaProfile` in `PdfRenderHandoff` | `2b` (only profile supported in v1) |
| Renderer | `containers/pdf-worker/render-pdfa.ts` |
| Worker route | `GET .../packet/:run_id?format=pdf` |

PDF/A-2b is the archival profile most court e-filing systems accept when they
require PDF/A at all. The methodology paper §8.1.2 discusses practitioner
responsibility to confirm local filing rules.

## Court-specific variants

v1 emits **2b only**. Practitioners who need a different PDF/A level (1a, 2u,
3) or jurisdiction-specific font embedding rules should:

1. Export `?format=markdown` or JSON and render through their own toolchain, or
2. Fork `render-pdfa.ts` Ghostscript flags for their profile and run a private
   pdf-worker image (AGPL-3.0).

The `pdfaProfile` field exists in the handoff schema for forward compatibility;
the container rejects unknown values.

## CI validation (veraPDF)

Release hardening runs a sample render through [veraPDF](https://verapdf.org/):

```bash
# Local (requires wkhtmltopdf, ghostscript, Docker)
npm run validate:pdfa
```

CI job `pdfa-validation` runs `npm run validate:pdfa` on every push/PR to
`main`. The script always verifies the render pipeline produces a valid PDF;
veraPDF full PDF/A-2b compliance is required when the toolchain supports it.

**Known baseline (v1):** wkhtmltopdf + Ghostscript may fail veraPDF clause
6.2.4.3 (DeviceRGB output intent). CI treats that specific single-rule failure
as a documented baseline gap while still failing on any other regression.

## Security hardening (#65)

The renderer disables JavaScript, external loads, local file access, and remote
images during wkhtmltopdf conversion. See `render-pdfa.ts` flags and
`implementation/reporting/packet-html.ts` sanitization.
