const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const repoRoot = __dirname;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper to mask sensitive tokens in strings/logs
function maskToken(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/https:\/\/[^@:]+:[^@]+@github\.com/gi, 'https://***@github.com')
    .replace(/https:\/\/[^@]+@github\.com/gi, 'https://***@github.com')
    .replace(/ghp_[a-zA-Z0-9]{20,}/g, 'ghp_********************')
    .replace(/github_pat_[a-zA-Z0-9_]{20,}/g, 'github_pat_********************');
}

// Helper to parse GitHub owner and repo name from various URL formats
function parseGitHubUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const cleaned = url.trim().replace(/\.git$/, '');
  const httpsMatch = cleaned.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }
  const sshMatch = cleaned.match(/git@github\.com:([^/]+)\/([^/]+)/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }
  return null;
}

// Clean up any leftover Git lock files or abort stuck rebase/merge
function cleanupStuckGit(dir) {
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

// Helper to safely execute git commands in a specific working directory
function execGit(cmd, fallback = '', customEnv = {}, cwd = repoRoot) {
  try {
    return execSync(cmd, {
      cwd: cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
      env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0' }, customEnv)
    }).trim();
  } catch {
    return fallback;
  }
}

// Ensure Git repo is initialized and configured in repoRoot (for local standalone mode)
function ensureGitRepo() {
  cleanupStuckGit(repoRoot);
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd: repoRoot, stdio: 'ignore' });
  } catch {
    try {
      execSync('git init', { cwd: repoRoot, stdio: 'ignore' });
      execSync('git branch -M main', { cwd: repoRoot, stdio: 'ignore' });
    } catch {}
  }

  // Ensure branch is main and not in detached HEAD
  try {
    execSync('git checkout -B main', { cwd: repoRoot, stdio: 'ignore' });
  } catch {}

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

  // Auto-set remote origin if missing
  try {
    const remotes = execGit('git remote', '');
    const remoteList = remotes ? remotes.split('\n').map(r => r.trim()).filter(Boolean) : [];
    if (!remoteList.includes('origin')) {
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
  const userName = execGit('git config user.name', '') || 'Developer';
  const userEmail = execGit('git config user.email', '') || '';
  const branch = execGit('git branch --show-current', 'main') || 'main';

  let remoteUrl = '';
  const remotes = execGit('git remote', '');
  const remoteList = remotes ? remotes.split('\n').map(r => r.trim()).filter(Boolean) : [];
  if (remoteList.includes('origin')) {
    remoteUrl = execGit('git remote get-url origin', '');
  } else if (remoteList.length > 0) {
    remoteUrl = execGit(`git remote get-url ${remoteList[0]}`, '');
  }
  if (!remoteUrl) {
    remoteUrl = process.env.GIT_REMOTE_URL || process.env.REPO_URL || 'https://github.com/bgukhan204-tech/commit-flow.git';
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

  const hasServerToken = Boolean(process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GIT_AUTH_TOKEN);

  res.json({
    userName,
    userEmail,
    branch,
    remoteUrl: maskToken(remoteUrl),
    rawRemoteUrl: remoteUrl.includes('@') ? '' : remoteUrl,
    commitCount,
    recentCommits,
    repoRoot,
    hasServerToken
  });
});

// 2. Verify GitHub Token, Repo & Email with GitHub API
app.post('/api/verify-github', async (req, res) => {
  const { repoUrl, token: clientToken, authorEmail } = req.body;
  const token = (clientToken || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GIT_AUTH_TOKEN || '').trim();

  const parsed = parseGitHubUrl(repoUrl || process.env.GIT_REMOTE_URL || 'https://github.com/bgukhan204-tech/commit-flow.git');
  if (!parsed) {
    return res.status(400).json({ success: false, error: 'Invalid GitHub repository URL format.' });
  }

  const { owner, repo } = parsed;
  const headers = {
    'User-Agent': 'CommitFlow-App/1.0',
    'Accept': 'application/vnd.github.v3+json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    let authUser = null;
    let userEmails = [];
    let repoData = null;

    // Check token authentication
    if (token) {
      const userRes = await fetch('https://api.github.com/user', { headers });
      if (userRes.ok) {
        authUser = await userRes.json();
      } else if (userRes.status === 401) {
        return res.status(401).json({
          success: false,
          error: 'Invalid GitHub Personal Access Token. Please check token permissions or generate a new one.'
        });
      }

      // Check verified emails for matching
      try {
        const emailsRes = await fetch('https://api.github.com/user/emails', { headers });
        if (emailsRes.ok) {
          userEmails = await emailsRes.json();
        }
      } catch {}
    }

    // Check repository status
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
    if (!repoRes.ok) {
      if (repoRes.status === 404) {
        return res.status(404).json({
          success: false,
          error: `Repository '${owner}/${repo}' not found. Please verify the URL or ensure your Personal Access Token has 'repo' access if it is private.`
        });
      }
      if (repoRes.status === 403) {
        return res.status(200).json({
          success: true,
          owner,
          repo,
          full_name: `${owner}/${repo}`,
          default_branch: 'main',
          isPrivate: false,
          authenticatedUser: authUser ? {
            login: authUser.login,
            name: authUser.name,
            avatar_url: authUser.avatar_url
          } : null,
          canPush: Boolean(token),
          hasToken: Boolean(token),
          note: 'GitHub unauthenticated rate limit reached. Add your GitHub Personal Access Token for full API verification.'
        });
      }
      return res.status(repoRes.status).json({
        success: false,
        error: `GitHub API error (${repoRes.status}): ${repoRes.statusText}`
      });
    }

    repoData = await repoRes.json();

    let emailMatched = false;
    if (authorEmail && userEmails.length > 0) {
      emailMatched = userEmails.some(e => e.email.toLowerCase() === authorEmail.toLowerCase());
    } else if (authorEmail && authUser) {
      if (authUser.email && authUser.email.toLowerCase() === authorEmail.toLowerCase()) {
        emailMatched = true;
      }
    }

    const canPush = repoData.permissions ? Boolean(repoData.permissions.push || repoData.permissions.admin) : Boolean(token);

    res.json({
      success: true,
      owner,
      repo,
      full_name: repoData.full_name,
      default_branch: repoData.default_branch || 'main',
      isPrivate: repoData.private,
      authenticatedUser: authUser ? {
        login: authUser.login,
        name: authUser.name,
        avatar_url: authUser.avatar_url
      } : null,
      canPush,
      hasToken: Boolean(token),
      emailMatched,
      verifiedEmailsCount: userEmails.length
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Set Git Identity
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

// 4. Generate Commits (Server-Sent Events streaming with isolated workspace)
app.get('/api/stream-commits', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

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
    repoUrl,
    branch = 'main',
    token: clientToken,
    push = 'true'
  } = req.query;

  const targetCount = parseInt(count, 10) || 10;
  const targetVariation = parseInt(variation, 10) || 0;
  const shouldSkipWeekends = skipWeekends === 'true';
  const shouldPush = push === 'true' || push === true;

  const token = (clientToken || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GIT_AUTH_TOKEN || '').trim();
  const effectiveRepoUrl = (repoUrl || process.env.GIT_REMOTE_URL || process.env.REPO_URL || 'https://github.com/bgukhan204-tech/commit-flow.git').trim();
  const parsedRepo = parseGitHubUrl(effectiveRepoUrl);

  const name = authorName || execGit('git config user.name', 'Developer') || 'Developer';
  const email = authorEmail || execGit('git config user.email', 'developer@users.noreply.github.com') || 'developer@users.noreply.github.com';

  // Create isolated temp workspace for this job to prevent repo locking and multi-user collisions
  let jobDir = null;
  try {
    jobDir = fs.mkdtempSync(path.join(os.tmpdir(), 'commitflow-job-'));
  } catch {
    jobDir = repoRoot;
  }

  const isTempJob = (jobDir !== repoRoot);

  sendEvent('log', { text: `🚀 Initializing CommitFlow Engine...`, type: 'info' });
  sendEvent('log', { text: `Author Identity: ${name} <${email}>`, type: 'info' });

  if (parsedRepo) {
    sendEvent('log', { text: `Target Repository: https://github.com/${parsedRepo.owner}/${parsedRepo.repo} [branch: ${branch}]`, type: 'info' });
  }

  let pushTargetUrl = effectiveRepoUrl;
  if (token && parsedRepo) {
    pushTargetUrl = `https://x-access-token:${encodeURIComponent(token)}@github.com/${parsedRepo.owner}/${parsedRepo.repo}.git`;
  }

  try {
    // 1. Prepare Workspace in jobDir
    if (isTempJob) {
      if (token && parsedRepo) {
        sendEvent('log', { text: `📦 Connecting to GitHub repository ${parsedRepo.owner}/${parsedRepo.repo}...`, type: 'info' });
        let clonedSuccessfully = false;

        // Try shallow clone of existing target branch
        try {
          execSync(`git clone --depth 1 --branch ${branch} "${pushTargetUrl}" .`, {
            cwd: jobDir,
            stdio: 'pipe',
            env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0' })
          });
          clonedSuccessfully = true;
        } catch {
          // If branch doesn't exist yet, try shallow clone of default repo
          try {
            execSync(`git clone --depth 1 "${pushTargetUrl}" .`, {
              cwd: jobDir,
              stdio: 'pipe',
              env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0' })
            });
            clonedSuccessfully = true;
          } catch {
            // Repo might be empty (0 commits) or new
            execSync('git init', { cwd: jobDir, stdio: 'ignore' });
            execSync(`git branch -M ${branch}`, { cwd: jobDir, stdio: 'ignore' });
            execSync(`git remote add origin "${pushTargetUrl}"`, { cwd: jobDir, stdio: 'ignore' });
          }
        }

        if (clonedSuccessfully) {
          try {
            execSync(`git checkout -B ${branch}`, { cwd: jobDir, stdio: 'ignore' });
          } catch {}
          try {
            execSync(`git remote set-url origin "${pushTargetUrl}"`, { cwd: jobDir, stdio: 'ignore' });
          } catch {}
        }
      } else {
        // Standalone temp init
        execSync('git init', { cwd: jobDir, stdio: 'ignore' });
        execSync(`git branch -M ${branch}`, { cwd: jobDir, stdio: 'ignore' });
        if (effectiveRepoUrl) {
          try {
            execSync(`git remote add origin "${pushTargetUrl}"`, { cwd: jobDir, stdio: 'ignore' });
          } catch {}
        }
      }
    } else {
      // Local repoRoot fallback - clean any stuck lock files
      cleanupStuckGit(repoRoot);
      try {
        execSync(`git checkout -B ${branch}`, { cwd: repoRoot, stdio: 'ignore' });
      } catch {}
    }

    // Set local git author config in this workspace
    cleanupStuckGit(jobDir);
    try {
      execSync(`git config user.name "${name.replace(/"/g, '\\"')}"`, { cwd: jobDir, stdio: 'ignore' });
      execSync(`git config user.email "${email.replace(/"/g, '\\"')}"`, { cwd: jobDir, stdio: 'ignore' });
    } catch {}

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
      text: `Date Range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]} (${daysList.length} days total)`,
      type: 'info'
    });

    const targetFile = path.join(jobDir, 'data', 'activity.log');
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
      'perf: debounce high-frequency state update dispatchers',
      'feat: integrate automated health check probes',
      'fix: graceful fallback on upstream rate limiting',
      'refactor: modularize repository sync orchestrator'
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

    let totalCommits = 0;

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

        let msg;
        if (messageStyle === 'emoji') {
          msg = EMOJI_MESSAGES[Math.floor(Math.random() * EMOJI_MESSAGES.length)];
        } else if (messageStyle === 'minimal') {
          msg = `chore: update activity log ${dateISO} (#${c + 1}/${dailyCount})`;
        } else {
          msg = REALISTIC_MESSAGES[Math.floor(Math.random() * REALISTIC_MESSAGES.length)];
        }

        const logEntry = `[${dateStrISO}] ${msg} (#${c + 1}/${dailyCount})\n`;
        fs.appendFileSync(targetFile, logEntry, 'utf8');

        const env = Object.assign({}, process.env, {
          GIT_AUTHOR_NAME: name,
          GIT_AUTHOR_EMAIL: email,
          GIT_AUTHOR_DATE: dateStrISO,
          GIT_COMMITTER_NAME: name,
          GIT_COMMITTER_EMAIL: email,
          GIT_COMMITTER_DATE: dateStrISO,
          GIT_TERMINAL_PROMPT: '0'
        });

        execSync(`git add "data/activity.log"`, { cwd: jobDir, stdio: 'ignore' });
        execSync(`git commit --allow-empty -m "${msg.replace(/"/g, '\\"')}"`, {
          cwd: jobDir,
          env: env,
          stdio: 'pipe'
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

    let pushSuccess = false;
    let pushMessage = '';

    if (shouldPush) {
      sendEvent('log', { text: `🚀 Authenticating and pushing commits to remote GitHub...`, type: 'info' });

      try {
        let pushResult = '';
        try {
          pushResult = execSync(`git push "${pushTargetUrl}" HEAD:refs/heads/${branch}`, {
            cwd: jobDir,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0' })
          });
        } catch (initialPushErr) {
          // If branch needs force lease update
          pushResult = execSync(`git push "${pushTargetUrl}" HEAD:refs/heads/${branch} --force-with-lease`, {
            cwd: jobDir,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0' })
          });
        }

        pushSuccess = true;
        sendEvent('log', { text: `🎉 Successfully pushed ${totalCommits} commits to GitHub (${branch})!`, type: 'success' });
        if (pushResult && pushResult.trim()) {
          sendEvent('log', { text: `Git: ${maskToken(pushResult.trim())}`, type: 'info' });
        }
        if (parsedRepo) {
          sendEvent('log', {
            text: `🌟 GitHub Contribution Heatmap updated! Visit: https://github.com/${parsedRepo.owner}`,
            type: 'highlight'
          });
        }
      } catch (pushErr) {
        const rawErrMsg = (pushErr.stderr ? pushErr.stderr.toString() : pushErr.message) || '';
        const cleanErrMsg = maskToken(rawErrMsg.trim());

        if (cleanErrMsg.includes('could not read Username') || cleanErrMsg.includes('No such device or address') || cleanErrMsg.includes('Authentication failed') || cleanErrMsg.includes('403') || cleanErrMsg.includes('Permission to')) {
          sendEvent('log', {
            text: `⚠️ Git push authentication required: GitHub requires a Personal Access Token (PAT) with 'repo' scope to push commits.`,
            type: 'warning'
          });
          sendEvent('log', {
            text: `💡 Quick Fix: Enter your GitHub Personal Access Token in the top authentication bar.`,
            type: 'info'
          });
        } else {
          sendEvent('log', { text: `⚠️ Git push failed: ${cleanErrMsg}`, type: 'warning' });
        }
        pushMessage = cleanErrMsg;
      }
    }

    sendEvent('complete', {
      totalCommits,
      daysCount: daysList.length,
      pushSuccess,
      pushMessage,
      owner: parsedRepo ? parsedRepo.owner : null,
      repo: parsedRepo ? parsedRepo.repo : null
    });
  } catch (err) {
    const rawErrMsg = (err.stderr ? err.stderr.toString() : err.message) || 'Unknown error occurred';
    const cleanErrMsg = maskToken(rawErrMsg.trim());
    sendEvent('log', { text: `❌ Error: ${cleanErrMsg}`, type: 'error' });
    sendEvent('error', { message: cleanErrMsg });
  } finally {
    if (isTempJob && jobDir && fs.existsSync(jobDir)) {
      try {
        fs.rmSync(jobDir, { recursive: true, force: true, maxRetries: 3 });
      } catch {}
    }
    res.end();
  }
});

// 5. Git Push Endpoint
app.post('/api/git-push', (req, res) => {
  ensureGitRepo();
  const { repoUrl, token: clientToken, branch = 'main' } = req.body;
  const token = (clientToken || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GIT_AUTH_TOKEN || '').trim();
  const effectiveRepoUrl = (repoUrl || process.env.GIT_REMOTE_URL || process.env.REPO_URL || 'https://github.com/bgukhan204-tech/commit-flow.git').trim();
  const parsedRepo = parseGitHubUrl(effectiveRepoUrl);

  let pushTargetUrl = effectiveRepoUrl;
  if (token && parsedRepo) {
    pushTargetUrl = `https://x-access-token:${encodeURIComponent(token)}@github.com/${parsedRepo.owner}/${parsedRepo.repo}.git`;
  }

  try {
    cleanupStuckGit(repoRoot);
    const remotes = execGit('git remote', '');
    const remoteList = remotes ? remotes.split('\n').map(r => r.trim()).filter(Boolean) : [];
    if (remoteList.includes('origin')) {
      execSync(`git remote set-url origin "${pushTargetUrl}"`, { cwd: repoRoot, stdio: 'ignore' });
    } else {
      execSync(`git remote add origin "${pushTargetUrl}"`, { cwd: repoRoot, stdio: 'ignore' });
    }

    const output = execSync(`git push "${pushTargetUrl}" HEAD:refs/heads/${branch}`, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0' })
    });

    res.json({
      success: true,
      message: 'Successfully pushed commits to GitHub!',
      output: maskToken(output),
      owner: parsedRepo ? parsedRepo.owner : null
    });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : err.message;
    const cleanError = maskToken(stderr || err.message);
    res.status(500).json({ error: cleanError, stderr: cleanError });
  }
});

// 6. Add / Update Remote URL
app.post('/api/set-remote', (req, res) => {
  ensureGitRepo();
  const { remoteUrl } = req.body;
  if (!remoteUrl) return res.status(400).json({ error: 'Remote URL is required' });
  try {
    const cleanUrl = remoteUrl.trim();
    const remotes = execGit('git remote', '');
    const remoteList = remotes ? remotes.split('\n').map(r => r.trim()).filter(Boolean) : [];
    if (remoteList.includes('origin')) {
      execSync(`git remote set-url origin "${cleanUrl}"`, { cwd: repoRoot, stdio: 'ignore' });
    } else {
      execSync(`git remote add origin "${cleanUrl}"`, { cwd: repoRoot, stdio: 'ignore' });
    }
    res.json({ success: true, message: 'Remote origin updated successfully!', remoteUrl: cleanUrl });
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
