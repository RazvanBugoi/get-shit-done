#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');

const DEFAULT_CONCURRENCY = 4;
const CODEX_BIN = process.env.GSD_CODEX_BIN || 'codex';
const WEZTERM_BIN = process.env.GSD_WEZTERM_BIN || 'wezterm';
const DEFAULT_UI = 'inline';
const SUPPORTED_UI = new Set(['inline', 'wezterm']);
const DEFAULT_ALLOW_NETWORK =
  String(process.env.GSD_ALLOW_NETWORK || '').toLowerCase() === 'true';

const GROUPS = [
  {
    id: 'stack-integrations',
    label: 'Stack + Integrations',
    outputs: [
      {
        name: 'STACK.md',
        template: 'stack.md',
        focus:
          'Languages, runtime, package manager, frameworks, key dependencies, configuration files'
      },
      {
        name: 'INTEGRATIONS.md',
        template: 'integrations.md',
        focus:
          'External services, APIs, databases, auth providers, third-party integrations'
      }
    ]
  },
  {
    id: 'architecture-structure',
    label: 'Architecture + Structure',
    outputs: [
      {
        name: 'ARCHITECTURE.md',
        template: 'architecture.md',
        focus:
          'Architecture pattern, layers, data flow, abstractions, entry points'
      },
      {
        name: 'STRUCTURE.md',
        template: 'structure.md',
        focus:
          'Directory layout, module boundaries, key locations, naming conventions for directories'
      }
    ]
  },
  {
    id: 'conventions-testing',
    label: 'Conventions + Testing',
    outputs: [
      {
        name: 'CONVENTIONS.md',
        template: 'conventions.md',
        focus:
          'Code style, naming conventions, documentation patterns, formatting tools'
      },
      {
        name: 'TESTING.md',
        template: 'testing.md',
        focus:
          'Test frameworks, test layout, coverage approach, test tooling'
      }
    ]
  },
  {
    id: 'concerns',
    label: 'Concerns',
    outputs: [
      {
        name: 'CONCERNS.md',
        template: 'concerns.md',
        focus:
          'Technical debt, risky areas, fragility, TODOs, missing tests, performance bottlenecks'
      }
    ]
  }
];

function usage() {
  return `
Usage:
  get-shit-done-codex map-codebase [options] [-- <codex exec args>]

Options:
  --refresh            Delete existing .planning/codebase before running
  --update <groups>    Update specific groups (comma-separated ids or numbers)
  --skip-existing      Exit if .planning/codebase already exists
  --concurrency <n>    Max parallel codex exec runs (default: ${DEFAULT_CONCURRENCY})
  --ui <mode>          UI mode: inline (default) or wezterm
  --log-dir <path>     Directory for per-agent logs (default: .planning/codebase/logs)
  --allow-network      Allow network access (sets --sandbox danger-full-access)
  --search             Alias for --allow-network
  --web                Alias for --allow-network
  --help               Show this help

Groups:
  1, stack-integrations
  2, architecture-structure
  3, conventions-testing
  4, concerns

Examples:
  get-shit-done-codex map-codebase
  get-shit-done-codex map-codebase --refresh
  get-shit-done-codex map-codebase --update 1,4
  get-shit-done-codex map-codebase --ui wezterm
  get-shit-done-codex map-codebase --allow-network
  get-shit-done-codex map-codebase -- --model gpt-5.1-codex-max --full-auto
`.trim();
}

function parseArgs(argv) {
  const args = [...argv];
  const ddIndex = args.indexOf('--');
  const codexArgs = ddIndex === -1 ? [] : args.slice(ddIndex + 1);
  const mainArgs = ddIndex === -1 ? args : args.slice(0, ddIndex);

  const opts = {
    command: null,
    refresh: false,
    update: null,
    skipExisting: false,
    concurrency: DEFAULT_CONCURRENCY,
    ui: DEFAULT_UI,
    logDir: null,
    allowNetwork: DEFAULT_ALLOW_NETWORK,
    codexArgs
  };

  while (mainArgs.length > 0) {
    const token = mainArgs.shift();
    if (!opts.command && !token.startsWith('-')) {
      opts.command = token;
      continue;
    }
    switch (token) {
      case '--refresh':
        opts.refresh = true;
        break;
      case '--update':
        opts.update = mainArgs.shift() || '';
        break;
      case '--skip-existing':
        opts.skipExisting = true;
        break;
      case '--concurrency':
        opts.concurrency = Number(mainArgs.shift());
        break;
      case '--ui':
        opts.ui = normalizeToken(mainArgs.shift() || '');
        break;
      case '--log-dir':
        opts.logDir = mainArgs.shift() || '';
        break;
      case '--allow-network':
      case '--search':
      case '--web':
        opts.allowNetwork = true;
        break;
      case '--help':
        opts.command = 'help';
        break;
      default:
        throw new Error(`Unknown option: ${token}`);
    }
  }

  if (!Number.isFinite(opts.concurrency) || opts.concurrency < 1) {
    throw new Error('Concurrency must be a positive integer.');
  }
  if (!SUPPORTED_UI.has(opts.ui)) {
    throw new Error(`Unknown ui mode: ${opts.ui}`);
  }

  return opts;
}

