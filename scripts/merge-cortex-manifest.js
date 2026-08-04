const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CORE_PREFIX = 'src/debugger/cortex-debug-core/';
const CORE_COMMAND_PATTERN = /^cortex-debug\./;
const CORE_VIEW_PATTERN = /^(cortex-debug\.|mcu-debug\.)/;

const host = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const core = JSON.parse(fs.readFileSync(path.join(ROOT, CORE_PREFIX, 'package.json'), 'utf8'));

const prefixPath = (p) =>
  typeof p === 'string'
    ? p.replace(/^\.\//, CORE_PREFIX).replace(/^(?=images\/|syntaxes\/|dist\/|resources\/|support\/)/, CORE_PREFIX)
    : p;
const fixWhen = (w) =>
  typeof w === 'string'
    ? w.replace(/(debugType ===? )('?)cortex-debug\2/g, '$1$2vs-arduino-cortex-debug$2')
    : w;

host.contributes.commands = host.contributes.commands.filter((c) => !CORE_COMMAND_PATTERN.test(c.command));

for (const [menu, items] of Object.entries(host.contributes.menus)) {
  const kept = items.filter((i) => !CORE_COMMAND_PATTERN.test(i.command || ''));
  if (kept.length) {
    host.contributes.menus[menu] = kept;
  } else {
    delete host.contributes.menus[menu];
  }
}

for (const [container, views] of Object.entries(host.contributes.views)) {
  const kept = views.filter((v) => !CORE_VIEW_PATTERN.test(v.id));
  if (kept.length) {
    host.contributes.views[container] = kept;
  } else {
    delete host.contributes.views[container];
  }
}

if (host.contributes.viewsContainers && host.contributes.viewsContainers.panel) {
  host.contributes.viewsContainers.panel = host.contributes.viewsContainers.panel.filter(
    (v) => v.id !== 'vs-arduino-cortex-debug' && v.id !== 'rtos-views',
  );
}

const coreDebugger = core.contributes.debuggers[0];
coreDebugger.program = CORE_PREFIX + 'dist/debugadapter.js';
host.contributes.debuggers = host.contributes.debuggers.filter((d) => d.type !== coreDebugger.type);
host.contributes.debuggers.push(coreDebugger);

host.contributes.commands.push(
  ...core.contributes.commands.map((c) => {
    if (c.icon && typeof c.icon === 'object') {
      for (const k of Object.keys(c.icon)) c.icon[k] = prefixPath(c.icon[k]);
    } else if (typeof c.icon === 'string' && !c.icon.startsWith('$(')) {
      c.icon = prefixPath(c.icon);
    }
    return c;
  }),
);

host.contributes.keybindings = (core.contributes.keybindings || []).map((k) => ({ ...k, when: fixWhen(k.when) }));

const coreLanguageIds = new Set((core.contributes.languages || []).map((l) => l.id));
host.contributes.languages = [
  ...(host.contributes.languages || []).filter((l) => !coreLanguageIds.has(l.id) && !CORE_VIEW_PATTERN.test(l.id)),
  ...(core.contributes.languages || []),
];

const coreGrammarScopes = new Set((core.contributes.grammars || []).map((g) => g.scopeName));
host.contributes.grammars = [
  ...(host.contributes.grammars || []).filter(
    (g) => !coreGrammarScopes.has(g.scopeName) && !g.path.startsWith(CORE_PREFIX),
  ),
  ...(core.contributes.grammars || []).map((g) => ({ ...g, path: prefixPath(g.path) })),
];

host.contributes.breakpoints = core.contributes.breakpoints;

if (core.contributes.viewsContainers) {
  host.contributes.viewsContainers.panel = [
    ...(host.contributes.viewsContainers.panel || []),
    ...(core.contributes.viewsContainers.panel || []).map((v) => ({ ...v, icon: prefixPath(v.icon) })),
  ];
}

for (const [container, views] of Object.entries(core.contributes.views || {})) {
  const mapped = views.map((v) => ({ ...v, when: fixWhen(v.when), icon: v.icon ? prefixPath(v.icon) : v.icon }));
  host.contributes.views[container] = [...(host.contributes.views[container] || []), ...mapped];
}

for (const [menu, items] of Object.entries(core.contributes.menus || {})) {
  const mapped = items.map((i) => ({ ...i, when: fixWhen(i.when) }));
  host.contributes.menus[menu] = [...(host.contributes.menus[menu] || []), ...mapped];
}

const hostConfig = Array.isArray(host.contributes.configuration)
  ? host.contributes.configuration[0]
  : host.contributes.configuration;
const coreConfig = Array.isArray(core.contributes.configuration)
  ? core.contributes.configuration
  : [core.contributes.configuration];
const sectionTitle = (title) => {
  if (!title) return 'Cortex-Debug';
  return /^cortex-debug/i.test(title) ? title : `Cortex-Debug: ${title}`;
};
host.contributes.configuration = [hostConfig, ...coreConfig.map((section) => ({ ...section, title: sectionTitle(section.title) }))];

if (core.extensionDependencies && core.extensionDependencies.length > 0) {
  host.extensionDependencies = core.extensionDependencies;
} else {
  delete host.extensionDependencies;
}

host.activationEvents = [
  'onDebugResolve:arduino',
  'onDebugResolve:vs-arduino-cortex-debug',
  'workspaceContains:**/*.ino',
  'onStartupFinished',
];

fs.writeFileSync(path.join(ROOT, 'package.json'), JSON.stringify(host, null, 2) + '\n');
console.log('merged. debuggers:', host.contributes.debuggers.map((d) => d.type).join(', '));
console.log('extensionDependencies:', (host.extensionDependencies || []).join(', '));
console.log('commands:', host.contributes.commands.length, '| views keys:', Object.keys(host.contributes.views).join(', '));
