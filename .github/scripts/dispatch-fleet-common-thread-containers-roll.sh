#!/usr/bin/env bash
# Dispatch a common-thread-containers roll to fleet-chezmoi after a GHCR image push.
# Args: <service> <image-repo-without-registry>
#   service: ingest | pdf | attribution
#   image: skyphusion-labs/common-thread-ingest | skyphusion-labs/common-thread-pdf | skyphusion-labs/common-thread-attribution
#
# DISABLED 2026-09-25, FAILS CLOSED. The roll dispatch below cannot deploy anything today.
#
# (Hostnames are deliberately absent from this file: this is a public repo and the estate does
# not advertise fleet role or port structure in one. Roles are named instead.)
#
# WHAT IT NEEDED, both halves:
#   1. A container host running the `common-thread-containers` Swarm stack, which is the
#      ingest, pdf and attribution executors.
#   2. The handler workflow `.github/workflows/common-thread-containers-roll.yml` in
#      skyphusion-labs/fleet-chezmoi, listening `on: repository_dispatch` for
#      `types: [common-thread-containers-roll]`, pinning the image into the stack env file and
#      redeploying the stack.
#
# WHY IT IS OFF: the Swarm host that ran that stack was decommissioned 2026-09-24 with the
# rest of the leased fleet (cost). The handler workflow went out in the same teardown: it is
# 404 on fleet-chezmoi main (measured 2026-09-25), no workflow in that repo declares
# `on: repository_dispatch` any more, and the handler's own `runs-on: [self-hosted, fleet,
# <box>]` label matches no runner. GitHub answers POST /repos/{owner}/{repo}/dispatches with
# HTTP 204 whether or not a workflow is listening, and the code below treats 204 as success,
# so since the teardown this step has reported a GREEN roll on every run while deploying
# nothing at all. That false green is the defect this guard closes: a deploy step that cannot
# fail is not a control, it is decoration.
#
# The guard is the FIRST thing that runs, ahead of the argument checks, the GHCR token fetch
# and the digest lookup, so it can never be misread as a registry hiccup or a network flake.
#
# NOT AFFECTED: the image build and the GHCR push. Those jobs are untouched and still publish
# a real image. `dispatch-roll` is a leaf job in ingest-image.yml, pdf-image.yml and
# attribution-image.yml (no other job declares `needs: dispatch-roll`), so this guard cannot
# turn a build red. The common-thread Worker at common-thread.skyphusion.org is a separate
# deploy path (deploy.yml) and is live; only the container tier lost its host.
#
# RE-ENABLING is deleting the one guard block below, nothing else. Everything after it is the
# original recipe, unmodified and deliberately kept: common-thread is a live product whose
# container tier lost its host, so the recipe is NOT removed. Re-enabling needs a container
# host for the stack plus the fleet-chezmoi handler restored, which is a spend and topology
# decision, and that decision is Conrad's. Refs fleet-chezmoi #2042 and the teardown in
# fleet-chezmoi 4c36d29 (Refs #2066).
set -euo pipefail

# ---- FAIL-CLOSED GUARD: delete this block to re-enable (see the header). ----
echo "::error::common-thread containers roll dispatch is DISABLED (2026-09-25), failing closed for service '${1:-unspecified}'. The handler workflow skyphusion-labs/fleet-chezmoi .github/workflows/common-thread-containers-roll.yml no longer exists on main (removed in the 2026-09-24 teardown of the leased fleet) and no workflow in that repo listens for repository_dispatch any more, so POST /repos/skyphusion-labs/fleet-chezmoi/dispatches is accepted with HTTP 204 and NOTHING deploys; this script treated 204 as success and reported a green roll. The Swarm host that ran the common-thread-containers stack (the ingest, pdf and attribution executors), and that was the handler's own runner, was decommissioned 2026-09-24. The image build and the GHCR push are unaffected, as is the common-thread Worker at common-thread.skyphusion.org. Re-enabling needs a container host plus the restored fleet-chezmoi handler: that is Conrad's spend and topology call, so the recipe below is kept intact rather than deleted."
exit 1
# ---- end fail-closed guard ----

service="${1:?service required (ingest|pdf|attribution)}"
image_path="${2:?image path required (e.g. skyphusion-labs/common-thread-ingest)}"

case "$service" in
  ingest|pdf|attribution) ;;
  *) echo "::error::unknown service '$service' (want ingest|pdf|attribution)"; exit 2 ;;
esac

if [ -z "${FLEET_DISPATCH_TOKEN:+SET}" ]; then
  echo "::error::FLEET_DISPATCH_TOKEN is unset -- cannot dispatch fleet-chezmoi roll (org secret, visibility all)."
  exit 1
fi

short="$(printf '%s' "${GITHUB_SHA}" | cut -c1-7)"
tok="$(curl -fsS "https://ghcr.io/token?scope=repository:${image_path}:pull&service=ghcr.io" \
  | jq -r '.token')"
[ -n "$tok" ] && [ "$tok" != "null" ] || { echo "::error::GHCR token fetch failed for ${image_path}"; exit 1; }

digest="$(curl -fsSI \
  -H "Authorization: Bearer ${tok}" \
  -H "Accept: application/vnd.oci.image.index.v1+json" \
  "https://ghcr.io/v2/${image_path}/manifests/${short}" \
  | awk -F': ' 'tolower($1)=="docker-content-digest"{print $2}' | tr -d '\r')"
[ -n "$digest" ] || { echo "::error::digest lookup failed for ghcr.io/${image_path}:${short}"; exit 1; }

image="ghcr.io/${image_path}:${short}@${digest}"
payload="$(jq -nc --arg service "$service" --arg image "$image" --arg sha "$GITHUB_SHA" \
  '{event_type:"common-thread-containers-roll",client_payload:{service:$service,image:$image,sha:$sha}}')"

code="$(curl -sS -o /tmp/fleet_dispatch_resp.txt -w '%{http_code}' \
  -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer ${FLEET_DISPATCH_TOKEN}" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/skyphusion-labs/fleet-chezmoi/dispatches \
  -d "$payload")"
echo "repository_dispatch (common-thread-containers-roll ${service}) -> HTTP ${code}"
if [ "$code" != "204" ]; then
  echo "::error::fleet-chezmoi common-thread-containers-roll dispatch failed (HTTP ${code})."
  cat /tmp/fleet_dispatch_resp.txt || true
  exit 1
fi
echo "common-thread-containers-roll dispatch accepted (${image})."
