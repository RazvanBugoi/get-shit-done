#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

// Colors
const cyan = '\x1b[36m';
const green = '\x1b[32m';
const yellow = '\x1b[33m';
const dim = '\x1b[2m';
const reset = '\x1b[0m';

// Get version from package.json
const pkg = require('../package.json');

const banner = `
${cyan}   ██████╗ ███████╗██████╗
  ██╔════╝ ██╔════╝██╔══██╗
  ██║  ███╗███████╗██║  ██║
  ██║   ██║╚════██║██║  ██║
  ╚██████╔╝███████║██████╔╝
   ╚═════╝ ╚══════╝╚═════╝${reset}

  Get Shit Done ${dim}v${pkg.version}${reset}
  A meta-prompting, context engineering and spec-driven
  development system for Codex CLI by TÂCHES.
`;

// Parse args
const args = process.argv.slice(2);
const hasGlobal = args.includes('--global') || args.includes('-g');
const hasLocal = args.includes('--local') || args.includes('-l');

console.log(banner);

/**
 * Recursively copy directory, replacing paths in .md files
 */
function copyWithPathReplacement(srcDir, destDir, pathPrefix) {
  fs.mkdirSync(destDir, { recursive: true });

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyWithPathReplacement(srcPath, destPath, pathPrefix);
    } else if (entry.name.endsWith('.md')) {
      // Replace ~/.codex/ with the appropriate prefix in markdown files
      let content = fs.readFileSync(srcPath, 'utf8');
      content = content.replace(/~\/\.codex\//g, pathPrefix);
      fs.writeFileSync(destPath, content);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Install to the specified directory
 */
function install(isGlobal) {
  const src = path.join(__dirname, '..');
  const codexDir = isGlobal
    ? path.join(os.homedir(), '.codex')
    : path.join(process.cwd(), '.codex');

  const locationLabel = isGlobal
    ? codexDir.replace(os.homedir(), '~')
    : codexDir.replace(process.cwd(), '.');

  // Path prefix for file references
  const pathPrefix = isGlobal ? '~/.codex/' : './.codex/';

  console.log(`  Installing to ${cyan}${locationLabel}${reset}\n`);

  // Create prompts directory
  const promptsDir = path.join(codexDir, 'prompts');
  fs.mkdirSync(promptsDir, { recursive: true });

  // Copy codex prompts with path replacement
  const promptsSrc = path.join(src, 'codex-prompts');
  copyWithPathReplacement(promptsSrc, promptsDir, pathPrefix);
  console.log(`  ${green}✓${reset} Installed codex prompts`);

  // Copy get-shit-done resources with path replacement
  const resourcesSrc = path.join(src, 'get-shit-done');
  const resourcesDest = path.join(codexDir, 'get-shit-done');
  copyWithPathReplacement(resourcesSrc, resourcesDest, pathPrefix);
  console.log(`  ${green}✓${reset} Installed get-shit-done resources`);

  console.log(`
  ${green}Done!${reset} Run ${cyan}/prompts:gsd-help${reset} to get started.
  ${dim}Local installs require CODEX_HOME=./.codex to be set when running codex.${reset}
`);
}

/**
 * Prompt for install location
 */
function promptLocation() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log(`  ${yellow}Where would you like to install?${reset}

  ${cyan}1${reset}) Global ${dim}(~/.codex)${reset} - available in all projects
  ${cyan}2${reset}) Local  ${dim}(./.codex)${reset} - this project only
`);

  rl.question(`  Choice ${dim}[1]${reset}: `, (answer) => {
    rl.close();
    const choice = answer.trim() || '1';
    const isGlobal = choice !== '2';
    install(isGlobal);
  });
}

// Main
if (hasGlobal && hasLocal) {
  console.error(`  ${yellow}Cannot specify both --global and --local${reset}`);
  process.exit(1);
} else if (hasGlobal) {
  install(true);
} else if (hasLocal) {
  install(false);
} else {
  promptLocation();
}
