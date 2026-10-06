# ⚡ CommitFlow - GitHub Contribution Booster & 10 Commits/Day Automation

A professional, high-performance toolkit designed to automate, boost, and backfill your GitHub contribution graph with 10 commits every day.

---

## 🌟 Key Features

1. **☁️ 24/7 Cloud Automation (GitHub Actions)**:
   - Zero maintenance: Runs automatically every day in GitHub's cloud for free.
   - Pushes 10 realistic commits per day without needing your computer on.
2. **📅 Historical Backfill Engine (`scripts/backfill.js`)**:
   - Turn past days, months, or the whole year completely green.
   - Generates 10 realistic engineering commits per day with natural time distributions (09:00 - 21:00).
3. **🖥️ Interactive Web Control Center**:
   - Visual 52-week 365-day contribution heatmap preview simulator.
   - Real-time streaming commit creation terminal with progress bar.
   - 1-click execution and custom date picker.
4. **⏰ Windows Task Scheduler Support**:
   - Automated local execution every evening via PowerShell.

---

## 🚀 Quick Start

### Option 1: Using the Web Dashboard (Recommended)

1. Start the control center:
   ```bash
   npm start
   ```
2. Open **[http://localhost:3000](http://localhost:3000)** in your browser.
3. Enter your **GitHub Email Address** (must match your GitHub account).
4. Select your date range (e.g. Last 30 Days or Full Year) and commit frequency (10/day).
5. Click **"Generate 10 Commits/Day Now"** and watch the real-time execution!

---

### Option 2: 24/7 Cloud Automation (GitHub Actions)

The repository comes pre-configured with `.github/workflows/commit-flow.yml`.

1. Push this repository to your GitHub account:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   git branch -M main
   git push -u origin main
   ```
2. Enable workflow permissions:
   - On GitHub, go to your repository **Settings** &rarr; **Actions** &rarr; **General**.
   - Scroll down to **Workflow permissions**.
   - Select **"Read and write permissions"** and click **Save**.
3. That's it! GitHub Actions will now automatically generate 10 commits every day!

---

### Option 3: Terminal CLI Commands

#### Backfill the Past 30 Days (10 Commits/Day):
```bash
node scripts/backfill.js --days 30 --count 10 --variation 2
```

#### Backfill Past 1 Year (365 Days):
```bash
node scripts/backfill.js --days 365 --count 10 --variation 2
```

#### Make 10 Commits for Today:
```bash
node scripts/daily.js
```

#### Push to GitHub:
```bash
git push origin main
```

---

## 🎯 How to Ensure Your Commits Turn Green on GitHub

GitHub has 4 strict rules for counting contributions:

1. **Email Matching**: Your local git email MUST match one of the verified emails in your [GitHub Email Settings](https://github.com/settings/emails).
   - Set it locally with:
     ```bash
     git config --global user.email "your-github-email@example.com"
     git config --global user.name "Your Name"
     ```
2. **Default Branch**: Contributions are only counted on the repository's default branch (`main` or `master`).
3. **Private Contributions**: If your repository is set to private, enable private contributions on your GitHub profile:
   - Go to your GitHub profile &rarr; **Contribution settings** (dropdown on the top-right of your heatmap) &rarr; Check **"Private contributions"**.
4. **Push to Remote**: Commits must be pushed to GitHub (`git push origin main`).

---

## 📁 Repository Structure

```
commit-flow/
├── .github/
│   └── workflows/
│       └── commit-flow.yml    # GitHub Actions 24/7 cloud auto-committer
├── scripts/
│   ├── backfill.js            # Node.js historical backfill engine
│   ├── backfill.py            # Python historical backfill engine
│   ├── daily.js               # Daily 10-commit generator
│   ├── setup_scheduler.ps1    # Windows Task Scheduler automation script
│   └── setup_scheduler.bat    # Windows 1-click batch launcher
├── public/
│   ├── index.html             # Web Control Center UI
│   ├── style.css              # Modern glassmorphism dark theme
│   └── app.js                 # Interactive Heatmap & SSE logic
├── data/
│   └── activity.log           # Commits activity ledger
├── server.js                  # Backend API server & streaming runner
├── package.json
└── README.md
```
