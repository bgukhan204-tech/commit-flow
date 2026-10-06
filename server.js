const express = require('express');
const path = require('path');
const fs = require('fs');
const { execSync, spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const repoRoot = __dirname;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper to safely execute git commands
function execGit(cmd, fallback = '') {
  try {
    return execSync(cmd, { cwd: repoRoot, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch {
    return fallback;
  }
}

// Ensure Git repo is initialized
function ensureGitRepo() {
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd: repoRoot, stdio: 'ignore' });
  } catch {
    try {
      execSync('git init', { cwd: repoRoot, stdio: 'ignore' });
      execSync('git branch -M main', { cwd: repoRoot, stdio: 'ignore' });
    } catch {}
  }

  // Ensure default git user config if missing
  try {
    const name = execGit('git config user.name', '');
    if (!name) {
      execSync('git config user.name "CommitFlow Developer"', { cwd: repoRoot, stdio: 'ignore' });
    }
    const email = execGit('git config user.email', '');
    if (!email) {
      execSync('git config user.email "developer@users.noreply.github.com"', { cwd: repoRoot, stdio: 'ignore' });
    }
  } catch {}

  // Auto-set remote origin if missing (especially in cloud hosting environments like Render)
  try {
    const remotes = execGit('git remote', '');
    if (!remotes.split('\n').includes('origin')) {
      const defaultRepo = process.env.GIT_REMOTE_URL || process.env.REPO_URL || 'https://github.com/bgukhan204-tech/commit-flow.git';
      if (defaultRepo) {
        execSync(`git remote add origin "${defaultRepo}"`, { cwd: repoRoot, stdio: 'ignore' });
      }
    }
  } catch {}
}

ensureGitRepo();

// 1. Git Info Endpoint
app.get('/api/git-info', (req, res) => {
  ensureGitRepo();
  const userName = execGit('git config user.name', '');
  const userEmail = execGit('git config user.email', '');
  const branch = execGit('git branch --show-current', 'main') || 'main';

  let remoteUrl = '';
  const remotes = execGit('git remote', '');
  if (remotes.split('\n').includes('origin')) {
    remoteUrl = execGit('git remote get-url origin', '');
  } else if (remotes.trim().length > 0) {
    const first = remotes.trim().split('\n')[0].trim();
    if (first) remoteUrl = execGit(`git remote get-url ${first}`, '');
  }
  if (!remoteUrl) {
    remoteUrl = process.env.GIT_REMOTE_URL || process.env.REPO_URL || '';
  }

  const commitCountStr = execGit('git rev-list --count HEAD', '0');
  const commitCount = parseInt(commitCountStr, 10) || 0;

  let recentCommits = [];
  if (commitCount > 0) {
    try {
      const rawLog = execGit('git log -n 12 --pretty=format:"%h|%an|%ad|%s" --date=short');
      if (rawLog) {
        recentCommits = rawLog.split('\n').filter(Boolean).map(line => {
          const [hash, author, date, message] = line.split('|');
          return { hash, author, date, message };
        });
      }
    } catch {}
  }

  res.json({
    userName,
    userEmail,
    branch,
    remoteUrl,
    commitCount,
    recentCommits,
    repoRoot
  });
});

// 2. Set Git Identity
app.post('/api/set-git-identity', (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required.' });
  }
  try {
    execSync(`git config user.name "${name.replace(/"/g, '\\"')}"`, { cwd: repoRoot });
    execSync(`git config user.email "${email.replace(/"/g, '\\"')}"`, { cwd: repoRoot });
    res.json({ success: true, message: 'Git identity updated successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Generate Commits (Server-Sent Events streaming for real-time progress)
app.get('/api/stream-commits', (req, res) => {
  ensureGitRepo();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const {
    days,
    startDate: qStart,
    endDate: qEnd,
    count = 10,
    variation = 2,
    skipWeekends = 'false',
    messageStyle = 'realistic',
    authorName,
    authorEmail,
    push = 'false'
  } = req.query;

  const targetCount = parseInt(count, 10) || 10;
  const targetVariation = parseInt(variation, 10) || 0;
  const shouldSkipWeekends = skipWeekends === 'true';
  const shouldPush = push === 'true';

  const name = authorName || execGit('git config user.name', 'Developer') || 'Developer';
  const email = authorEmail || execGit('git config user.email', 'developer@users.noreply.github.com') || 'developer@users.noreply.github.com';

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  sendEvent('log', { text: `🚀 Starting commit generation...`, type: 'info' });
  sendEvent('log', { text: `Author: ${name} <${email}>`, type: 'info' });

  const today = new Date();
  let endDate = today;
  let startDate;

  if (qEnd) {
    endDate = new Date(qEnd);
  }
  if (qStart) {
    startDate = new Date(qStart);
  } else if (days) {
    startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - parseInt(days, 10) + 1);
  } else {
    startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 29); // 30 days
  }

  const daysList = [];
  let cur = new Date(startDate);
  while (cur <= endDate) {
    daysList.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }

  sendEvent('log', {
    text: `Date Range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]} (${daysList.length} days)`,
    type: 'info'
  });

  const targetFile = path.join(repoRoot, 'data', 'activity.log');
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });

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

  let totalCommits = 0;

  try {
    for (let d = 0; d < daysList.length; d++) {
      const day = daysList[d];
      const isWeekend = (day.getDay() === 0 || day.getDay() === 6);

      if (isWeekend && shouldSkipWeekends) {
        continue;
      }

      let dailyCount = targetCount;
      if (targetVariation > 0) {
        const delta = Math.floor(Math.random() * (targetVariation * 2 + 1)) - targetVariation;
        dailyCount = Math.max(1, dailyCount + delta);
      }

      const dateISO = day.toISOString().split('T')[0];
      const startHour = 9;
      const endHour = 21;
      const totalMins = (endHour - startHour) * 60;
      const interval = Math.floor(totalMins / (dailyCount + 1));

      for (let c = 0; c < dailyCount; c++) {
        const commitMinuteOffset = (c + 1) * interval + Math.floor(Math.random() * 8 - 4);
        const cHour = startHour + Math.floor(commitMinuteOffset / 60);
        const cMin = Math.max(0, Math.min(59, commitMinuteOffset % 60));
        const cSec = Math.floor(Math.random() * 60);

        const commitDate = new Date(day);
        commitDate.setHours(cHour, cMin, cSec, 0);
        const dateStrISO = commitDate.toISOString();

        const msg = REALISTIC_MESSAGES[Math.floor(Math.random() * REALISTIC_MESSAGES.length)];
        const logEntry = `[${dateStrISO}] ${msg} (#${c + 1}/${dailyCount})\n`;

        fs.appendFileSync(targetFile, logEntry, 'utf8');

        const env = Object.assign({}, process.env, {
          GIT_AUTHOR_NAME: name,
          GIT_AUTHOR_EMAIL: email,
          GIT_AUTHOR_DATE: dateStrISO,
          GIT_COMMITTER_NAME: name,
          GIT_COMMITTER_EMAIL: email,
          GIT_COMMITTER_DATE: dateStrISO
        });

        execSync(`git add "data/activity.log"`, { cwd: repoRoot, stdio: 'ignore' });
        execSync(`git commit --allow-empty -m "${msg}"`, {
          cwd: repoRoot,
          env: env,
          stdio: 'ignore'
        });

        totalCommits++;
      }

      const progress = Math.round(((d + 1) / daysList.length) * 100);
      sendEvent('progress', {
        percent: progress,
        currentDate: dateISO,
        dailyCommits: dailyCount,
        totalCommits: totalCommits
      });
    }

    sendEvent('log', {
      text: `✅ Generated ${totalCommits} commits across ${daysList.length} days successfully!`,
      type: 'success'
    });

    if (shouldPush) {
      sendEvent('log', { text: `Pushing commits to remote origin...`, type: 'info' });
      try {
        const remotes = execGit('git remote', '');
        if (!remotes.split('\n').includes('origin')) {
          sendEvent('log', { text: `⚠️ Remote 'origin' is not configured yet. Configure your GitHub repo URL below.`, type: 'warning' });
        } else {
          execSync('git push origin main', { cwd: repoRoot, stdio: ['pipe', 'pipe', 'pipe'] });
          sendEvent('log', { text: `✅ Successfully pushed to GitHub!`, type: 'success' });
        }
      } catch (pushErr) {
        const errMsg = pushErr.stderr ? pushErr.stderr.toString() : pushErr.message;
        sendEvent('log', { text: `⚠️ Git push failed: ${errMsg.trim()}`, type: 'warning' });
      }
    }

    sendEvent('complete', {
      totalCommits,
      daysCount: daysList.length
    });
  } catch (err) {
    sendEvent('error', { message: err.message });
  } finally {
    res.end();
  }
});

// 4. Git Push endpoint
app.post('/api/git-push', (req, res) => {
  ensureGitRepo();
  try {
    const remotes = execGit('git remote', '');
    if (!remotes.split('\n').includes('origin')) {
      return res.status(400).json({
        error: 'No git remote "origin" is configured. Please set your GitHub repository URL in the Remote Sync section first.'
      });
    }
    const output = execSync('git push origin main', { cwd: repoRoot, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    res.json({ success: true, output });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : err.message;
    res.status(500).json({ error: stderr || err.message, stderr });
  }
});

// 5. Add / Update remote URL
app.post('/api/set-remote', (req, res) => {
  ensureGitRepo();
  const { remoteUrl } = req.body;
  if (!remoteUrl) return res.status(400).json({ error: 'Remote URL is required' });
  try {
    const remotes = execGit('git remote', '');
    if (remotes.split('\n').includes('origin')) {
      execSync(`git remote set-url origin "${remoteUrl.trim()}"`, { cwd: repoRoot, stdio: 'ignore' });
    } else {
      execSync(`git remote add origin "${remoteUrl.trim()}"`, { cwd: repoRoot, stdio: 'ignore' });
    }
    res.json({ success: true, message: 'Remote origin updated successfully!', remoteUrl: remoteUrl.trim() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  🌟 CommitFlow Web Control Center is running!`);
  console.log(`  👉 URL: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