function normalizeToken(token) {
  return token.trim().toLowerCase();
}

function resolveGroups(tokens) {
  if (!tokens || tokens.length === 0) {
    return GROUPS;
  }

  const indexMap = new Map([
    ['1', 'stack-integrations'],
    ['2', 'architecture-structure'],
    ['3', 'conventions-testing'],
    ['4', 'concerns']
  ]);

  const aliasMap = new Map([
    ['stack', 'stack-integrations'],
    ['integrations', 'stack-integrations'],
    ['stack-integrations', 'stack-integrations'],
    ['stack+integrations', 'stack-integrations'],
    ['architecture', 'architecture-structure'],
    ['arch', 'architecture-structure'],
    ['structure', 'architecture-structure'],
    ['architecture-structure', 'architecture-structure'],
    ['conventions', 'conventions-testing'],
    ['testing', 'conventions-testing'],
    ['quality', 'conventions-testing'],
    ['conventions-testing', 'conventions-testing'],
    ['concerns', 'concerns']
  ]);

  const selected = new Set();
  for (const raw of tokens) {
    const token = normalizeToken(raw);
    if (!token) continue;
    if (token === 'all') {
      return GROUPS;
    }
    const id = indexMap.get(token) || aliasMap.get(token);
    if (!id) {
      throw new Error(`Unknown group: ${raw}`);
    }
    selected.add(id);
  }

  const groupList = GROUPS.filter((group) => selected.has(group.id));
  if (groupList.length === 0) {
    return GROUPS;
  }
  return groupList;
}

