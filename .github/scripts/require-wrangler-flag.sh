#!/usr/bin/env bash
#
# Fail closed unless a wrangler var is set TRUTHY in the exact environment
# scope that the deploy resolves.
#
# Usage: require-wrangler-flag.sh <toml-path> <env-name> <KEY> <secret-name>
#
# WHY THIS IS A SCRIPT AND NOT A grep PIPELINE
#
# The gate this replaces was:
#
#   grep -E '^\s*KEY\s*=' f | grep -Eq '["'\'']?(1|true)["'\'']?'
#
# It failed OPEN in two independent ways.
#
# 1. The value match was UNANCHORED and every quote in it was optional, so the
#    pattern reduced to "the substring 1 or true appears anywhere on the line".
#    The repo's own documented comment style therefore satisfied it:
#
#      HOSTED_MAINTENANCE = "0"   # "1" or "true"
#
#    The gate matched the "1" in the trailing COMMENT and passed a config that
#    turns the flag OFF. web/wrangler.toml.example already writes
#    PUBLIC_BYOK_ONLY in exactly that style, so the most likely real config was
#    the one that defeated the gate.
#
# 2. The key match was scope-blind: '^\s*KEY\s*=' matches in ANY table. A flag
#    set only under [env.staging.vars], or only under top-level [vars], passed a
#    gate whose error message names [env.production.vars].
#
#    Measured with wrangler 4.149.0 (deploy --env production --dry-run):
#      - top-level [vars] with no [env.production.vars] -> "No bindings found."
#      - [env.production.vars] present but missing the key -> only the keys that
#        table declares are bound; there is NO per-key fallback to [vars].
#    So "set somewhere else in the file" means the production Worker runs with
#    the var UNSET, which is the exact fail-open state the gate exists to stop.
#
# SO: read the value out of [env.<env-name>.vars] only, strip the comment before
# looking at the value, and compare the whole value. No fallback to top-level
# [vars]: wrangler itself warns that the fallback does not happen, so a config
# that relies on it is misconfigured and must not pass.
#
# Truthiness mirrors isTruthyFlag() in web/worker.js exactly (trim, lowercase,
# then equal to "true" or "1"). If that function changes, change this together
# with it, or the gate starts accepting a value the runtime rejects.
#
# The resolved value is NEVER printed. These TOML files arrive from GitHub
# Actions secrets and this repo is public, so the verdict goes to the log and
# the value does not.
#
# Unsupported on purpose, and every one of them fails CLOSED: the inline-table
# form (vars = { KEY = "1" }), and an escaped quote inside the value.

set -euo pipefail

if [ "$#" -ne 4 ]; then
  echo "usage: $0 <toml-path> <env-name> <KEY> <secret-name>" >&2
  exit 2
fi

toml_path=$1
env_name=$2
key=$3
secret_name=$4
scope="env.${env_name}.vars"

if [ ! -f "$toml_path" ]; then
  echo "::error::${toml_path} does not exist; cannot check ${key}"
  exit 1
fi

verdict=$(awk -v target="$scope" -v want="$key" '
  function trim(s) { sub(/^[ \t\r]+/, "", s); sub(/[ \t\r]+$/, "", s); return s }

  # Drop a trailing comment, but only a "#" that is OUTSIDE a quoted string.
  function strip_comment(s,    i, n, c, q, out) {
    n = length(s); q = ""; out = ""
    for (i = 1; i <= n; i++) {
      c = substr(s, i, 1)
      if (q == "") {
        if (c == "#") break
        if (c == "\"" || c == "'\''") q = c
      } else if (c == q) {
        q = ""
      }
      out = out c
    }
    return out
  }

  function unquote(s,    f, l) {
    if (length(s) >= 2) {
      f = substr(s, 1, 1); l = substr(s, length(s), 1)
      if ((f == "\"" && l == "\"") || (f == "'\''" && l == "'\''"))
        return substr(s, 2, length(s) - 2)
    }
    return s
  }

  {
    line = trim(strip_comment($0))
    if (line == "") next

    # Table header: [name] or [[name]]. Tracks scope for the lines that follow.
    if (substr(line, 1, 1) == "[") {
      if (substr(line, 1, 2) == "[[" && substr(line, length(line) - 1) == "]]")
        table = trim(substr(line, 3, length(line) - 4))
      else if (substr(line, length(line)) == "]")
        table = trim(substr(line, 2, length(line) - 2))
      next
    }

    if (table != target) next

    eq = index(line, "=")
    if (eq == 0) next
    k = unquote(trim(substr(line, 1, eq - 1)))
    if (k != want) next

    seen++
    value = tolower(unquote(trim(substr(line, eq + 1))))
  }

  END {
    if (seen > 1) { print "DUPLICATE"; exit }
    if (seen == 0) { print "MISSING"; exit }
    if (value == "1" || value == "true") { print "TRUTHY"; exit }
    print "FALSY"
  }
' "$toml_path")

case "$verdict" in
  TRUTHY)
    echo "${key} is set truthy under [${scope}]"
    ;;
  MISSING)
    echo "::error::${secret_name} must set ${key}=1 (or true) under [${scope}]. It is not set in that table. wrangler does not inherit top-level [vars] into a named environment, so setting it anywhere else leaves it UNSET on this deploy."
    exit 1
    ;;
  FALSY)
    echo "::error::${secret_name} sets ${key} under [${scope}] to a value that is not 1 or true. A trailing comment does not count as the value."
    exit 1
    ;;
  DUPLICATE)
    echo "::error::${secret_name} sets ${key} more than once under [${scope}]. Remove the stale line; the gate will not guess which one wins."
    exit 1
    ;;
  *)
    echo "::error::${key} check could not resolve a verdict for [${scope}] in ${toml_path}"
    exit 1
    ;;
esac
