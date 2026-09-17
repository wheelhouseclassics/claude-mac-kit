'use strict';
// The curated contract: what from the build machine's ~/.claude ships in the kit, what is dropped, and why.
// scripts/build-manifest.js reads this; manifest.json is the generated output. Decisions trace to PLAN.md
// "Manifest curation decided in this stage".

const VAULT_PREFIX = /C:\\Users\\OpenClaw\\Projects\\second-brain((?:\\[^\s`'"*)]+)*)/g;

// Text rewrites applied to MIRRORED items at copy time (never to ported items).
const rewrites = {
  vault: [
    (s) => s.replace(VAULT_PREFIX, (_, rest) => '~/second-brain' + (rest || '').split('\\').join('/')),
    (s) => s.replace(/\(`OpenClaw`\)/g, '(the home folder)'),
  ],
  pipeline: [
    (s) => s.replace(/C:\\Users\\OpenClaw\\\.claude\\pipeline/g, '~/.claude/pipeline'),
    (s) => s.replace(/C:\\Users\\OpenClaw\\projects\\/gi, '~/projects/'),
    (s) => s.replace(/C:\\Users\\OpenClaw\\\.claude\\/g, '~/.claude/'),
    // any remaining backslash between two path characters is a separator; so is a trailing one before a closing backtick
    (s) => { let prev; do { prev = s; s = s.replace(/([A-Za-z0-9_.*<>)-])\\([A-Za-z0-9_.*<>(-])/g, '$1/$2'); } while (s !== prev); return s; },
    (s) => s.replace(/([A-Za-z0-9_.*<>)-])\\(?=`)/g, '$1/'),
  ],
};

