{
    description = "Dalmatian Discord bot";

    inputs = {
        nixpkgs.url = "github:nixos/nixpkgs/nixos-25.11";
        bun2nix = {
            url = "github:nix-community/bun2nix";
            inputs.nixpkgs.follows = "nixpkgs";
        };
    };

    outputs = { self, nixpkgs, bun2nix }:
    let
        supportedSystems = [ "x86_64-linux" "aarch64-linux" ];
        forAllSystems = nixpkgs.lib.genAttrs supportedSystems;
    in
    {
        nixosModules.default = import ./nix/module.nix { inherit self bun2nix; };
        nixosModules.dalmatian = self.nixosModules.default;

        packages = forAllSystems (system:
            let
                pkgs = nixpkgs.legacyPackages.${system};
                bun2nix' = bun2nix.packages.${system}.default;
            in {
                default = bun2nix'.writeBunApplication {
                    pname = "dalmatian";
                    version = "0.1.0";
                    src = ./.;
                    bunDeps = bun2nix'.fetchBunDeps {
                        bunNix = ./bun.nix;
                    };
                    startScript = "bun run start";
                };
            }
        );

        devShells = forAllSystems (system:
            let pkgs = nixpkgs.legacyPackages.${system};
            in {
                default = pkgs.mkShell {
                    buildInputs = [
                        pkgs.bun
                        bun2nix.packages.${system}.default
                    ];
                };
            }
        );
    };
}
