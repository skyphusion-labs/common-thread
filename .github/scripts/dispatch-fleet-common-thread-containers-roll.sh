#!/usr/bin/env bash
# Dispatch a common-thread-containers roll to fleet-chezmoi after a GHCR image push.
# Args: <service> <image-repo-without-registry>
#   service: ingest | pdf
#   image: skyphusion-labs/common-thread-ingest | skyphusion-labs/common-thread-pdf
set -euo pipefail

service="${1:?service required (ingest|pdf)}"
image_path="${2:?image path required (e.g. skyphusion-labs/common-thread-ingest)}"

case "$service" in
  ingest|pdf) ;;
  *) echo "::error::unknown service '$service' (want ingest|pdf)"; exit 2 ;;
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
