{ self, bun2nix }:

{ config, lib, pkgs, ... }:

let
    cfg = config.services.dalmatian;
    bun2nix' = bun2nix.packages.${pkgs.stdenv.hostPlatform.system}.default;

    dalmatianPkg = bun2nix'.writeBunApplication {
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
    options.services.dalmatian = {
        enable = lib.mkEnableOption "Dalmatian Discord bot";

        package = lib.mkOption {
            type = lib.types.package;
            default = dalmatianPkg;
            description = "The Dalmatian package to use";
        };

        environmentFile = lib.mkOption {
            type = lib.types.path;
            description = "Path to environment file containing DISCORD_TOKEN, DISCORD_CLIENT_ID, etc.";
            example = "/run/secrets/dalmatian";
        };

        database = {
            host = lib.mkOption {
                type = lib.types.str;
                default = "/run/postgresql";
                description = "PostgreSQL host (use socket path for local peer auth)";
            };

            name = lib.mkOption {
                type = lib.types.str;
                default = "dalmatian";
                description = "Database name";
            };

            user = lib.mkOption {
                type = lib.types.str;
                default = "dalmatian";
                description = "Database user";
            };

            createLocally = lib.mkOption {
                type = lib.types.bool;
                default = true;
                description = "Whether to create the database locally";
            };
        };
    };

    config = lib.mkIf cfg.enable {
        users.users.dalmatian = {
            isSystemUser = true;
            group = "dalmatian";
        };
        users.groups.dalmatian = {};

        services.postgresql = lib.mkIf cfg.database.createLocally {
            enable = true;
            ensureDatabases = [ cfg.database.name ];
            ensureUsers = [{
                name = cfg.database.user;
                ensureDBOwnership = true;
            }];
        };

        systemd.services.dalmatian = {
            description = "Dalmatian Discord Bot";
            wantedBy = [ "multi-user.target" ];
            after = [ "network.target" ] ++ lib.optional cfg.database.createLocally "postgresql.service";
            requires = lib.optional cfg.database.createLocally "postgresql.service";

            serviceConfig = {
                Type = "simple";
                User = "dalmatian";
                Group = "dalmatian";
                EnvironmentFile = cfg.environmentFile;

                ExecStart = "${cfg.package}/bin/dalmatian";
                Restart = "on-failure";
                RestartSec = "10s";

                NoNewPrivileges = true;
                ProtectSystem = "strict";
                ProtectHome = true;
                PrivateTmp = true;
            };

            environment = {
                DATABASE_URL = "postgresql:///${cfg.database.name}?host=${cfg.database.host}";
                NODE_ENV = "production";
            };
        };
    };
}
