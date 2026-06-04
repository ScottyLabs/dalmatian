{
  description = "Dalmatian Discord bot";

  nixConfig = {
    extra-substituters = [ "https://scottylabs.cachix.org" ];
    extra-trusted-public-keys = [
      "scottylabs.cachix.org-1:hajjEX5SLi/Y7yYloiXTt2IOr3towcTGRhMh1vu6Tjg="
    ];
  };

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-25.11";
    devenv.url = "github:cachix/devenv";
    bun2nix = {
      url = "github:nix-community/bun2nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, devenv, bun2nix, ... }:
    let
      supportedSystems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs supportedSystems;
    in
    {
      nixosModules.default = import ./nix/module.nix { inherit self bun2nix; };
      nixosModules.dalmatian = self.nixosModules.default;

      packages = forAllSystems (system:
        let
          bun2nix' = bun2nix.packages.${system}.default;
          dalmatian = bun2nix'.writeBunApplication {
            pname = "dalmatian";
            version = "0.1.0";
            src = self;
            bunDeps = bun2nix'.fetchBunDeps {
              bunNix = self + "/bun.nix";
            };
            startScript = "bun run start";
            dontUseBunBuild = true;
          };
        in
        {
          inherit dalmatian;
          default = dalmatian;
          devenv = devenv.packages.${system}.devenv;
        }
      );
    };
}
