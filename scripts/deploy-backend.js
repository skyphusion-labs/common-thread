#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
const envArg = args.find(a => a.startsWith('--env=')) || '--env=dev';
const rawEnv = envArg.split('=')[1] || 'dev';
const isProd = rawEnv === 'prod' || rawEnv === 'production';
const wranglerEnvFlag = isProd ? '--env production' : '';

const configPath = path.join(__dirname, '..', 'wrangler.toml');
if (!fs.existsSync(configPath)) {
  console.error(`❌ wrangler.toml not found at ${configPath}`);
  process.exit(1);
}

const config = fs.readFileSync(configPath, 'utf8');

if (isProd) {
  validateProductionConfig(config);
  console.log('🚀 Deploying backend Worker (production)');
  console.log('   Public API: https://common-thread-backend.skyphusion.org');
} else {
  console.log('🚀 Deploying backend Worker (dev)');
}

const cmd = `npx wrangler deploy ${wranglerEnvFlag}`.trim();
console.log(`   Running: ${cmd}`);
execSync(cmd, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
console.log('✅ Backend Worker deployed successfully.');

function validateProductionConfig(toml) {
  if (!/\[env\.production\]/.test(toml) && !/\[env\.prod\]/.test(toml)) {
    console.error('❌ Production deployment requires [env.production] in wrangler.toml');
    process.exit(1);
  }

  const prodSection = extractSection(toml, 'production') || extractSection(toml, 'prod');
  if (!prodSection) {
    console.error('❌ Could not parse [env.production] in wrangler.toml');
    process.exit(1);
  }

  if (!/pattern\s*=\s*"common-thread-backend\.skyphusion\.org"/.test(toml)) {
    console.error('❌ Production backend must route common-thread-backend.skyphusion.org');
    process.exit(1);
  }

  if (/^\s*workers_dev\s*=\s*false\s*$/m.test(prodSection)) {
    console.log('   workers.dev: disabled (workers_dev = false)');
  }
}

function extractSection(toml, envName) {
  const re = new RegExp(`\\[env\\.${envName}\\]([\\s\\S]*?)(?=\\n\\[|$)`);
  const match = toml.match(re);
  return match ? match[1] : null;
}
