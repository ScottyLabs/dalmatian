{
  lib,
  inputs,
  ...
}:
{
  imports = [
    inputs.scottylabs.devenvModules.default
  ];

  git-hooks.hooks.oxlint.settings.deny = lib.mkForce [ "correctness" ];

  scottylabs = {
    enable = true;
    project.name = "dalmatian";

    deno.enable = true;
    postgres.enable = true;
    secrets.enable = true;

    kennel = {
      previewDeployments = false;
      services.dalmatian = { };
    };
  };

  processes.dalmatian.exec = "secretspec run --profile dev -- deno run start";

  treefmt.config.settings.global.excludes = [
    "src/data/**"
    "biome.jsonc"
  ];
}
