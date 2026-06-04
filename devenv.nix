{ pkgs, inputs, ... }:
{
  imports = [
    inputs.scottylabs.devenvModules.default
  ];

  scottylabs = {
    enable = true;
    project.name = "dalmatian";

    bun.enable = true;
    postgres.enable = true;
    secrets.enable = true;

    kennel.services.dalmatian = { };
  };

  env = {
    VAULT_ADDR = "https://secrets2.scottylabs.org";
    SECRETSPEC_PROFILE = "dev";
    SECRETSPEC_PROVIDER = "vault://secrets2.scottylabs.org/secret";
  };

  packages = [
    inputs.bun2nix.packages.${pkgs.stdenv.hostPlatform.system}.default
  ];

  treefmt.config.settings.global.excludes = [
    "src/data/**"
  ];
}
