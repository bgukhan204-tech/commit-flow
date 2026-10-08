#!/usr/bin/env node

/**
 * CommitFlow - Historical Backfill Engine
 * Generates custom backdated commits (e.g. 10 commits/day) with realistic timestamps and messages.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Parse CLI Arguments
const args = process.argv.slice(2);
const options = {
  days: null,
  startDate: null,
  endDate: null,
  count: 10,
  variation: 2,
  skipWeekends: false,
  push: false,
  authorName: null,
  authorEmail: null,
  token: process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null,
  remoteUrl: process.env.GIT_REMOTE_URL || null,
  targetFile: 'data/activity.log',
  branch: 'main',
  dryRun: false,
  messageStyle: 'realistic' // realistic, minimal, emoji
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--days' && args[i + 1]) options.days = parseInt(args[++i], 10);
  else if (arg === '--start' && args[i + 1]) options.startDate = args[++i];
  else if (arg === '--end' && args[i + 1]) options.endDate = args[++i];
  else if (arg === '--count' && args[i + 1]) options.count = parseInt(args[++i], 10);
  else if (arg === '--variation' && args[i + 1]) options.variation = parseInt(args[++i], 10);
  else if (arg === '--skip-weekends') options.skipWeekends = true;
  else if (arg === '--push') options.push = true;
  else if (arg === '--dry-run') options.dryRun = true;
  else if (arg === '--author-name' && args[i + 1]) options.authorName = args[++i];
  else if (arg === '--author-email' && args[i + 1]) options.authorEmail = args[++i];
  else if (arg === '--token' && args[i + 1]) options.token = args[++i];
  else if (arg === '--remote' && args[i + 1]) options.remoteUrl = args[++i];
  else if (arg === '--branch' && args[i + 1]) options.branch = args[++i];
  else if (arg === '--message-style' && args[i + 1]) options.messageStyle = args[++i];
}

// Helper to mask tokens
function maskToken(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/https:\/\/[^@:]+:[^@]+@github\.com/gi, 'https://***@github.com')
    .replace(/https:\/\/[^@]+@github\.com/gi, 'https://***@github.com')
    .replace(/ghp_[a-zA-Z0-9]{20,}/g, 'ghp_********************')
    .replace(/github_pat_[a-zA-Z0-9_]{20,}/g, 'github_pat_********************');
}

// Ensure Git repository is initialized
const repoRoot = path.resolve(__dirname, '..');
process.chdir(repoRoot);

function cleanupStuckGit(dir = repoRoot) {
  try {
    const gitDir = path.join(dir, '.git');
    if (!fs.existsSync(gitDir)) return;

    const lockFiles = [
      path.join(gitDir, 'index.lock'),
      path.join(gitDir, 'HEAD.lock'),
      path.join(gitDir, 'refs', 'heads', 'main.lock'),
      path.join(gitDir, 'refs', 'heads', 'master.lock')
    ];

    for (const lf of lockFiles) {
      if (fs.existsSync(lf)) {
        try { fs.unlinkSync(lf); } catch {}
      }
    }

    try { execSync('git rebase --abort', { cwd: dir, stdio: 'ignore' }); } catch {}
    try { execSync('git merge --abort', { cwd: dir, stdio: 'ignore' }); } catch {}
  } catch {}
}

function checkGitRepo() {
  cleanupStuckGit();
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
  } catch (e) {
    console.log('[CommitFlow] Initializing new Git repository...');
    execSync('git init', { stdio: 'inherit' });
    try {
      execSync('git branch -M main', { stdio: 'ignore' });
    } catch (err) {}
  }
}

function getGitConfig(key) {
  try {
    return execSync(`git config ${key}`, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

const REALISTIC_MESSAGES = [
  'feat: optimize event bus telemetry and trace logging',
  'fix: prevent race condition in async buffer queue',
  'refactor: streamline data pipeline transformation logic',
  'docs: update API contract and endpoint specifications',
  'perf: reduce memory allocation in matrix computation',
  'test: add unit coverage for edge-case parser states',
  'chore: bump minor dependency patches and lockfile',
  'style: enforce consistent lint formatting across modules',
  'feat: implement adaptive caching layer for remote sync',
  'fix: handle null pointer check in payload serializer',
  'refactor: extract reusable validator utility methods',
  'docs: clarify deployment environment variable requirements',
  'perf: index query key lookup table for O(1) retrieval',
  'test: expand integration suite for webhook deliveries',
  'chore: clean up deprecated helper functions',
  'feat: add structured JSON log formatter',
  'fix: resolve timezone offset discrepancy in scheduler',
  'refactor: decouple configuration loader from runtime core',
  'docs: add visual sequence diagrams for authentication flow',
  'perf: debounce high-frequency state update dispatchers'
];

const EMOJI_MESSAGES = [
  '✨ feat: add fast data serialization helper',
  '🐛 fix: patch unexpected null state in processor',
  '⚡ perf: optimize database query execution time',
  '📝 docs: document setup and configuration guidelines',
  '♻️ refactor: modularize core business logic handlers',
  '✅ test: add comprehensive test suites for handlers',
  '🔧 chore: update dependencies and build scripts',
  '🎨 style: polish code layout and formatting rules',
  '🚀 feat: enhance background sync dispatcher',
  '🛡️ fix: strengthen boundary validation checks'
];

function getRandomCommitMessage(style, index, dateStr) {
  if (style === 'minimal') {
    return `Update activity log: ${dateStr} (#${index + 1})`;
  } else if (style === 'emoji') {
    return EMOJI_MESSAGES[Math.floor(Math.random() * EMOJI_MESSAGES.length)];
  } else {
    return REALISTIC_MESSAGES[Math.floor(Math.random() * REALISTIC_MESSAGES.length)];
  }
}

function formatDateISO(d) {
  return d.toISOString().split('T')[0];
}

function run() {
  checkGitRepo();

  const authorName = options.authorName || getGitConfig('user.name') || 'Developer';
  const authorEmail = options.authorEmail || getGitConfig('user.email') || 'developer@users.noreply.github.com';

  console.log('====================================================');
  console.log('  CommitFlow: GitHub Contribution Booster v1.0.0     ');
  console.log('====================================================');
  console.log(`Author: ${authorName} <${authorEmail}>`);

  // Compute start and end dates
  const today = new Date();
  let endDate = today;
  let startDate;

  if (options.endDate) {
    endDate = new Date(options.endDate);
  }

  if (options.startDate) {
    startDate = new Date(options.startDate);
  } else if (options.days) {
    startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - options.days + 1);
  } else {
    startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 29);
  }

  const targetDir = path.dirname(path.join(repoRoot, options.targetFile));
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  console.log(`Date Range: ${formatDateISO(startDate)} to ${formatDateISO(endDate)}`);
  console.log(`Target: ~${options.count} commits/day (Variation: ±${options.variation})`);
  console.log(`Skip Weekends: ${options.skipWeekends ? 'Yes' : 'No'}`);
  console.log(`Dry Run: ${options.dryRun ? 'Yes (No commits will be made)' : 'No'}`);
  console.log('----------------------------------------------------');

  let totalCommits = 0;
  let currentDate = new Date(startDate);

  const daysList = [];
  while (currentDate <= endDate) {
    daysList.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }

  console.log(`Processing ${daysList.length} days...\n`);

  for (let d = 0; d < daysList.length; d++) {
    const day = daysList[d];
    const isWeekend = (day.getDay() === 0 || day.getDay() === 6);

    if (isWeekend && options.skipWeekends) {
      continue;
    }

    let dailyCount = options.count;
    if (options.variation > 0) {
      const delta = Math.floor(Math.random() * (options.variation * 2 + 1)) - options.variation;
      dailyCount = Math.max(1, dailyCount + delta);
    }

    const dateISO = formatDateISO(day);

    const startHour = 9;
    const endHour = 21;
    const totalMinutes = (endHour - startHour) * 60;
    const intervalMinutes = Math.floor(totalMinutes / (dailyCount + 1));

    for (let c = 0; c < dailyCount; c++) {
      const commitMinuteOffset = (c + 1) * intervalMinutes + Math.floor(Math.random() * (intervalMinutes * 0.6) - (intervalMinutes * 0.3));
      const commitHour = startHour + Math.floor(commitMinuteOffset / 60);
      const commitMin = Math.max(0, Math.min(59, commitMinuteOffset % 60));
      const commitSec = Math.floor(Math.random() * 60);

      const commitDate = new Date(day);
      commitDate.setHours(commitHour, commitMin, commitSec, 0);

      const dateStringISO = commitDate.toISOString();
      const message = getRandomCommitMessage(options.messageStyle, c, dateISO);

      const logEntry = `[${dateStringISO}] ${message} (seq: ${c + 1}/${dailyCount})\n`;

      if (!options.dryRun) {
        fs.appendFileSync(path.join(repoRoot, options.targetFile), logEntry, 'utf8');

        const env = Object.assign({}, process.env, {
          GIT_AUTHOR_NAME: authorName,
          GIT_AUTHOR_EMAIL: authorEmail,
          GIT_AUTHOR_DATE: dateStringISO,
          GIT_COMMITTER_NAME: authorName,
          GIT_COMMITTER_EMAIL: authorEmail,
          GIT_COMMITTER_DATE: dateStringISO,
          GIT_TERMINAL_PROMPT: '0'
        });

        execSync(`git add "${options.targetFile}"`, { cwd: repoRoot, stdio: 'ignore' });
        execSync(`git commit --allow-empty -m "${message}"`, {
          cwd: repoRoot,
          env: env,
          stdio: 'ignore'
        });
      }

      totalCommits++;
    }

    const progressPct = Math.round(((d + 1) / daysList.length) * 100);
    process.stdout.write(`\r[${progressPct}%] ${dateISO}: Created ${dailyCount} commits (Total: ${totalCommits})`);
  }

  console.log('\n----------------------------------------------------');
  console.log(`✅ Success! Generated ${totalCommits} commits across ${daysList.length} days.`);

  if (options.push && !options.dryRun) {
    console.log('\n[CommitFlow] Pushing commits to remote repository...');
    try {
      let pushUrl = options.remoteUrl;
      const token = options.token;

      if (!pushUrl) {
        try {
          pushUrl = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
        } catch {}
      }

      if (token && pushUrl) {
        const match = pushUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
        if (match) {
          const authUrl = `https://x-access-token:${token}@github.com/${match[1]}/${match[2]}.git`;
          execSync(`git push -u "${authUrl}" ${options.branch}`, {
            cwd: repoRoot,
            stdio: 'inherit',
            env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0' })
          });
          console.log(`✅ Successfully pushed commits to GitHub! (https://github.com/${match[1]})`);
          return;
        }
      }

      execSync(`git push origin ${options.branch}`, {
        cwd: repoRoot,
        stdio: 'inherit',
        env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0' })
      });
      console.log('✅ Successfully pushed to remote origin!');
    } catch (err) {
      console.error('\n⚠️ Git push failed.');
      console.error('💡 If pushing to GitHub without password prompt, provide your Personal Access Token:');
      console.error('   node scripts/backfill.js --token ghp_your_token --push');
      console.error('   Or set GITHUB_TOKEN environment variable.\n');
    }
  }

  console.log('\n[Tips for Green Graph]:');
  console.log('1. Ensure your git email matches your GitHub account primary email.');
  console.log('2. Make sure commits are on your repository default branch (usually "main").');
  console.log('3. Push your commits to GitHub.\n');
}

if (require.main === module) {
  run();
}

module.exports = { run, options };
