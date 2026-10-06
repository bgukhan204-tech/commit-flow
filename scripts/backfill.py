#!/usr/bin/env python3
"""
CommitFlow - Historical Backfill Engine (Python version)
Generates backdated commits (e.g. 10 commits/day) with realistic timestamps and messages.
"""

import os
import sys
import random
import subprocess
from datetime import datetime, timedelta

REALISTIC_MESSAGES = [
    "feat: optimize event bus telemetry and trace logging",
    "fix: prevent race condition in async buffer queue",
    "refactor: streamline data pipeline transformation logic",
    "docs: update API contract and endpoint specifications",
    "perf: reduce memory allocation in matrix computation",
    "test: add unit coverage for edge-case parser states",
    "chore: bump minor dependency patches and lockfile",
    "style: enforce consistent lint formatting across modules",
    "feat: implement adaptive caching layer for remote sync",
    "fix: handle null pointer check in payload serializer",
    "refactor: extract reusable validator utility methods",
    "docs: clarify deployment environment variable requirements",
    "perf: index query key lookup table for O(1) retrieval",
    "test: expand integration suite for webhook deliveries",
    "chore: clean up deprecated helper functions",
    "feat: add structured JSON log formatter",
    "fix: resolve timezone offset discrepancy in scheduler",
    "refactor: decouple configuration loader from runtime core",
    "docs: add visual sequence diagrams for authentication flow",
    "perf: debounce high-frequency state update dispatchers",
]

def get_git_config(key):
    try:
        return subprocess.check_output(["git", "config", key], text=True).strip()
    except Exception:
        return ""

def main():
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    os.chdir(repo_root)

    # Check git repo
    try:
        subprocess.check_call(["git", "rev-parse", "--is-inside-work-tree"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        print("[CommitFlow] Initializing git repository...")
        subprocess.check_call(["git", "init"])

    author_name = get_git_config("user.name") or "Developer"
    author_email = get_git_config("user.email") or "developer@users.noreply.github.com"

    days = 30
    commits_per_day = 10
    variation = 2
    target_file = os.path.join(repo_root, "data", "activity.log")
    os.makedirs(os.path.dirname(target_file), exist_ok=True)

    print("====================================================")
    print("  CommitFlow: GitHub Contribution Booster (Python)   ")
    print("====================================================")
    print(f"Author: {author_name} <{author_email}>")
    print(f"Generating ~{commits_per_day} commits/day for the past {days} days...")

    end_date = datetime.now()
    start_date = end_date - timedelta(days=days - 1)

    total_commits = 0
    current_date = start_date

    while current_date.date() <= end_date.date():
        delta = random.randint(-variation, variation)
        daily_count = max(1, commits_per_day + delta)
        date_str = current_date.strftime("%Y-%m-%d")

        start_hour = 9
        end_hour = 21
        total_mins = (end_hour - start_hour) * 60
        interval = total_mins // (daily_count + 1)

        for c in range(daily_count):
            commit_min_offset = (c + 1) * interval + random.randint(-10, 10)
            c_hour = start_hour + (commit_min_offset // 60)
            c_min = max(0, min(59, commit_min_offset % 60))
            c_sec = random.randint(0, 59)

            commit_dt = current_date.replace(hour=c_hour, minute=c_min, second=c_sec, microsecond=0)
            iso_str = commit_dt.isoformat()
            msg = random.choice(REALISTIC_MESSAGES)

            with open(target_file, "a", encoding="utf-8") as f:
                f.write(f"[{iso_str}] {msg} (#{c+1}/{daily_count})\n")

            env = os.environ.copy()
            env["GIT_AUTHOR_NAME"] = author_name
            env["GIT_AUTHOR_EMAIL"] = author_email
            env["GIT_AUTHOR_DATE"] = iso_str
            env["GIT_COMMITTER_NAME"] = author_name
            env["GIT_COMMITTER_EMAIL"] = author_email
            env["GIT_COMMITTER_DATE"] = iso_str

            subprocess.check_call(["git", "add", target_file], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            subprocess.check_call(["git", "commit", "--allow-empty", "-m", msg], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            total_commits += 1

        print(f"[{date_str}] Created {daily_count} commits (Total: {total_commits})")
        current_date += timedelta(days=1)

    print("----------------------------------------------------")
    print(f"✅ Success! Created {total_commits} commits.")
    print("Run `git push origin main` to push your contributions to GitHub!")

if __name__ == "__main__":
    main()
