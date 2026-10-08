/**
 * CommitFlow - Frontend Application Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // Application State
  const state = {
    gitInfo: null,
    heatmapData: new Map(), // key: 'YYYY-MM-DD', value: { date, count, level }
    selectedPreset: '30days',
    commitsPerDay: 10,
    variation: 2,
    skipWeekends: false,
    autoPush: true,
    isGenerating: false,
    verifiedUser: null
  };

  // DOM Elements - Auth & Headers
  const gitStatusBadge = document.getElementById('gitStatusBadge');
  const gitStatusText = document.getElementById('gitStatusText');
  const remoteUrlInput = document.getElementById('remoteUrlInput');
  const githubTokenInput = document.getElementById('githubTokenInput');
  const btnToggleToken = document.getElementById('btnToggleToken');
  const eyeIcon = document.getElementById('eyeIcon');
  const authorEmailInput = document.getElementById('authorEmail');
  const authorNameInput = document.getElementById('authorName');
  const branchInput = document.getElementById('branchInput');
  const btnVerifyGithub = document.getElementById('btnVerifyGithub');
  const authFeedbackBanner = document.getElementById('authFeedbackBanner');
  const authFeedbackContent = document.getElementById('authFeedbackContent');

  // DOM Elements - Stats
  const statDailyTarget = document.getElementById('statDailyTarget');
  const statSimulatedCommits = document.getElementById('statSimulatedCommits');
  const statDaysRange = document.getElementById('statDaysRange');
  const statLocalTotal = document.getElementById('statLocalTotal');

  // DOM Elements - Heatmap
  const mainTabs = document.getElementById('mainTabs');
  const heatmapGrid = document.getElementById('heatmapGrid');
  const heatmapMonths = document.getElementById('heatmapMonths');
  const hoveredCellInfo = document.getElementById('hoveredCellInfo');

  // DOM Elements - Generator Controls
  const startDateInput = document.getElementById('startDate');
  const endDateInput = document.getElementById('endDate');
  const commitCountSlider = document.getElementById('commitCountSlider');
  const sliderValue = document.getElementById('sliderValue');
  const variationSelect = document.getElementById('variationSelect');
  const messageStyleSelect = document.getElementById('messageStyleSelect');
  const skipWeekendsCheckbox = document.getElementById('skipWeekends');
  const autoPushCheckbox = document.getElementById('autoPush');

  // DOM Elements - Terminal & Progress
  const btnGenerateNow = document.getElementById('btnGenerateNow');
  const btnRemoveCommits = document.getElementById('btnRemoveCommits');
  const btnCopyCommand = document.getElementById('btnCopyCommand');
  const btnClearTerminal = document.getElementById('btnClearTerminal');
  const terminalScreen = document.getElementById('terminalScreen');
  const progressWrapper = document.getElementById('progressWrapper');
  const progressBarFill = document.getElementById('progressBarFill');
  const progressPercent = document.getElementById('progressPercent');
  const progressStatus = document.getElementById('progressStatus');
  const pushSuccessCard = document.getElementById('pushSuccessCard');
  const btnViewProfile = document.getElementById('btnViewProfile');
  const btnPushRemote = document.getElementById('btnPushRemote');
  const btnCopyWorkflow = document.getElementById('btnCopyWorkflow');

  // DOM Elements - Remove Commits Modal
  const removeModal = document.getElementById('removeModal');
  const btnCloseRemoveModal = document.getElementById('btnCloseRemoveModal');
  const btnCancelRemoveModal = document.getElementById('btnCancelRemoveModal');
  const modalRepoTarget = document.getElementById('modalRepoTarget');
  const modalBranchLabel = document.getElementById('modalBranchLabel');
  const modalBatchCount = document.getElementById('modalBatchCount');
  const customRemoveGroup = document.getElementById('customRemoveGroup');
  const removeCustomCount = document.getElementById('removeCustomCount');
  const cleanActivityLogCheckbox = document.getElementById('cleanActivityLogCheckbox');
  const btnConfirmRemoveCommits = document.getElementById('btnConfirmRemoveCommits');

  // Load Saved Auth from localStorage
  const savedToken = localStorage.getItem('cf_github_token');
  if (savedToken) githubTokenInput.value = savedToken;

  const savedRepo = localStorage.getItem('cf_github_repo');
  if (savedRepo) remoteUrlInput.value = savedRepo;

  const savedEmail = localStorage.getItem('cf_author_email');
  if (savedEmail) authorEmailInput.value = savedEmail;

  const savedName = localStorage.getItem('cf_author_name');
  if (savedName) authorNameInput.value = savedName;

  // Persist Inputs to localStorage on input
  githubTokenInput.addEventListener('input', () => {
    localStorage.setItem('cf_github_token', githubTokenInput.value.trim());
  });
  remoteUrlInput.addEventListener('input', () => {
    localStorage.setItem('cf_github_repo', remoteUrlInput.value.trim());
  });
  authorEmailInput.addEventListener('input', () => {
    localStorage.setItem('cf_author_email', authorEmailInput.value.trim());
  });
  authorNameInput.addEventListener('input', () => {
    localStorage.setItem('cf_author_name', authorNameInput.value.trim());
  });

  // Toggle Password Visibility
  btnToggleToken.addEventListener('click', () => {
    if (githubTokenInput.type === 'password') {
      githubTokenInput.type = 'text';
      eyeIcon.innerHTML = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`;
    } else {
      githubTokenInput.type = 'password';
      eyeIcon.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
    }
  });

  // Initialize Dates (Default: Last 30 Days)
  const today = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(today.getDate() - 29);

  startDateInput.value = formatDateISO(thirtyDaysAgo);
  endDateInput.value = formatDateISO(today);

  // 1. Fetch Git Info from Server
  async function fetchGitInfo() {
    try {
      const res = await fetch('/api/git-info');
      const data = await res.json();
      state.gitInfo = data;

      if (data.userEmail && !authorEmailInput.value) {
        authorEmailInput.value = data.userEmail;
      }
      if (data.userName && !authorNameInput.value) {
        authorNameInput.value = data.userName;
      }
      if (data.remoteUrl && !remoteUrlInput.value) {
        remoteUrlInput.value = data.remoteUrl;
      }
      if (data.branch) {
        branchInput.value = data.branch;
      }

      statLocalTotal.textContent = data.commitCount || 0;
      gitStatusText.textContent = `${data.branch} • ${data.commitCount} commits`;
      logToTerminal(`Git repository connected: branch [${data.branch}], total commits: ${data.commitCount}`, 'info');

      if (data.remoteUrl) {
        logToTerminal(`Remote origin: ${data.remoteUrl}`, 'info');
      }

      if (data.hasServerToken) {
        logToTerminal(`🔒 Server environment has GITHUB_TOKEN configured!`, 'success');
      }
    } catch (err) {
      gitStatusText.textContent = 'Git Local Ready';
      logToTerminal(`Running in standalone mode: ${err.message}`, 'warning');
    }
  }

  // 2. Verify GitHub Connection (Token, Repo, Email)
  btnVerifyGithub.addEventListener('click', async () => {
    const repoUrl = remoteUrlInput.value.trim();
    const token = githubTokenInput.value.trim();
    const email = authorEmailInput.value.trim();

    if (!repoUrl) {
      alert('Please enter your GitHub Repository URL first.');
      remoteUrlInput.focus();
      return;
    }

    btnVerifyGithub.disabled = true;
    btnVerifyGithub.innerHTML = `<svg class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Verifying...`;
    authFeedbackBanner.style.display = 'block';
    authFeedbackContent.innerHTML = `<span class="feedback-loading">Connecting to GitHub API...</span>`;

    try {
      const res = await fetch('/api/verify-github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl, token, authorEmail: email })
      });

      const data = await res.json();
      if (data.success) {
        let authUserHtml = '';
        if (data.authenticatedUser) {
          authUserHtml = `
            <div class="user-pill">
              <img src="${data.authenticatedUser.avatar_url}" class="user-avatar" alt="Avatar" />
              <span>Authenticated as <strong>@${data.authenticatedUser.login}</strong></span>
            </div>
          `;
        }

        const emailMatchHtml = data.emailMatched
          ? `<span class="match-badge match-yes">✅ Author email verified on GitHub</span>`
          : (email ? `<span class="match-badge match-info">ℹ️ Email: ${email}</span>` : `<span class="match-badge match-warn">⚠️ Enter Author Email to ensure heatmap turns green</span>`);

        const pushBadgeHtml = data.canPush
          ? `<span class="match-badge match-yes">🚀 Push Access: Granted</span>`
          : `<span class="match-badge match-warn">⚠️ Read-only or Public access (Add Token for Push)</span>`;

        authFeedbackContent.innerHTML = `
          <div class="feedback-success-row">
            <div class="feedback-title">
              <span>✅ Repository Found: <strong>${data.full_name}</strong> (${data.isPrivate ? 'Private' : 'Public'})</span>
            </div>
            <div class="feedback-badges">
              ${authUserHtml}
              ${pushBadgeHtml}
              ${emailMatchHtml}
            </div>
          </div>
        `;

        if (data.default_branch) {
          branchInput.value = data.default_branch;
        }

        logToTerminal(`✅ GitHub connection verified: ${data.full_name} [${data.default_branch}]`, 'success');
      } else {
        authFeedbackContent.innerHTML = `
          <div class="feedback-error-row">
            <span>❌ Verification Failed: ${data.error}</span>
          </div>
        `;
        logToTerminal(`❌ GitHub verification failed: ${data.error}`, 'error');
      }
    } catch (err) {
      authFeedbackContent.innerHTML = `<div class="feedback-error-row"><span>❌ Network error: ${err.message}</span></div>`;
      logToTerminal(`Verification error: ${err.message}`, 'error');
    } finally {
      btnVerifyGithub.disabled = false;
      btnVerifyGithub.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Verify Connection`;
    }
  });

  // 3. Heatmap Simulator Engine (52 Weeks x 7 Days Grid)
  function initHeatmapGrid() {
    heatmapGrid.innerHTML = '';
    heatmapMonths.innerHTML = '';
    state.heatmapData.clear();

    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - (52 * 7 - 1));

    // Align startDate to Sunday or Monday
    const dayOfWeek = startDate.getDay();
    startDate.setDate(startDate.getDate() - dayOfWeek);

    const monthsSet = new Set();
    const monthLabels = [];

    let cur = new Date(startDate);
    let colIndex = 0;

    while (cur <= endDate || heatmapGrid.children.length < 52 * 7) {
      const dateISO = formatDateISO(cur);
      const mName = cur.toLocaleString('default', { month: 'short' });

      const inActiveRange = isInSelectedRange(cur);
      const count = inActiveRange ? state.commitsPerDay : 0;
      const level = getLevelForCount(count);

      state.heatmapData.set(dateISO, {
        date: new Date(cur),
        dateISO,
        count,
        level
      });

      const cell = document.createElement('div');
      cell.className = `heatmap-cell level-${level}`;
      cell.dataset.date = dateISO;
      cell.dataset.count = count;

      // Click to toggle/paint cell
      cell.addEventListener('click', () => {
        const curCount = parseInt(cell.dataset.count, 10);
        const newCount = curCount > 0 ? 0 : state.commitsPerDay;
        const newLevel = getLevelForCount(newCount);
        cell.className = `heatmap-cell level-${newLevel}`;
        cell.dataset.count = newCount;
        state.heatmapData.set(dateISO, {
          date: new Date(dateISO),
          dateISO,
          count: newCount,
          level: newLevel
        });
        updateStats();
        hoveredCellInfo.textContent = `${newCount} commits on ${dateISO}`;
      });

      // Hover info
      cell.addEventListener('mouseenter', () => {
        const currentCount = cell.dataset.count;
        hoveredCellInfo.textContent = `${currentCount} commits on ${dateISO} (${cur.toLocaleDateString('en-US', { weekday: 'short' })})`;
      });

      heatmapGrid.appendChild(cell);

      // Track months for headers
      if (cur.getDay() === 0) {
        colIndex++;
        if (!monthsSet.has(mName) && cur.getDate() <= 7) {
          monthsSet.add(mName);
          monthLabels.push({ name: mName, col: colIndex });
        }
      }

      cur.setDate(cur.getDate() + 1);
    }

    renderMonthHeaders(monthLabels);
    updateStats();
  }

  function renderMonthHeaders(labels) {
    heatmapMonths.innerHTML = '';
    const totalCols = 52;
    for (let c = 0; c < totalCols; c++) {
      const span = document.createElement('span');
      const match = labels.find(l => l.col === c + 1);
      if (match) {
        span.textContent = match.name;
      }
      heatmapMonths.appendChild(span);
    }
  }

  function getLevelForCount(count) {
    if (count <= 0) return 0;
    if (count <= 3) return 1;
    if (count <= 6) return 2;
    if (count <= 9) return 3;
    return 4; // 10+ commits is max dark emerald glow
  }

  function isInSelectedRange(date) {
    const s = new Date(startDateInput.value);
    const e = new Date(endDateInput.value);
    s.setHours(0, 0, 0, 0);
    e.setHours(23, 59, 59, 999);
    return date >= s && date <= e;
  }

  function updateHeatmapFromRange() {
    const s = new Date(startDateInput.value);
    const e = new Date(endDateInput.value);
    s.setHours(0, 0, 0, 0);
    e.setHours(23, 59, 59, 999);

    const cells = heatmapGrid.querySelectorAll('.heatmap-cell');
    cells.forEach(cell => {
      const d = new Date(cell.dataset.date);
      const isWeekend = (d.getDay() === 0 || d.getDay() === 6);
      const shouldSkip = state.skipWeekends && isWeekend;

      let count = 0;
      if (d >= s && d <= e && !shouldSkip) {
        if (state.variation > 0) {
          const delta = Math.floor(Math.random() * (state.variation * 2 + 1)) - state.variation;
          count = Math.max(1, state.commitsPerDay + delta);
        } else {
          count = state.commitsPerDay;
        }
      }

      const level = getLevelForCount(count);
      cell.className = `heatmap-cell level-${level}`;
      cell.dataset.count = count;

      state.heatmapData.set(cell.dataset.date, {
        date: d,
        dateISO: cell.dataset.date,
        count,
        level
      });
    });

    updateStats();
  }

  function updateStats() {
    let totalCommits = 0;
    let activeDays = 0;

    state.heatmapData.forEach(item => {
      if (item.count > 0) {
        totalCommits += item.count;
        activeDays++;
      }
    });

    statDailyTarget.textContent = state.commitsPerDay;
    statSimulatedCommits.textContent = totalCommits;
    statDaysRange.textContent = `${activeDays} Active Days`;
  }

  // 4. Presets Handlers
  document.getElementById('preset30Days').addEventListener('click', (e) => {
    setActivePreset(e.target);
    setDaysOffset(30);
  });
  document.getElementById('preset90Days').addEventListener('click', (e) => {
    setActivePreset(e.target);
    setDaysOffset(90);
  });
  document.getElementById('preset180Days').addEventListener('click', (e) => {
    setActivePreset(e.target);
    setDaysOffset(180);
  });
  document.getElementById('preset1Year').addEventListener('click', (e) => {
    setActivePreset(e.target);
    setDaysOffset(365);
  });
  document.getElementById('preset2Years').addEventListener('click', (e) => {
    setActivePreset(e.target);
    setDaysOffset(730);
  });
  document.getElementById('presetNatural').addEventListener('click', (e) => {
    setActivePreset(e.target);
    state.variation = 4;
    variationSelect.value = "4";
    setDaysOffset(90);
  });
  document.getElementById('presetClear').addEventListener('click', (e) => {
    setActivePreset(e.target);
    const cells = heatmapGrid.querySelectorAll('.heatmap-cell');
    cells.forEach(cell => {
      cell.className = 'heatmap-cell level-0';
      cell.dataset.count = 0;
    });
    updateStats();
  });

  function setActivePreset(button) {
    document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
    button.classList.add('active');
  }

  function setDaysOffset(days) {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - (days - 1));

    startDateInput.value = formatDateISO(start);
    endDateInput.value = formatDateISO(end);
    updateHeatmapFromRange();
  }

  // Quick Date Buttons
  document.querySelectorAll('.btn-quick-date').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-quick-date').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      if (btn.dataset.year) {
        const year = parseInt(btn.dataset.year, 10);
        startDateInput.value = `${year}-01-01`;
        const endMonth = (year === today.getFullYear()) ? today : new Date(year, 11, 31);
        endDateInput.value = formatDateISO(endMonth);
        updateHeatmapFromRange();
      } else if (btn.dataset.days) {
        const days = parseInt(btn.dataset.days, 10);
        setDaysOffset(days);
      }
    });
  });

  // Slider & Quick Count Buttons
  commitCountSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    setCommitCount(val);
  });

  document.querySelectorAll('.btn-slider-quick').forEach(btn => {
    btn.addEventListener('click', () => {
      const count = parseInt(btn.dataset.count, 10);
      commitCountSlider.value = count;
      setCommitCount(count);
    });
  });

  function setCommitCount(val) {
    state.commitsPerDay = val;
    sliderValue.textContent = `${val} commits/day`;
    document.querySelectorAll('.btn-slider-quick').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.count, 10) === val);
    });
    updateHeatmapFromRange();
  }

  variationSelect.addEventListener('change', (e) => {
    state.variation = parseInt(e.target.value, 10);
    updateHeatmapFromRange();
  });

  skipWeekendsCheckbox.addEventListener('change', (e) => {
    state.skipWeekends = e.target.checked;
    updateHeatmapFromRange();
  });

  startDateInput.addEventListener('change', updateHeatmapFromRange);
  endDateInput.addEventListener('change', updateHeatmapFromRange);

  // Tabs Navigation
  mainTabs.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('.tab-btn');
    if (!tabBtn) return;

    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    tabBtn.classList.add('active');
    const targetId = tabBtn.dataset.tab;
    const targetEl = document.getElementById(targetId);
    if (targetEl) targetEl.classList.add('active');
  });

  // 5. Generate & Push Commits (Streaming Execution)
  btnGenerateNow.addEventListener('click', async () => {
    if (state.isGenerating) return;

    const authorEmail = authorEmailInput.value.trim();
    const authorName = authorNameInput.value.trim() || 'Developer';
    const repoUrl = remoteUrlInput.value.trim();
    const token = githubTokenInput.value.trim();
    const branch = branchInput.value.trim() || 'main';

    if (!authorEmail) {
      alert('Please enter your Git Author Email! (It must match your GitHub account so contributions turn green)');
      authorEmailInput.focus();
      return;
    }

    if (!repoUrl) {
      alert('Please enter your GitHub Repository URL!');
      remoteUrlInput.focus();
      return;
    }

    state.isGenerating = true;
    btnGenerateNow.disabled = true;
    btnGenerateNow.innerHTML = `
      <svg class="spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
      <span>Generating & Pushing Commits...</span>
    `;

    progressWrapper.style.display = 'block';
    progressBarFill.style.width = '0%';
    progressPercent.textContent = '0%';
    progressStatus.textContent = 'Preparing commits...';
    pushSuccessCard.style.display = 'none';

    logToTerminal(`▶ Starting commit generator for ${startDateInput.value} to ${endDateInput.value}...`, 'info');

    const queryParams = new URLSearchParams({
      startDate: startDateInput.value,
      endDate: endDateInput.value,
      count: state.commitsPerDay,
      variation: state.variation,
      skipWeekends: state.skipWeekends,
      messageStyle: messageStyleSelect.value,
      authorName: authorName,
      authorEmail: authorEmail,
      repoUrl: repoUrl,
      token: token,
      branch: branch,
      push: autoPushCheckbox.checked
    });

    const eventSource = new EventSource(`/api/stream-commits?${queryParams.toString()}`);

    eventSource.addEventListener('log', (e) => {
      const data = JSON.parse(e.data);
      logToTerminal(data.text, data.type);
    });

    eventSource.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      progressBarFill.style.width = `${data.percent}%`;
      progressPercent.textContent = `${data.percent}%`;
      progressStatus.textContent = `Created ${data.totalCommits} commits (${data.currentDate})`;
    });

    eventSource.addEventListener('complete', (e) => {
      const data = JSON.parse(e.data);
      state.lastGeneratedCount = data.totalCommits || state.commitsPerDay;
      logToTerminal(`🎉 FINISHED: Created ${data.totalCommits} commits across ${data.daysCount} days!`, 'success');

      if (data.pushSuccess && data.owner) {
        pushSuccessCard.style.display = 'flex';
        btnViewProfile.href = `https://github.com/${data.owner}`;
        btnViewProfile.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          View Green Heatmap on GitHub (@${data.owner}) ↗
        `;
      }

      finishGeneration();
      eventSource.close();
      fetchGitInfo();
    });

    eventSource.addEventListener('error', (e) => {
      try {
        const data = JSON.parse(e.data);
        logToTerminal(`❌ Error: ${data.message}`, 'error');
      } catch {
        logToTerminal(`Generation complete.`, 'info');
      }
      finishGeneration();
      eventSource.close();
      fetchGitInfo();
    });
  });

  function finishGeneration() {
    state.isGenerating = false;
    btnGenerateNow.disabled = false;
    btnGenerateNow.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
      <span>Generate & Push to GitHub (Increase Heatmap)</span>
    `;
  }

  // 6. Remove / Rollback Fake Commits Logic
  let selectedRemoveCount = 'batch';

  btnRemoveCommits.addEventListener('click', () => {
    const repoUrl = remoteUrlInput.value.trim() || 'No repository selected';
    const branch = branchInput.value.trim() || 'main';
    const suggestedBatch = state.lastGeneratedCount || parseInt(statSimulatedCommits.textContent, 10) || 10;

    modalRepoTarget.textContent = repoUrl;
    modalBranchLabel.textContent = branch;
    modalBatchCount.textContent = suggestedBatch;
    removeCustomCount.value = suggestedBatch;

    selectedRemoveCount = 'batch';
    document.querySelectorAll('.btn-remove-preset').forEach(b => {
      b.classList.toggle('active', b.dataset.count === 'batch');
    });
    customRemoveGroup.style.display = 'none';
    removeModal.style.display = 'flex';
  });

  function closeRemoveModal() {
    removeModal.style.display = 'none';
  }

  btnCloseRemoveModal.addEventListener('click', closeRemoveModal);
  btnCancelRemoveModal.addEventListener('click', closeRemoveModal);
  removeModal.addEventListener('click', (e) => {
    if (e.target === removeModal) closeRemoveModal();
  });

  document.querySelectorAll('.btn-remove-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-remove-preset').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const countVal = btn.dataset.count;
      selectedRemoveCount = countVal;
      if (countVal === 'custom') {
        customRemoveGroup.style.display = 'block';
        removeCustomCount.focus();
      } else {
        customRemoveGroup.style.display = 'none';
      }
    });
  });

  btnConfirmRemoveCommits.addEventListener('click', async () => {
    const repoUrl = remoteUrlInput.value.trim();
    const token = githubTokenInput.value.trim();
    const branch = branchInput.value.trim() || 'main';
    const cleanActivity = cleanActivityLogCheckbox.checked;

    if (!repoUrl) {
      alert('Please configure your GitHub Repository URL in Step 1!');
      closeRemoveModal();
      remoteUrlInput.focus();
      return;
    }

    if (!token) {
      alert('GitHub Personal Access Token is required to rollback commits from GitHub!');
      closeRemoveModal();
      githubTokenInput.focus();
      return;
    }

    let removeCount = 10;
    if (selectedRemoveCount === 'batch') {
      removeCount = state.lastGeneratedCount || parseInt(statSimulatedCommits.textContent, 10) || 10;
    } else if (selectedRemoveCount === 'custom') {
      removeCount = parseInt(removeCustomCount.value, 10) || 10;
    } else {
      removeCount = parseInt(selectedRemoveCount, 10) || 10;
    }

    closeRemoveModal();

    if (state.isGenerating) return;
    state.isGenerating = true;
    btnRemoveCommits.disabled = true;
    btnGenerateNow.disabled = true;
    btnRemoveCommits.innerHTML = `<svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> <span>Removing...</span>`;

    progressWrapper.style.display = 'block';
    progressBarFill.style.width = '30%';
    progressPercent.textContent = '30%';
    progressStatus.textContent = `Rolling back latest ${removeCount} commits from GitHub...`;
    pushSuccessCard.style.display = 'none';

    logToTerminal(`▶ Starting rollback engine: Removing latest ${removeCount} commits from [${branch}]...`, 'warning');

    const queryParams = new URLSearchParams({
      repoUrl: repoUrl,
      token: token,
      branch: branch,
      count: removeCount,
      cleanActivityLog: cleanActivity
    });

    const eventSource = new EventSource(`/api/stream-remove-commits?${queryParams.toString()}`);

    eventSource.addEventListener('log', (e) => {
      const data = JSON.parse(e.data);
      logToTerminal(data.text, data.type);
    });

    eventSource.addEventListener('complete', (e) => {
      const data = JSON.parse(e.data);
      progressBarFill.style.width = '100%';
      progressPercent.textContent = '100%';
      progressStatus.textContent = 'Rollback complete!';
      logToTerminal(`🎉 Success: Removed ${data.removedCount} commits from GitHub!`, 'success');

      finishRemoval();
      eventSource.close();
      fetchGitInfo();
    });

    eventSource.addEventListener('error', (e) => {
      try {
        const data = JSON.parse(e.data);
        logToTerminal(`❌ Error: ${data.message}`, 'error');
      } catch {
        logToTerminal(`Rollback process finished.`, 'info');
      }
      finishRemoval();
      eventSource.close();
      fetchGitInfo();
    });
  });

  function finishRemoval() {
    state.isGenerating = false;
    btnRemoveCommits.disabled = false;
    btnGenerateNow.disabled = false;
    btnRemoveCommits.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
      <span>Remove Latest Commits</span>
    `;
  }

  // 6. Manual Push to GitHub Remote
  btnPushRemote.addEventListener('click', async () => {
    btnPushRemote.disabled = true;
    btnPushRemote.innerHTML = `<svg class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Pushing...`;
    logToTerminal(`Pushing commits to remote GitHub repository...`, 'info');

    const repoUrl = remoteUrlInput.value.trim();
    const token = githubTokenInput.value.trim();
    const branch = branchInput.value.trim() || 'main';

    try {
      const res = await fetch('/api/git-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl, token, branch })
      });
      const data = await res.json();
      if (data.success) {
        logToTerminal(`✅ Successfully pushed commits to GitHub (${branch})!`, 'success');
        if (data.owner) {
          pushSuccessCard.style.display = 'flex';
          btnViewProfile.href = `https://github.com/${data.owner}`;
          logToTerminal(`🌟 View your updated profile: https://github.com/${data.owner}`, 'highlight');
        }
        fetchGitInfo();
      } else {
        logToTerminal(`❌ Push error: ${data.error || data.stderr}`, 'error');
        if ((data.error || '').includes('Username') || (data.error || '').includes('No such device')) {
          logToTerminal(`💡 Please provide your GitHub Personal Access Token in Step 1.`, 'warning');
        }
      }
    } catch (err) {
      logToTerminal(`Push error: ${err.message}`, 'error');
    } finally {
      btnPushRemote.disabled = false;
      btnPushRemote.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
        Manual Push Existing Commits to GitHub Remote
      `;
    }
  });

  // 7. Copy CLI command
  btnCopyCommand.addEventListener('click', () => {
    const cmd = `node scripts/backfill.js --start ${startDateInput.value} --end ${endDateInput.value} --count ${state.commitsPerDay} --variation ${state.variation} ${state.skipWeekends ? '--skip-weekends ' : ''}--author-email "${authorEmailInput.value || 'your@email.com'}" --push`;
    navigator.clipboard.writeText(cmd);
    btnCopyCommand.innerHTML = '<span>✓ Copied to Clipboard!</span>';
    setTimeout(() => {
      btnCopyCommand.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <span>Copy CLI Command</span>
      `;
    }, 2000);
  });

  // 8. Copy Workflow YAML
  btnCopyWorkflow.addEventListener('click', () => {
    const code = document.getElementById('workflowCodeBlock').textContent;
    navigator.clipboard.writeText(code);
    btnCopyWorkflow.textContent = '✓ Workflow YAML Copied!';
    setTimeout(() => {
      btnCopyWorkflow.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        Copy Workflow YAML
      `;
    }, 2000);
  });

  // Terminal Helpers
  function logToTerminal(text, type = 'info') {
    const line = document.createElement('div');
    line.className = `terminal-line ${type}`;
    line.innerHTML = `<span class="prompt">$</span> ${escapeHtml(text)}`;
    terminalScreen.appendChild(line);
    terminalScreen.scrollTop = terminalScreen.scrollHeight;
  }

  btnClearTerminal.addEventListener('click', () => {
    terminalScreen.innerHTML = '<div class="terminal-line info"><span class="prompt">$</span> Console cleared.</div>';
  });

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function formatDateISO(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Initialize
  initHeatmapGrid();
  updateHeatmapFromRange();
  fetchGitInfo();
});
