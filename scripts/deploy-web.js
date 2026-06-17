#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
const envArg = args.find(a => a.startsWith('--env=')) || '--env=dev';
const rawEnv = envArg.split('=')[1] || 'dev';

// Normalize for Wrangler
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

const BACKEND_NAME = process.env.BACKEND_WORKER_NAME || process.env.BACKEND || getBackendNameFromToml();

if (!BACKEND_NAME) {
  console.error('❌ Could not determine backend worker name.');
  console.error('   Set BACKEND_WORKER_NAME=your-backend-name or ensure wrangler.toml has a top-level "name".');
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

// === Patch top-level services binding ===
config = config.replace(
  /services\s*=\s*\[[^\]]*\]/,
  `services = [ { binding = "BACKEND", service = "${BACKEND_NAME}" } ]`
);

// === Production-specific patching (place services directly under [env.production]) ===
if (rawEnv === 'prod' || rawEnv === 'production') {
  if (config.includes('[env.production]')) {
    // Replace existing services line inside the production block, or insert one
    config = config.replace(
      /(\[env\.production\][^\[]*?)(services\s*=\s*\[[^\]]*\])?/s,
      (match, headerPart, existingServices) => {
        const servicesLine = `services = [ { binding = "BACKEND", service = "${BACKEND_NAME}" } ]`;
        if (existingServices) {
          return headerPart.replace(/services\s*=\s*\[[^\]]*\]/, servicesLine);
        } else {
          // Insert after the [env.production] header
          return headerPart.trimEnd() + '\n' + servicesLine + '\n';
        }
      }
    );
  } else {
    // No [env.production] section yet — append one
    config += `\n\n[env.production]\nservices = [ { binding = "BACKEND", service = "${BACKEND_NAME}" } ]\n`;
  }
}

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

function getBackendNameFromToml() {
  try {
    const toml = fs.readFileSync(path.join(__dirname, '..', 'wrangler.toml'), 'utf8');
    const match = toml.match(/^\s*name\s*=\s*"([^"]+)"/m);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
