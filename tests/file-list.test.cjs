const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');

// Obsidian provides its runtime inside the application, not in its npm package.
const obsidian = {
  normalizePath: (path) => path,
  TFile: class TFile {},
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

function vault({ ready = false, beforeRead = async () => {} } = {}) {
  let disk = 'Storage/existing.pdf\nStorage/deleted.pdf';
  const callbacks = [];
  const writes = [];
  const app = {
    workspace: {
      onLayoutReady(callback) {
        if (ready) callback();
        else callbacks.push(callback);
      },
    },
    vault: {
      configDir: '.obsidian',
      getFiles: () => ready ? [{ path: 'Storage/existing.pdf' }] : [],
      adapter: {
        exists: async () => true,
        read: async () => { await beforeRead(); return disk; },
        write: async (_path, content) => { writes.push(content); disk = content; },
      },
    },
  };
  return {
    app, writes,
    open() { ready = true; callbacks.splice(0).forEach((callback) => callback()); },
  };
}

test('loading in an already-open vault preserves existing registrations', async () => {
  const { app } = vault({ ready: true });
  const list = await new FileListAdapter(app, {}).load();
  await flush();
  assert.equal(list.has('Storage/existing.pdf'), true);
  assert.equal(list.has('Storage/deleted.pdf'), false);
});

test('layout readiness during a delayed read cannot erase the saved registry', async () => {
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const mock = vault({ beforeRead: () => blocked });
  const loading = new FileListAdapter(mock.app, {}).load();
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
  const list = await new FileListAdapter(mock.app, {}).load();
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
  await assert.rejects(new FileListAdapter(mock.app, {}).load(), /read failed/);
  await flush();
  assert.equal(mock.writes.length, 0);
});

test('detection skips a registered binary but accepts a new binary after startup', async () => {
  const mock = vault({ ready: true });
  const list = await new FileListAdapter(mock.app, {}).load();
  const generator = new MetaDataGenerator(mock.app, {
    fileListAdapter: list,
    fileExtensionManager: { getExtensionMatchedBest: () => 'pdf' },
  });
  const existing = Object.assign(new obsidian.TFile(), { path: 'Storage/existing.pdf', name: 'existing.pdf' });
  const added = Object.assign(new obsidian.TFile(), { path: 'Storage/new.pdf', name: 'new.pdf' });
  assert.equal(await generator.shouldCreateMetaDataFile(existing), false);
  assert.equal(await generator.shouldCreateMetaDataFile(added), true);
});
