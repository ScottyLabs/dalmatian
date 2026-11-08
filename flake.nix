{
  description = "Dalmatian Discord bot";

  nixConfig = {
    extra-substituters = [ "https://scottylabs.cachix.org" ];
    extra-trusted-public-keys = [
      "scottylabs.cachix.org-1:hajjEX5SLi/Y7yYloiXTt2IOr3towcTGRhMh1vu6Tjg="
    ];
  };

  inputs = {
    scottylabs.url = "git+https://git.cmu.dev/ScottyLabs/kennel";
    nixpkgs.follows = "scottylabs/nixpkgs";
    flake-parts.follows = "scottylabs/flake-parts";
  };

  outputs =
    inputs:
    inputs.flake-parts.lib.mkFlake { inherit inputs; } {
      imports = [ inputs.scottylabs.flakeModules.default ];
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
      ];

      perSystem =
        { lib, helpers, ... }:
        {
          scottylabs = {
            project.name = "dalmatian";
            deno.enable = true;
            postgres.enable = true;
            previewDeployments = false;
            processes.dalmatian = {
              run = "secretspec run --profile dev -- deno run start";
              depends = [ "postgres-setup" ];
            };
          };

          pre-commit.settings.hooks.oxlint.settings.deny = lib.mkForce [ "correctness" ];

          treefmt.settings.global.excludes = [ "src/data/**" ];

          services.dalmatian.package = helpers.buildDenoTask {
            src = ./.;
            pname = "dalmatian";
            entrypoint = "src/index.ts";
            compile = true;
          };
        };
    };
}
