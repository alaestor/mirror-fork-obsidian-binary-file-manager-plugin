{
  description = "Personal Binary File Manager fork for Obsidian";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    flake-parts.inputs.nixpkgs-lib.follows = "nixpkgs";
  };

  outputs =
    inputs:
    inputs.flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      perSystem =
        { pkgs, self', ... }:
        let
          nodejs = pkgs.nodejs_24;
          pnpm = pkgs.pnpm_10;
          manifest = builtins.fromJSON (builtins.readFile ./manifest.json);
        in
        {
          packages.default = pkgs.stdenvNoCC.mkDerivation (finalAttrs: {
            pname = manifest.id;
            version = manifest.version;
            src = pkgs.lib.cleanSource ./.;

            nativeBuildInputs = [
              nodejs
              pnpm
              pkgs.pnpmConfigHook
            ];
            pnpmDeps = pkgs.fetchPnpmDeps {
              inherit (finalAttrs) pname version src;
              inherit pnpm;
              fetcherVersion = 5;
              hash = "sha256-EDtRXlseML7zDWZioyyaHBjl9o9AbHYeyonU6UrWlKc=";
            };

            buildPhase = ''
              runHook preBuild
              pnpm build
              node scripts/check-bundled-deps.mjs
              runHook postBuild
            '';
            doCheck = true;
            checkPhase = ''
              runHook preCheck
              pnpm test
              pnpm typecheck
              runHook postCheck
            '';
            installPhase = ''
              runHook preInstall
              mkdir -p "$out"
              cp main.js manifest.json styles.css LICENSE "$out/"
              runHook postInstall
            '';
          });

          checks.tests = self'.packages.default;
          devShells.default = pkgs.mkShell {
            packages = [
              nodejs
              pnpm
              pkgs.biome
            ];
            # Use a Nix-native binary instead of npm's unpatched Linux executable.
            BIOME_BINARY = pkgs.lib.getExe pkgs.biome;
          };
        };
    };
}
