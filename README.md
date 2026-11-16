# Binary File Manager personal fork

![Hallucinated Slop](https://img.shields.io/badge/%E2%80%94_Hallucinated_Slop_%E2%80%94-red)

Personal fork. See the upstream [github:qawatake/obsidian-binary-file-manager-plugin](https://github.com/qawatake/obsidian-binary-file-manager-plugin) for details.

Plugin ID `personal-fork-binary-file-manager`, distinct from the marketplace plugin. Intended only for manual installation; not distributed.

## In this fork

- Fix for open-existing startup stub duplication
- Fix for move/rename stub duplication
- Nix Flake for dev shell, build, and checks

## Build and test

With Nix flakes enabled:

```sh
nix flake check
nix build
```

The check runs the regression tests, type checking and the production build.
`result/` contains `main.js`, `manifest.json`, `styles.css` and `LICENSE`.

For development:

```sh
nix develop
pnpm install --frozen-lockfile
pnpm test
pnpm check
```

The shell supplies Node.js, pnpm and a Nix-native Biome binary.

## Install or migrate

Close Obsidian and back up the vault before changing its plugin files.

```sh
set -eu
VAULT="/absolute/path/to/vault"

nix build
DEST="$VAULT/.obsidian/plugins/personal-fork-binary-file-manager"
mkdir -p "$DEST"
install -m 644 \
    result/main.js result/manifest.json \
    result/styles.css result/LICENSE "$DEST/"
```

For migration, copy `data.json` and `.binary-file-manager_binary-file-list.txt` from the old plugin directory into the new one before reopening. Disable upstream and enable `Binary File Manager (personal fork)`; don't enable both together.
