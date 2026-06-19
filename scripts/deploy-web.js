#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
const envArg = args.find(a => a.startsWith('--env=')) || '--env=dev';
const rawEnv = envArg.split('=')[1] || 'dev';

// Normalize environment — explicit --env flag takes priority
const isProd = rawEnv === 'prod' || rawEnv === 'production';
const wranglerEnvFlag = isProd ? '--env production' : '';
const tempEnv = isProd ? 'prod' : 'dev';

// Determine backend worker name
let BACKEND_NAME = process.env.BACKEND_WORKER_NAME || process.env.BACKEND;

if (!BACKEND_NAME) {
  BACKEND_NAME = getBackendName(rawEnv, isProd);
}

if (!BACKEND_NAME) {
  console.error('❌ Could not determine backend worker name.');
  console.error('   Set BACKEND_WORKER_NAME=... or fix your wrangler.toml');
  process.exit(1);
}

console.log(`🚀 Deploying web frontend (${rawEnv})`);
console.log(`   Backend worker to bind: ${BACKEND_NAME}`);
if (isProd) {
  console.log('   Public URL: https://common-thread.skyphusion.org');
}

const envLabel = isProd ? 'prod' : 'dev';
console.log(`   → Using ${envLabel} backend: ${BACKEND_NAME}`);

const webDir = path.join(__dirname, '..', 'web');
const configPath = path.join(webDir, 'wrangler.toml');

if (!fs.existsSync(configPath)) {
  console.error(`❌ web/wrangler.toml not found at ${configPath}`);
  process.exit(1);
}

// === Strict validation ===
validateConfiguration(isProd);
if (isProd) {
  validateWebProductionConfig(configPath);
}

let config = fs.readFileSync(configPath, 'utf8');

// Patch all service bindings
config = config.replace(
  /service\s*=\s*"[^"]*"/g,
  `service = "${BACKEND_NAME}"`
);

const tempConfig = path.join(webDir, `wrangler.${tempEnv}.generated.toml`);
fs.writeFileSync(tempConfig, config);

try {
  const cmd = `npx wrangler deploy --config "${tempConfig}" ${wranglerEnvFlag}`.trim();
  console.log(`   Running: ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: webDir });
  console.log('✅ Web frontend deployed successfully.');
} finally {
  if (fs.existsSync(tempConfig)) fs.unlinkSync(tempConfig);
}

// ============================================
// Helper functions
// ============================================

function getBackendName(rawEnv, isProd) {
  try {
    const toml = fs.readFileSync(path.join(__dirname, '..', 'wrangler.toml'), 'utf8');

    // Explicit --env flag wins for deciding dev vs prod
    if (isProd) {
      return getProdNameFromToml(toml);
    }

    // Development
    const match = toml.match(/^\s*name\s*=\s*"([^"]+)"/m);
    return match ? match[1] : 'common-thread';
  } catch {
    return isProd ? 'common-thread-prod' : 'common-thread';
  }
}

function getProdNameFromToml(toml) {
  const prodMatch = toml.match(/\[env\.production\][\s\S]*?name\s*=\s*"([^"]+)"/);
  if (prodMatch) return prodMatch[1];

  const shortProd = toml.match(/\[env\.prod\][\s\S]*?name\s*=\s*"([^"]+)"/);
  if (shortProd) return shortProd[1];

  const topMatch = toml.match(/^\s*name\s*=\s*"([^"]+)"/m);
  if (topMatch) {
    const base = topMatch[1].replace(/-dev$/, '');
    return base.includes('-prod') ? base : `${base}-prod`;
  }

  return null;
}

function validateConfiguration(isProd) {
  try {
    const toml = fs.readFileSync(path.join(__dirname, '..', 'wrangler.toml'), 'utf8');

    const hasTopLevelName = /^\s*name\s*=\s*"[^"]+"/m.test(toml);
    if (!hasTopLevelName) {
      console.error('❌ wrangler.toml is missing a top-level "name"');
      process.exit(1);
    }

    if (isProd) {
      const hasProdSection = /\[env\.production\]/.test(toml) || /\[env\.prod\]/.test(toml);
      const hasProdName = /\[env\.production\][\s\S]*?name\s*=\s*"[^"]+"/.test(toml) ||
                          /\[env\.prod\][\s\S]*?name\s*=\s*"[^"]+"/.test(toml);

      if (!hasProdSection) {
        console.error('❌ Production deployment requires an [env.production] (or [env.prod]) section in wrangler.toml');
        process.exit(1);
      }

      if (!hasProdName) {
        console.error('❌ Production deployment requires a "name" under [env.production] (or [env.prod])');
        process.exit(1);
      }
    }
  } catch (e) {
    console.error('❌ Failed to read or validate root wrangler.toml');
    process.exit(1);
  }
}

function validateWebProductionConfig(webConfigPath) {
  const toml = fs.readFileSync(webConfigPath, 'utf8');
  const prodSection = extractEnvSection(toml, 'production') || extractEnvSection(toml, 'prod');
  if (!prodSection) {
    console.error('❌ Production web deploy requires [env.production] in web/wrangler.toml');
    process.exit(1);
  }
  if (!/pattern\s*=\s*"common-thread\.skyphusion\.org"/.test(toml)) {
    console.error('❌ Production web worker must route common-thread.skyphusion.org');
    process.exit(1);
  }
  if (/^\s*workers_dev\s*=\s*false\s*$/m.test(prodSection)) {
    console.log('   workers.dev: disabled (workers_dev = false)');
  }
}

function extractEnvSection(toml, envName) {
  const re = new RegExp(`\\[env\\.${envName}\\]([\\s\\S]*?)(?=\\n\\[|$)`);
  const match = toml.match(re);
  return match ? match[1] : null;
}
