const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');
const manifest = require('../manifest.json');
const pluginIdentity = { manifest };

// Obsidian provides its runtime inside the application, not in its npm package.
const obsidian = {
  normalizePath: (path) => path,
  TFile: class TFile {},
  Plugin: class Plugin {
    constructor(app) { this.app = app; this.commands = []; this.manifest = manifest; }
    async loadData() { return { autoDetection: false }; }
    registerEvent() {}
    addCommand(command) { this.commands.push(command); }
    addSettingTab() {}
  },
  PluginSettingTab: class PluginSettingTab {},
  Modal: class Modal {},
  AbstractInputSuggest: class AbstractInputSuggest {},
};
function loadSource(name) {
  const filename = resolve(__dirname, '../src', `${name}.ts`);
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  runInNewContext(outputText, {
    module,
    exports: module.exports,
    require: (id) => id === 'obsidian' ? obsidian : loadSource(id),
    setTimeout,
  }, { filename });
  return module.exports;
}
const { FileListAdapter } = loadSource('FileList');
const { MetaDataGenerator } = loadSource('Generator');
const flush = () => new Promise(setImmediate);

function vault({ ready = false, beforeRead = async () => {}, configDir = '.obsidian', pluginId = manifest.id } = {}) {
  let disk = 'Storage/existing.pdf\nStorage/deleted.pdf';
  const callbacks = [];
  const writes = [];
  const events = new Map();
  const app = {
    workspace: {
      onLayoutReady(callback) {
        if (ready) callback();
        else callbacks.push(callback);
      },
    },
    vault: {
      on(name, callback) { events.set(name, callback); return callback; },
      configDir,
      getFiles: () => ready ? [{ path: 'Storage/existing.pdf' }] : [],
      adapter: {
        exists: async (path) => { assert.equal(path, `${configDir}/plugins/${pluginId}/.binary-file-manager_binary-file-list.txt`); return true; },
        read: async (path) => { assert.equal(path, `${configDir}/plugins/${pluginId}/.binary-file-manager_binary-file-list.txt`); await beforeRead(); return disk; },
        write: async (path, content) => { assert.equal(path, `${configDir}/plugins/${pluginId}/.binary-file-manager_binary-file-list.txt`); writes.push(content); disk = content; },
      },
    },
  };
  return {
    app, writes, events,
    open() { ready = true; callbacks.splice(0).forEach((callback) => callback()); },
  };
}

test('loading in an already-open vault preserves existing registrations', async () => {
  const { app } = vault({ ready: true });
  const list = await new FileListAdapter(app, pluginIdentity).load();
  await flush();
  assert.equal(list.has('Storage/existing.pdf'), true);
  assert.equal(list.has('Storage/deleted.pdf'), false);
});

test('registry storage follows the plugin ID and vault configuration directory', async () => {
  const mock = vault({ configDir: 'CustomConfig', pluginId: 'another-local-id' });
  const list = await new FileListAdapter(mock.app, { manifest: { id: 'another-local-id' } }).load();
  list.add('Storage/new.pdf');
  await list.save();
  assert.equal(list.has('Storage/existing.pdf'), true);
  assert.equal(mock.writes.length, 1);
});

test('layout readiness during a delayed read cannot erase the saved registry', async () => {
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const mock = vault({ beforeRead: () => blocked });
  const loading = new FileListAdapter(mock.app, pluginIdentity).load();
  await flush();
  mock.open();
  release();
  const list = await loading;
  await flush();
  assert.equal(list.has('Storage/existing.pdf'), true);
  assert.equal(list.has('Storage/deleted.pdf'), false);
});

test('cleanup waits for file discovery and removes only absent paths', async () => {
  const mock = vault();
  const list = await new FileListAdapter(mock.app, pluginIdentity).load();
  assert.equal(mock.writes.length, 0);
  assert.equal(list.has('Storage/deleted.pdf'), true);
  mock.open();
  await flush();
  assert.equal(list.has('Storage/existing.pdf'), true);
  assert.equal(list.has('Storage/deleted.pdf'), false);
  assert.deepEqual(mock.writes, ['Storage/existing.pdf']);
});

test('a failed registry read must not overwrite the saved state', async () => {
  const mock = vault({ ready: true, beforeRead: async () => { throw new Error('read failed'); } });
  await assert.rejects(new FileListAdapter(mock.app, pluginIdentity).load(), /read failed/);
  await flush();
  assert.equal(mock.writes.length, 0);
});

