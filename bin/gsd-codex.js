#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');

const DEFAULT_CONCURRENCY = 4;
const CODEX_BIN = process.env.GSD_CODEX_BIN || 'codex';

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

function buildPrompt(group, planningDir) {
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
- Do not run network commands.
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

function pipeWithPrefix(stream, prefix) {
  const rl = readline.createInterface({ input: stream });
  rl.on('line', (line) => {
    process.stdout.write(`${prefix}${line}\n`);
  });
}

function buildCodexArgs(userArgs) {
  const args = ['exec'];
  const hasFullAuto = userArgs.some(
    (arg) => arg === '--full-auto' || arg.startsWith('--full-auto=')
  );
  const hasSandbox = userArgs.some(
    (arg) => arg === '--sandbox' || arg.startsWith('--sandbox=')
  );
  if (!hasFullAuto) {
    args.push('--full-auto');
  }
  if (!hasSandbox) {
    args.push('--sandbox', 'workspace-write');
  }
  return args.concat(userArgs);
}

async function runCodexJob(group, planningDir, userCodexArgs) {
  const prompt = buildPrompt(group, planningDir);
  const codexArgs = buildCodexArgs(userCodexArgs).concat(prompt);
  const label = `[${group.id}] `;

  return new Promise((resolve, reject) => {
    const child = spawn(CODEX_BIN, codexArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: process.cwd()
    });

    pipeWithPrefix(child.stdout, label);
    pipeWithPrefix(child.stderr, label);

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${group.id} failed with exit code ${code}`));
      }
    });
  });
}

async function runJobsInParallel(jobs, planningDir, userCodexArgs, concurrency) {
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
        runCodexJob(job, planningDir, userCodexArgs)
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

  console.log(`Running ${selectedGroups.length} codex exec job(s) with concurrency ${opts.concurrency}.`);
  console.log(
    `Command: ${CODEX_BIN} ${formatArgsForLog(buildCodexArgs(opts.codexArgs))} "<prompt>"`
  );

  await runJobsInParallel(selectedGroups, planningDir, opts.codexArgs, opts.concurrency);
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
