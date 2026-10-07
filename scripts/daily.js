#!/usr/bin/env node

/**
 * CommitFlow - Daily Commit Runner
 * Generates 10 commits for the current day and pushes to remote.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
process.chdir(repoRoot);

const count = parseInt(process.env.COMMIT_COUNT || '10', 10);
const targetFile = 'data/activity.log';

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
  'docs: clarify deployment environment variable requirements'
];

function run() {
  const targetDir = path.dirname(path.join(repoRoot, targetFile));
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];

  console.log(`[CommitFlow] Starting daily commit run for ${dateStr}...`);
  console.log(`[CommitFlow] Target: ${count} commits`);

  let created = 0;
  for (let i = 0; i < count; i++) {
    const msg = REALISTIC_MESSAGES[Math.floor(Math.random() * REALISTIC_MESSAGES.length)];
    const commitTime = new Date();
    commitTime.setSeconds(commitTime.getSeconds() + i * 2);

    const logEntry = `[${commitTime.toISOString()}] ${msg} (#${i + 1}/${count})\n`;
    fs.appendFileSync(path.join(repoRoot, targetFile), logEntry, 'utf8');

    execSync(`git add "${targetFile}"`, { cwd: repoRoot, stdio: 'ignore' });
    execSync(`git commit -m "${msg}"`, {
      cwd: repoRoot,
      stdio: 'ignore',
      env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0' })
    });
    created++;
  }

  console.log(`✅ [CommitFlow] Successfully created ${created} commits for today.`);

  // Auto push if remote is configured or if running in CI/Render
  try {
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    const branch = process.env.GIT_BRANCH || 'main';

    let remoteUrl = '';
    try {
      remoteUrl = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
    } catch {}

    if (token && remoteUrl) {
      const match = remoteUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
      if (match) {
        const authUrl = `https://x-access-token:${token}@github.com/${match[1]}/${match[2]}.git`;
        execSync(`git push -u "${authUrl}" ${branch}`, {
          cwd: repoRoot,
          stdio: 'inherit',
          env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0' })
        });
        console.log('✅ Pushed to GitHub via Token!');
        return;
      }
    }

    const remotes = execSync('git remote', { encoding: 'utf8' }).trim();
    if (remotes.includes('origin')) {
      console.log('[CommitFlow] Pushing to remote origin...');
      execSync(`git push origin ${branch}`, {
        cwd: repoRoot,
        stdio: 'inherit',
        env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0' })
      });
      console.log('✅ Pushed to GitHub!');
    }
  } catch (err) {
    console.log('ℹ️ Push skipped or completed. (Ensure GITHUB_TOKEN or remote origin is set for cloud runs).');
  }
}

run();