module.exports = {
  rewrites,

  skills: {
    // exactly the ten mirrored skills (learned/ is an empty directory on the source machine — dropped)
    keep: ['thought-note', 'decision-note', 'handoff', 'graphify', 'obsidian-markdown', 'defuddle', 'mcp-doctor', 'vet-install', 'ui-ux-pro-max', 'claude-watch'],
    // hand-ported under kit/skills/<name>/ — the builder never overwrites these; it records the source hash to flag drift
    ported: {
      graphify: '37 powershell fences → bash; pip via the kit venv',
      'mcp-doctor': 'macOS Desktop/Code config paths; desktop-chart MCP references removed',
      'vet-install': 'POSIX cd; installs under ~/projects',
      'ui-ux-pro-max': 'one powershell fence → bash; __pycache__ excluded',
      'claude-watch': 'brew whisper-cli on PATH instead of a Windows binary',
    },
    rewriteSet: { 'thought-note': 'vault', 'decision-note': 'vault', handoff: 'vault' },
  },

  commands: {
    keep: ['project'],
    ported: {},
    rewriteSet: { project: 'pipeline' },
  },

  hooks: {
    keep: [
      {
        name: 'auto-md',
        file: 'auto-md.py',
        event: 'UserPromptSubmit',
        install: '~/.claude/hooks/auto-md.py',
        command: '~/.claude-kit/venv/bin/python ~/.claude/hooks/auto-md.py',
        timeout: 60,
        statusMessage: 'Converting attached file to Markdown...',
        note: 'Ported: AUTO_MD_OUT_DIR override (default ~/md-converted), POSIX path regex, kit venv interpreter (markitdown[all]).',
      },
    ],
    ported: { 'auto-md': 'AUTO_MD_OUT_DIR + POSIX regex + venv interpreter' },
  },

  pipeline: {
    stages: ['1-idea.md', '2-brainstorm.md', '3-deep-review.md', '4-promote.md', '5-execute.md', '6-human-review.md', 'audit.md'],
    templates: ['idea.md', 'PLAN.md', 'PROGRESS.md', 'proposed-plan.md'],
    rewriteSet: 'pipeline',
    registrySeed: {
      version: 1,
      airtable: { baseId: null, projects: null, phases: null, events: null, fieldIds: { Projects: {}, Phases: {}, Events: {} } },
      outbox: [],
      projects: {},
    },
  },

  plugins: {
    // exactly the source machine's enabledPlugins:true set — the builder fails if settings.json disagrees
    keep: [
      'everything-claude-code@everything-claude-code',
      'claude-mem@thedotmack',
      'telegram@claude-plugins-official',
      'playwright@claude-plugins-official',
      'posthog@claude-plugins-official',
      'chrome-devtools-mcp@claude-plugins-official',
      'playground@claude-plugins-official',
      'frontend-design@claude-plugins-official',
      'superpowers@claude-plugins-official',
      'skill-creator@claude-plugins-official',
      'github@claude-plugins-official',
      'supabase@claude-plugins-official',
      'watch@claude-video',
      'claude-seo@agricidaniel-claude-seo',
    ],
    runtime: { 'claude-mem@thedotmack': 'bun', 'telegram@claude-plugins-official': 'bun' },
    notes: {
      'claude-mem@thedotmack': 'Setup hook runs `bun install --production` at first session, not at install time.',
      'telegram@claude-plugins-official': 'Server reads only ~/.claude/channels/telegram/.env (token duplicated there by claude-kit setup, mode 600).',
    },
  },

  marketplaces: {
    // auto-registered only on the first INTERACTIVE launch, so the kit adds it explicitly
    alwaysInclude: ['claude-plugins-official'],
  },

  mcp: {
    keep: ['composio'],
    scope: 'user',
  },

  connectors: [
    { name: 'Airtable', required: true, reason: 'commands/project.md writes through the Airtable connector tools', surfaces: ['code', 'desktop'] },
    { name: 'MarketCheck', required: true, reason: 'VIN decode and market data in Code and Desktop', surfaces: ['code', 'desktop'] },
    { name: 'Gmail', required: true, reason: 'email triage and drafting', surfaces: ['code', 'desktop'] },
    { name: 'Google Calendar', required: true, reason: 'schedule lookups', surfaces: ['code', 'desktop'] },
    { name: 'Google Drive', required: true, reason: 'documents and spreadsheets', surfaces: ['code', 'desktop'] },
    { name: 'Slack', required: false, reason: 'account-level connector; visible in Desktop AND Code (master default D11)', surfaces: ['code', 'desktop'] },
  ],

  deps: [
    { name: 'graphifyy', kind: 'pip', package: 'graphifyy', for: 'graphify' },
    { name: 'defuddle', kind: 'npm', package: 'defuddle', for: 'defuddle' },
    { name: 'markitdown[all]', kind: 'pip', package: 'markitdown[all]', for: 'auto-md hook' },
    { name: 'whisper.cpp', kind: 'brew', package: 'whisper-cpp', for: 'claude-watch', extra: true },
    { name: 'ffmpeg', kind: 'brew', package: 'ffmpeg', for: 'claude-watch', extra: true },
    { name: 'bun', kind: 'brew', package: 'oven-sh/bun/bun', for: 'claude-mem, telegram' },
    { name: 'python@3.12', kind: 'brew', package: 'python@3.12', for: 'ui-ux-pro-max, auto-md, graphify (kit venv)' },
  ],

  brew: {
    formulae: ['node@24', 'git', 'gh', 'gitleaks', 'oven-sh/bun/bun', 'python@3.12', 'tmux', 'tailscale'],
    casks: ['claude', 'obsidian'],
    extras: { formulae: ['whisper-cpp', 'ffmpeg'], casks: [] },
  },

  vault: {
    root: '~/second-brain',
    sourceRelHome: 'Projects/second-brain',
    folders: ['raw-sources/Thoughts', 'raw-sources/Decisions', 'raw-sources/Handoffs', 'raw-sources/Sessions', 'raw-sources/Projects', 'wiki', 'scripts', '.obsidian'],
    // copied from the source vault (with vault rewrites for .md)
    mirror: ['CLAUDE.md', '.obsidian/app.json', '.obsidian/appearance.json', '.obsidian/core-plugins.json'],
    // written by hand under kit/vault/ — the builder only checks they exist
    authored: ['thought.md', 'decision.md', 'handoff.md', 'wiki/log.md'],
  },

  deny: [
    { name: 'firecrawl-*', kind: 'skill', reason: '31 skills that need a Firecrawl account' },
    { name: 'heygen-skills', kind: 'skill', reason: 'needs a HeyGen account and a Windows-only helper binary' },
    { name: 'llm-council', kind: 'skill', reason: 'depends on a local clone of the llm-council repo' },
    { name: 'learned', kind: 'skill', reason: 'empty directory on the source machine' },
    { name: 'instagram-sync', kind: 'command', reason: 'Windows-only workflow' },
    { name: 'reopen-tabs', kind: 'command', reason: 'Windows-only helper scripts' },
    { name: 'Claude-Code-Agent-Monitor hook handler', kind: 'hook', reason: 'external project (7 hook events) not part of the kit' },
    { name: 'receptionist-factory', kind: 'agent', reason: 'private agent definition', path: '.claude/agents/receptionist-factory.md' },
    { name: 'signal-watcher', kind: 'agent', reason: 'private trading-signal agent', path: '.claude/agents/signal-watcher.md' },
    { name: 'crosstrade_mcp.py', kind: 'mcp-server', reason: 'private broker bridge', path: '.claude/mcp-servers/crosstrade_mcp.py' },
    { name: 'voltagent-*', kind: 'plugin', reason: 'four subagent packs, already disabled on the source machine' },
    { name: 'TV-chart MCP servers', kind: 'mcp', reason: 'two desktop-chart automation servers, Windows-only' },
    { name: 'n8n-mcp', kind: 'mcp', reason: 'local workflow server not part of the kit' },
    { name: 'heygen', kind: 'mcp', reason: 'needs a HeyGen account' },
    { name: 'crosstrade-local', kind: 'mcp', reason: 'private broker bridge' },
    { name: 'skipDangerousModePermissionPrompt', kind: 'settings', reason: 'unsafe default for a new user' },
    { name: 'enabledMcpjsonServers', kind: 'settings', reason: 'names dropped MCP servers' },
    { name: 'env (PYTHONIOENCODING/PYTHONUTF8)', kind: 'settings', reason: 'Windows console encoding workaround' },
    { name: 'model/effortLevel/voice/remoteControlAtStartup', kind: 'settings', reason: 'personal preferences, not kit defaults' },
    { name: 'permissions.allow entries for dropped MCPs and Windows commands', kind: 'settings', reason: 'task-scheduler, process-list and curl-alias entries have no macOS meaning' },
    { name: 'scripts/*.ps1', kind: 'vault', reason: 'Windows automation scripts' },
    { name: '*-cron.log', kind: 'vault', reason: 'run logs' },
    { name: 'raw-sources/AM-Review, raw-sources/Claude Export, raw-sources/Claude Data Export', kind: 'vault', reason: 'personal content and exports' },
    { name: 'graphify-out/', kind: 'vault', reason: 'generated graphs' },
    { name: '.obsidian/workspace.json, .obsidian/graph.json', kind: 'vault', reason: 'per-machine window state' },
  ],

  // Hard copy-deny: the builder never reads these (relative to ~/.claude unless absolute-looking)
  copyDeny: ['credentials/', 'channels/', '.credentials.json', '.claude.json', 'history.jsonl', '*.log', 'sessions/', 'projects/', 'file-history/', 'backups/', '__pycache__/', '*.pyc', 'todos/', 'shell-snapshots/', 'debug/'],

  settingsDeny: ['skipDangerousModePermissionPrompt', 'enabledMcpjsonServers', 'env', 'model', 'effortLevel', 'voice', 'remoteControlAtStartup', 'fastMode', 'tui', 'theme', 'agentPushNotifEnabled', 'voiceEnabled', 'autoUpdatesChannel'],
};