function promptUser(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function removeDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

function getTemplatePath(templateFile) {
  return path.resolve(__dirname, '..', 'get-shit-done', 'templates', 'codebase', templateFile);
}

function validateTemplates(groups) {
  for (const group of groups) {
    for (const output of group.outputs) {
      const templatePath = getTemplatePath(output.template);
      if (!fs.existsSync(templatePath)) {
        throw new Error(`Template not found: ${templatePath}`);
      }
    }
  }
}

function buildPrompt(group, planningDir, allowNetwork) {
  const outputLines = group.outputs
    .map((output) => {
      const templatePath = getTemplatePath(output.template);
      const outputPath = path.join(planningDir, output.name);
      return `- ${output.name}\n  Template: ${templatePath}\n  Output: ${outputPath}\n  Focus: ${output.focus}`;
    })
    .join('\n');

  const outputPaths = group.outputs
    .map((output) => path.join(planningDir, output.name))
    .map((item) => `- ${item}`)
    .join('\n');

  return `
You are mapping this codebase.

Rules:
- Always include file paths in backticks like \`src/services/user.ts\`.
- Use the templates listed below and preserve their structure.
- If something is not detected, write "Not detected".
- Only edit the output files listed below.
- ${allowNetwork ? 'Web search is allowed when needed.' : 'Do not run network commands.'}
- Prefer rg for searching when possible.

Templates and outputs:
${outputLines}

Steps:
1. Read each template file.
2. Analyze the codebase for the listed focus areas.
3. Write the completed templates to the output paths.

Output files:
${outputPaths}
`.trim();
}

function formatArgsForLog(args) {
  return args.map((arg) => (arg.includes(' ') ? JSON.stringify(arg) : arg)).join(' ');
}

function pipeWithPrefixAndLog(stream, prefix, logStream, showOutput, sourceLabel) {
  const rl = readline.createInterface({ input: stream });
  rl.on('line', (line) => {
    if (logStream) {
      const logPrefix = sourceLabel ? `[${sourceLabel}] ` : '';
      logStream.write(`${logPrefix}${line}\n`);
    }
    if (showOutput) {
      process.stdout.write(`${prefix}${line}\n`);
    }
  });
}

function resolveLogDir(planningDir, logDir) {
  if (!logDir) {
    return path.join(planningDir, 'logs');
  }
  return path.resolve(process.cwd(), logDir);
}

function getLogPath(logDir, group) {
  return path.join(logDir, `${group.id}.log`);
}

function initStatus(groups) {
  const status = new Map();
  for (const group of groups) {
    status.set(group.id, {
      id: group.id,
      label: group.label,
      state: 'queued',
      startedAt: null,
      endedAt: null
    });
  }
  return status;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '-';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function renderStatus(statusMap, context = {}) {
  const now = Date.now();
  const lines = [];
  lines.push('GSD map-codebase (WezTerm UI)');
  lines.push('');
  lines.push('Status:');
  for (const item of statusMap.values()) {
    const elapsed = item.startedAt ? formatDuration((item.endedAt || now) - item.startedAt) : '-';
    lines.push(`- ${item.label} (${item.id}): ${item.state} | ${elapsed}`);
  }
  lines.push('');
  if (context.logs) {
    lines.push(`Logs: ${context.logs}`);
  }
  if (context.command) {
    lines.push(`Command: ${context.command}`);
  }
  if (context.concurrency) {
    lines.push(`Concurrency: ${context.concurrency}`);
  }
  process.stdout.write('\x1b[2J\x1b[H');
  process.stdout.write(lines.join('\n') + '\n');
}

function spawnWeztermTabs(groups, logDir) {
  for (const group of groups) {
    const logPath = getLogPath(logDir, group);
    const args = [
      'cli',
      'spawn',
      '--new-tab',
      '--cwd',
      process.cwd(),
      '--',
      'tail',
      '-f',
      logPath
    ];
    const child = spawn(WEZTERM_BIN, args, { stdio: 'ignore' });
    child.on('error', (err) => {
      console.warn(`WezTerm spawn failed (${group.id}): ${err.message}`);
    });
    child.on('exit', (code) => {
      if (code && code !== 0) {
        console.warn(`WezTerm spawn exited (${group.id}) with code ${code}`);
      }
    });
  }
}

function buildCodexArgs(userArgs, allowNetwork) {
  const args = ['exec'];
  const hasFullAuto = userArgs.some(
    (arg) => arg === '--full-auto' || arg.startsWith('--full-auto=')
  );
  const hasSandbox = userArgs.some(
    (arg) => arg === '--sandbox' || arg.startsWith('--sandbox=')
  );
  const hasBypass = userArgs.includes('--dangerously-bypass-approvals-and-sandbox');
  if (!hasFullAuto) {
    args.push('--full-auto');
  }
  if (!hasSandbox && !hasBypass) {
    args.push('--sandbox', allowNetwork ? 'danger-full-access' : 'workspace-write');
  }
  return args.concat(userArgs);
}

async function runCodexJob(group, planningDir, userCodexArgs, options) {
  const prompt = buildPrompt(group, planningDir, options.allowNetwork);
  const codexArgs = buildCodexArgs(userCodexArgs, options.allowNetwork).concat(prompt);
  const label = `[${group.id}] `;
  const logPath = getLogPath(options.logDir, group);
  const logStream = fs.createWriteStream(logPath, { flags: 'w' });

  logStream.write(`# ${group.label} (${group.id})\n`);
  logStream.write(`# Started: ${new Date().toISOString()}\n\n`);

  const setStatus = (state) => {
    if (!options.statusMap) return;
    const entry = options.statusMap.get(group.id);
    if (!entry) return;
    entry.state = state;
    if (state === 'running') {
      entry.startedAt = Date.now();
    }
    if (state === 'done' || state === 'failed') {
      entry.endedAt = Date.now();
    }
    if (options.renderStatus) {
      options.renderStatus(options.statusMap);
    }
  };

  return new Promise((resolve, reject) => {
    setStatus('running');
    const child = spawn(CODEX_BIN, codexArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: process.cwd()
    });

    pipeWithPrefixAndLog(child.stdout, label, logStream, options.showOutput, 'stdout');
    pipeWithPrefixAndLog(child.stderr, label, logStream, options.showOutput, 'stderr');

    child.on('error', (err) => {
      logStream.write(`\n# Error: ${err.message}\n`);
      logStream.end();
      setStatus('failed');
      reject(err);
    });
    child.on('exit', (code) => {
      logStream.write(`\n# Exit code: ${code}\n`);
      logStream.write(`# Finished: ${new Date().toISOString()}\n`);
      logStream.end();
      if (code === 0) {
        setStatus('done');
        resolve();
      } else {
        setStatus('failed');
        reject(new Error(`${group.id} failed with exit code ${code}`));
      }
    });
  });
}

async function runJobsInParallel(jobs, planningDir, userCodexArgs, concurrency, options) {
  let index = 0;
  let active = 0;
  let failed = false;

  return new Promise((resolve, reject) => {
    const next = () => {
      if (failed) return;
      if (index >= jobs.length && active === 0) {
        resolve();
        return;
      }
      while (active < concurrency && index < jobs.length) {
        const job = jobs[index++];
        active += 1;
        runCodexJob(job, planningDir, userCodexArgs, options)
          .then(() => {
            active -= 1;
            next();
          })
          .catch((err) => {
            failed = true;
            reject(err);
          });
      }
    };
    next();
  });
}

async function mapCodebase(opts) {
  const planningDir = path.resolve(process.cwd(), '.planning', 'codebase');
  const exists = fs.existsSync(planningDir);

  if (exists && opts.skipExisting) {
    console.log('.planning/codebase already exists. Skipping.');
    return;
  }

  let selectedGroups = GROUPS;

  if (exists && !opts.refresh && !opts.update) {
    console.log('.planning/codebase already exists.');
    console.log('1) Refresh - delete and remap');
    console.log('2) Update - select groups to update');
    console.log('3) Skip');
    const answer = await promptUser('Choice [1/2/3]: ');
    if (answer === '3') {
      console.log('Skipping.');
      return;
    }
    if (answer === '2') {
      const groupAnswer = await promptUser(
        'Groups to update (e.g. 1,3 or stack,concerns): '
      );
      selectedGroups = resolveGroups(groupAnswer.split(','));
    } else {
      opts.refresh = true;
    }
  }

  if (exists && opts.refresh) {
    removeDir(planningDir);
  }

  ensureDir(planningDir);

  if (opts.update) {
    selectedGroups = resolveGroups(opts.update.split(','));
  }

  validateTemplates(selectedGroups);

  const logDir = resolveLogDir(planningDir, opts.logDir);
  ensureDir(logDir);

  const statusMap = initStatus(selectedGroups);
  const showOutput = opts.ui !== 'wezterm';
  const commandPreview = `${CODEX_BIN} ${formatArgsForLog(
    buildCodexArgs(opts.codexArgs, opts.allowNetwork)
  )} "<prompt>"`;
  const render =
    opts.ui === 'wezterm'
      ? (map) =>
          renderStatus(map, {
            logs: logDir,
            command: commandPreview,
            concurrency: opts.concurrency
          })
      : null;

  if (render) {
    render(statusMap);
  }

  if (opts.ui === 'wezterm') {
    for (const group of selectedGroups) {
      const logPath = getLogPath(logDir, group);
      if (!fs.existsSync(logPath)) {
        fs.writeFileSync(logPath, '');
      }
    }
    spawnWeztermTabs(selectedGroups, logDir);
  }

  if (opts.ui !== 'wezterm') {
    console.log(
      `Running ${selectedGroups.length} codex exec job(s) with concurrency ${opts.concurrency}.`
    );
    console.log(`Command: ${commandPreview}`);
  }

  await runJobsInParallel(selectedGroups, planningDir, opts.codexArgs, opts.concurrency, {
    logDir,
    showOutput,
    statusMap,
    renderStatus: render,
    allowNetwork: opts.allowNetwork
  });
  console.log('Codebase mapping complete.');
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    console.error('\n' + usage());
    process.exit(1);
  }

  if (!opts.command || opts.command === 'help') {
    console.log(usage());
    return;
  }

  if (opts.command !== 'map-codebase') {
    console.error(`Unknown command: ${opts.command}`);
    console.error('\n' + usage());
    process.exit(1);
  }

  try {
    await mapCodebase(opts);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

main();
