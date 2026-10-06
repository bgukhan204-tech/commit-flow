/**
 * CommitFlow - Frontend Application Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // State
  const state = {
    gitInfo: null,
    heatmapData: new Map(), // key: 'YYYY-MM-DD', value: { date, count, level }
    selectedPreset: '30days',
    commitsPerDay: 10,
    variation: 2,
    skipWeekends: false,
    autoPush: true,
    isGenerating: false
  };

  // DOM Elements
  const gitStatusBadge = document.getElementById('gitStatusBadge');
  const gitStatusText = document.getElementById('gitStatusText');
  const statDailyTarget = document.getElementById('statDailyTarget');
  const statSimulatedCommits = document.getElementById('statSimulatedCommits');
  const statDaysRange = document.getElementById('statDaysRange');
  const statLocalTotal = document.getElementById('statLocalTotal');

  const mainTabs = document.getElementById('mainTabs');
  const heatmapGrid = document.getElementById('heatmapGrid');
  const heatmapMonths = document.getElementById('heatmapMonths');
  const hoveredCellInfo = document.getElementById('hoveredCellInfo');

  const authorNameInput = document.getElementById('authorName');
  const authorEmailInput = document.getElementById('authorEmail');
  const startDateInput = document.getElementById('startDate');
  const endDateInput = document.getElementById('endDate');
  const commitCountSlider = document.getElementById('commitCountSlider');
  const sliderValue = document.getElementById('sliderValue');
  const variationSelect = document.getElementById('variationSelect');
  const messageStyleSelect = document.getElementById('messageStyleSelect');
  const skipWeekendsCheckbox = document.getElementById('skipWeekends');
  const autoPushCheckbox = document.getElementById('autoPush');

  const btnGenerateNow = document.getElementById('btnGenerateNow');
  const btnCopyCommand = document.getElementById('btnCopyCommand');
  const btnClearTerminal = document.getElementById('btnClearTerminal');
  const terminalScreen = document.getElementById('terminalScreen');
  const progressWrapper = document.getElementById('progressWrapper');
  const progressBarFill = document.getElementById('progressBarFill');
  const progressPercent = document.getElementById('progressPercent');
  const progressStatus = document.getElementById('progressStatus');

  const remoteUrlInput = document.getElementById('remoteUrlInput');
  const btnSaveRemote = document.getElementById('btnSaveRemote');
  const btnPushRemote = document.getElementById('btnPushRemote');
  const btnCopyWorkflow = document.getElementById('btnCopyWorkflow');

  // Initialize Dates to default (Last 30 Days)
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

      if (data.userEmail) {
        authorEmailInput.value = data.userEmail;
      }
      if (data.userName) {
        authorNameInput.value = data.userName;
      }
      if (data.remoteUrl) {
        remoteUrlInput.value = data.remoteUrl;
      }

      statLocalTotal.textContent = data.commitCount || 0;
      gitStatusText.textContent = `${data.branch} • ${data.commitCount} commits`;
      logToTerminal(`Git repository connected: branch [${data.branch}], commits: ${data.commitCount}`, 'info');

      if (data.remoteUrl) {
        logToTerminal(`Remote origin: ${data.remoteUrl}`, 'info');
      } else {
        logToTerminal(`Note: No remote origin set yet. Enter your GitHub repo URL below.`, 'warning');
      }
    } catch (err) {
      gitStatusText.textContent = 'Git Local Ready';
      logToTerminal(`Running in standalone mode: ${err.message}`, 'warning');
    }
  }

  // 2. Heatmap Engine (52 Weeks x 7 Days Grid)
  function initHeatmapGrid() {
    heatmapGrid.innerHTML = '';
    heatmapMonths.innerHTML = '';
    state.heatmapData.clear();

    const endDate = new Date();
    // End on current day, figure out 52 weeks ago
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - (52 * 7 - 1));

    // Align startDate to Sunday or Monday
    const dayOfWeek = startDate.getDay(); // 0 = Sun
    startDate.setDate(startDate.getDate() - dayOfWeek);

    const monthsSet = new Set();
    const monthLabels = [];

    let cur = new Date(startDate);
    let colIndex = 0;

    while (cur <= endDate || heatmapGrid.children.length < 52 * 7) {
      const dateISO = formatDateISO(cur);
      const mName = cur.toLocaleString('default', { month: 'short' });

      // Determine level based on form date range
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
      if (cur.getDay() === 0) { // Start of week column
        colIndex++;
        if (!monthsSet.has(mName) && cur.getDate() <= 7) {
          monthsSet.add(mName);
          monthLabels.push({ name: mName, col: colIndex });
        }
      }

      cur.setDate(cur.getDate() + 1);
    }

    // Render Month Headers
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
    return 4; // 10+ commits is max dark emerald glow!
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

  // 3. Preset Handlers
  document.getElementById('preset30Days').addEventListener('click', (e) => {
    setActivePreset(e.target);
    setDaysOffset(30);
  });
  document.getElementById('preset90Days').addEventListener('click', (e) => {
    setActivePreset(e.target);
    setDaysOffset(90);
  });
  document.getElementById('preset1Year').addEventListener('click', (e) => {
    setActivePreset(e.target);
    setDaysOffset(365);
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
      const days = parseInt(btn.dataset.days, 10);
      setDaysOffset(days);
    });
  });

  // Slider change
  commitCountSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    state.commitsPerDay = val;
    sliderValue.textContent = `${val} commits/day`;
    updateHeatmapFromRange();
  });

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

  // 4. Generate Commits (Streaming Execution)
  btnGenerateNow.addEventListener('click', async () => {
    if (state.isGenerating) return;

    const authorEmail = authorEmailInput.value.trim();
    const authorName = authorNameInput.value.trim() || 'Developer';

    if (!authorEmail) {
      alert('Please enter your Git Author Email! (Matches your GitHub account to turn your graph green)');
      authorEmailInput.focus();
      return;
    }

    state.isGenerating = true;
    btnGenerateNow.disabled = true;
    btnGenerateNow.innerHTML = `
      <svg class="spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
      <span>Generating Commits...</span>
    `;

    progressWrapper.style.display = 'block';
    progressBarFill.style.width = '0%';
    progressPercent.textContent = '0%';
    progressStatus.textContent = 'Preparing commits...';

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
      progressStatus.textContent = `Generated ${data.totalCommits} commits (${data.currentDate})`;
    });

    eventSource.addEventListener('complete', (e) => {
      const data = JSON.parse(e.data);
      logToTerminal(`🎉 FINISHED: Created ${data.totalCommits} commits successfully!`, 'success');
      finishGeneration();
      eventSource.close();
      fetchGitInfo();
    });

    eventSource.addEventListener('error', (e) => {
      try {
        const data = JSON.parse(e.data);
        logToTerminal(`❌ Error: ${data.message}`, 'error');
      } catch {
        logToTerminal(`Generation ended.`, 'info');
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
      <span>Generate 10 Commits/Day Now</span>
    `;
  }

  // 5. Save Remote Origin
  btnSaveRemote.addEventListener('click', async () => {
    const url = remoteUrlInput.value.trim();
    if (!url) {
      alert('Please enter a valid GitHub repository URL.');
      return;
    }
    try {
      const res = await fetch('/api/set-remote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remoteUrl: url })
      });
      const data = await res.json();
      if (data.success) {
        logToTerminal(`✅ Remote origin set to: ${url}`, 'success');
      } else {
        logToTerminal(`❌ Failed to set remote: ${data.error}`, 'error');
      }
    } catch (err) {
      logToTerminal(`Error: ${err.message}`, 'error');
    }
  });

  // 6. Push to GitHub
  btnPushRemote.addEventListener('click', async () => {
    btnPushRemote.disabled = true;
    logToTerminal(`Pushing commits to remote GitHub...`, 'info');
    try {
      const res = await fetch('/api/git-push', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        logToTerminal(`✅ Successfully pushed commits to GitHub!`, 'success');
        fetchGitInfo();
      } else {
        logToTerminal(`❌ Push error: ${data.error || data.stderr}`, 'error');
      }
    } catch (err) {
      logToTerminal(`Push error: ${err.message}`, 'error');
    } finally {
      btnPushRemote.disabled = false;
    }
  });

  // 7. Copy CLI command
  btnCopyCommand.addEventListener('click', () => {
    const cmd = `node scripts/backfill.js --start ${startDateInput.value} --end ${endDateInput.value} --count ${state.commitsPerDay} --variation ${state.variation} ${state.skipWeekends ? '--skip-weekends ' : ''}--author-email "${authorEmailInput.value || 'your@email.com'}"`;
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
