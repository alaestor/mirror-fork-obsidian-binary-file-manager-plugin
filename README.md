# Binary File Manager personal fork

![Hallucinated Slop](https://img.shields.io/badge/%E2%80%94_Hallucinated_Slop_%E2%80%94-red)

Personal fork maintained by alaestor weissman. It creates Markdown stubs for binary
files in an Obsidian vault. See [qawatake's upstream documentation](https://github.com/qawatake/obsidian-binary-file-manager-plugin#readme)
for settings, template syntax and Templater support. The upstream MIT license is
preserved in [LICENSE](LICENSE).

This fork fixes registry loss during startup and preserves registrations when
files or folders are renamed inside an open vault. It does not track renames made
while Obsidian is closed or repair existing duplicate stubs.

Its plugin ID is `personal-fork-binary-file-manager`, distinct from the marketplace
plugin. Install it locally; marketplace updates for upstream do not update this
fork. Do not enable both versions in the same vault.

## Build and test

With Nix flakes enabled:

```sh
nix flake check
nix build
```

The check runs the regression tests, type checking and the production build.
`result/` contains `main.js`, `manifest.json`, `styles.css` and `LICENSE`, not a vault
or its private settings. Nix pins the toolchain and JavaScript dependencies.

For development:

```sh
nix develop
pnpm install --frozen-lockfile
pnpm test
pnpm check
```

The shell supplies Node.js, pnpm and a Nix-native Biome binary. The initial install
and Nix dependency fetches need network access; the installed plugin does not
need a release server or updater.

## Install or migrate

Close Obsidian and back up the vault before changing its plugin files.

1. Run `nix build` and create
   `<vault>/.obsidian/plugins/personal-fork-binary-file-manager/`.
2. Copy the four files from `result/` into that directory. Copy the files rather
   than symlinking the directory: Obsidian must be able to write its settings and
   registry alongside the build.
3. When migrating from upstream, also copy `data.json` and the hidden
   `.binary-file-manager_binary-file-list.txt` from its existing plugin directory.
   Do not uninstall upstream before preserving these files. A missing registry
   makes existing binaries appear new.
4. In `.obsidian/community-plugins.json`, replace
   `obsidian-binary-file-manager-plugin` with `personal-fork-binary-file-manager`.
   Move the old plugin directory outside the vault as a recoverable backup.
5. If `.obsidian/hotkeys.json` contains command keys prefixed with
   `obsidian-binary-file-manager-plugin:`, replace that prefix with
   `personal-fork-binary-file-manager:`.
6. Reopen the vault. Confirm the personal fork is enabled and upstream is absent.

Use the vault's actual configuration directory if it is not `.obsidian`.
Old registries can contain stale paths from earlier renames. Those binaries can
receive duplicate stubs on startup; check for and remove those duplicates after
migration. The fixes prevent future registry loss and track subsequent in-app
renames, but do not repair old state.

For later updates, close Obsidian, copy the four build files into the same local
plugin directory and reopen it. Keep the existing settings and registry files.
