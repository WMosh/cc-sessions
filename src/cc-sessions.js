#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const HOME = os.homedir();
const REG_DIR = path.join(HOME, '.claude', 'open-sessions');
const SNAPSHOT = path.join(HOME, '.claude', 'session-snapshot.json');
const APPLESCRIPT = path.join(HOME, '.claude', 'scripts', 'restore-tabs.applescript');

/**
 * Check whether a process with the given PID is currently alive.
 *
 * @param pid - The process ID to test.
 * @returns True if the process exists, false otherwise.
 */
function isAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

/**
 * Load live session records from the registry, pruning entries whose owner died.
 *
 * @returns An array of `{ sessionId, cwd }` for sessions still running.
 */
function collectLiveSessions() {
  let files = [];
  try { files = fs.readdirSync(REG_DIR).filter(f => f.endsWith('.json')); } catch { return []; }
  const live = [];
  for (const f of files) {
    const full = path.join(REG_DIR, f);
    let rec;
    try { rec = JSON.parse(fs.readFileSync(full, 'utf8')); } catch { continue; }
    if (rec.claudePid === null || isAlive(rec.claudePid)) {
      live.push({ sessionId: rec.sessionId, cwd: rec.cwd });
      continue;
    }
    try { fs.unlinkSync(full); } catch {}
  }
  return live;
}

/**
 * Snapshot currently-live sessions. Refuses to overwrite an existing snapshot
 * with an empty one, so a post-reboot auto-save cannot wipe the last good state.
 */
function save() {
  const sessions = collectLiveSessions();
  if (!sessions.length) {
    console.log('No live sessions — keeping existing snapshot intact.');
    return;
  }
  fs.writeFileSync(SNAPSHOT, JSON.stringify(sessions, null, 2));
  console.log(`Saved ${sessions.length} session(s) to ${SNAPSHOT}`);
  sessions.forEach(s => console.log(`  • ${s.sessionId.slice(0, 8)}  ${s.cwd}`));
}

/**
 * Wrap a value in single quotes for safe use in a POSIX shell command.
 *
 * @param value - The raw string to escape.
 * @returns The shell-safe, single-quoted representation.
 */
function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/**
 * Reopen each session from the snapshot in its own Terminal tab.
 */
function restore() {
  let sessions = [];
  try { sessions = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')); }
  catch { console.error('No snapshot found. Run `cc-sessions save` first.'); process.exit(1); }
  if (!sessions.length) { console.error('Snapshot is empty.'); process.exit(1); }
  const cmds = sessions.map(s => `cd ${shellQuote(s.cwd)} && claude --resume ${shellQuote(s.sessionId)}`);
  try {
    execFileSync('osascript', [APPLESCRIPT, ...cmds], { stdio: 'inherit' });
  } catch (e) {
    if (/keystrokes|1002/.test(e.message || '')) {
      console.error('\nTerminal needs Accessibility permission to open new tabs (it sends ⌘T).');
      console.error('Grant it: System Settings → Privacy & Security → Accessibility → enable your');
      console.error('terminal app, then run `cc-sessions restore` again.');
    } else {
      console.error(`Could not open tabs: ${e.message}`);
    }
    process.exit(1);
  }
  console.log(`Reopened ${sessions.length} session(s).`);
}

/**
 * Print the current snapshot contents.
 */
function list() {
  let sessions = [];
  try { sessions = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')); } catch { console.log('No snapshot yet.'); return; }
  console.log(`Snapshot holds ${sessions.length} session(s):`);
  sessions.forEach(s => console.log(`  • ${s.sessionId.slice(0, 8)}  ${s.cwd}`));
}

const action = process.argv[2];
if (action === 'save') save();
else if (action === 'restore') restore();
else if (action === 'list') list();
else { console.error('Usage: cc-sessions <save|restore|list>'); process.exit(1); }
