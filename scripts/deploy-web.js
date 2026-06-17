#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
const envArg = args.find(a => a.startsWith('--env=')) || '--env=dev';
const rawEnv = envArg.split('=')[1] || 'dev';

// Normalize environment
let wranglerEnvFlag = '';
let tempEnv = rawEnv;

if (rawEnv === 'prod' || rawEnv === 'production') {
  wranglerEnvFlag = '--env production';
  tempEnv = 'prod';
} else if (rawEnv === 'dev' || rawEnv === 'development') {
  wranglerEnvFlag = '';
  tempEnv = 'dev';
} else {
  wranglerEnvFlag = `--env ${rawEnv}`;
}

let BACKEND_NAME = process.env.BACKEND_WORKER_NAME || process.env.BACKEND;

if (!BACKEND_NAME) {
  BACKEND_NAME = getBackendNameFromToml(rawEnv);
}

if (!BACKEND_NAME) {
  console.error('❌ Could not determine backend worker name.');
  console.error('   Set BACKEND_WORKER_NAME=common-thread-prod (or common-thread) or ensure wrangler.toml has a name.');
  process.exit(1);
}

console.log(`🚀 Deploying web frontend (${rawEnv})`);
console.log(`   Backend worker to bind: ${BACKEND_NAME}`);

const webDir = path.join(__dirname, '..', 'web');
const configPath = path.join(webDir, 'wrangler.toml');

if (!fs.existsSync(configPath)) {
  console.error(`❌ web/wrangler.toml not found at ${configPath}`);
  process.exit(1);
}

let config = fs.readFileSync(configPath, 'utf8');

// Patch the service binding (works for both top-level and [env.production])
config = config.replace(
  /service\s*=\s*"[^"]*"/g,
  `service = "${BACKEND_NAME}"`
);

// Write temp config
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

function getBackendNameFromToml(env) {
  try {
    const toml = fs.readFileSync(path.join(__dirname, '..', 'wrangler.toml'), 'utf8');

    if (env === 'prod' || env === 'production') {
      // Look for [env.production] name first
      const prodMatch = toml.match(/\[env\.production\][\s\S]*?name\s*=\s*"([^"]+)"/);
      if (prodMatch) return prodMatch[1];

      // Fallback: try to derive from top-level name
      const topMatch = toml.match(/^\s*name\s*=\s*"([^"]+)"/m);
      if (topMatch) {
        const base = topMatch[1].replace(/-dev$/, '');
        return base.includes('-prod') ? base : `${base}-prod`;
      }
      return 'common-thread-prod';
    }

    // Development / default
    const topMatch = toml.match(/^\s*name\s*=\s*"([^"]+)"/m);
    return topMatch ? topMatch[1] : 'common-thread';
  } catch {
    return null;
  }
}