test('detection skips a registered binary but accepts a new binary after startup', async () => {
  const mock = vault({ ready: true });
  const list = await new FileListAdapter(mock.app, pluginIdentity).load();
  const generator = new MetaDataGenerator(mock.app, {
    fileListAdapter: list,
    fileExtensionManager: { getExtensionMatchedBest: () => 'pdf' },
  });
  const existing = Object.assign(new obsidian.TFile(), { path: 'Storage/existing.pdf', name: 'existing.pdf' });
  const added = Object.assign(new obsidian.TFile(), { path: 'Storage/new.pdf', name: 'new.pdf' });
  assert.equal(await generator.shouldCreateMetaDataFile(existing), false);
  assert.equal(await generator.shouldCreateMetaDataFile(added), true);
});

test('renaming a registered binary replaces its path and survives registry reload', async () => {
  const mock = vault();
  const list = await new FileListAdapter(mock.app, pluginIdentity).load();
  assert.equal(list.rename('Storage/existing.pdf', 'Archive/corrected.pdf'), true);
  await list.save();
  const reloaded = await new FileListAdapter(mock.app, pluginIdentity).load();
  assert.equal(reloaded.has('Storage/existing.pdf'), false);
  assert.equal(reloaded.has('Archive/corrected.pdf'), true);
  assert.equal(reloaded.has('Storage/deleted.pdf'), true);
});

test('renaming a folder updates registered descendants with a path boundary', async () => {
  const mock = vault();
  const list = await new FileListAdapter(mock.app, pluginIdentity).load();
  list.add('Storage/nested/image.png');
  list.add('Storage-extra/other.pdf');
  list.add('Unrelated/keep.pdf');
  assert.equal(list.rename('Storage', 'Archive/Storage'), true);
  assert.equal(list.has('Archive/Storage/existing.pdf'), true);
  assert.equal(list.has('Archive/Storage/deleted.pdf'), true);
  assert.equal(list.has('Archive/Storage/nested/image.png'), true);
  assert.equal(list.has('Storage/existing.pdf'), false);
  assert.equal(list.has('Storage/nested/image.png'), false);
  assert.equal(list.has('Storage-extra/other.pdf'), true);
  assert.equal(list.has('Unrelated/keep.pdf'), true);
});

test('renaming an unregistered file or keeping the same path changes nothing', async () => {
  const mock = vault();
  const list = await new FileListAdapter(mock.app, pluginIdentity).load();
  assert.equal(list.rename('Unregistered.pdf', 'Renamed.pdf'), false);
  assert.equal(list.rename('Storage/existing.pdf', 'Storage/existing.pdf'), false);
  assert.equal(list.has('Renamed.pdf'), false);
  assert.equal(list.has('Storage/existing.pdf'), true);
});

test('vault rename events persist registration even with auto detection disabled', async () => {
  const { default: Plugin } = loadSource('main');
  const mock = vault();
  const plugin = new Plugin(mock.app);
  await plugin.onload();
  assert.equal(plugin.settings.autoDetection, false);
  const renamed = Object.assign(new obsidian.TFile(), { path: 'Storage/corrected.pdf', name: 'corrected.pdf' });
  assert.ok(mock.events.has('rename'), 'the plugin must subscribe to vault renames');
  await mock.events.get('rename')(renamed, 'Storage/existing.pdf');
  assert.equal(plugin.fileListAdapter.has(renamed.path), true);
  assert.equal(plugin.fileListAdapter.has('Storage/existing.pdf'), false);
  assert.equal(mock.writes.length, 1);
  assert.ok(mock.writes[0].includes(renamed.path));

  let created = 0;
  plugin.metaDataGenerator.create = async () => { created++; };
  mock.app.vault.getFiles = () => [renamed];
  await plugin.commands.find((command) => command.id === 'binary-file-manager-manual-detection').callback();
  assert.equal(created, 0, 'manual detection must not duplicate the renamed binary');

  const reloaded = await new FileListAdapter(mock.app, pluginIdentity).load();
  assert.equal(reloaded.has(renamed.path), true);
});

test('renaming a stub does not register it or rewrite the registry', async () => {
  const { default: Plugin } = loadSource('main');
  const mock = vault();
  const plugin = new Plugin(mock.app);
  await plugin.onload();
  assert.ok(mock.events.has('rename'), 'the plugin must subscribe to vault renames');
  await mock.events.get('rename')({ path: 'Records/corrected-stub.md' }, 'Inbox/original-stub.md');
  assert.equal(mock.writes.length, 0);
  assert.equal(plugin.fileListAdapter.has('Records/corrected-stub.md'), false);
});
