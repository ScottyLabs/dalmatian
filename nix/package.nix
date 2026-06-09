{ lib
, stdenvNoCC
, deno
, jq
,
}:

let
  pname = "dalmatian";
  version = "0.1.0";

  src = lib.cleanSourceWith {
    src = ../.;
    filter = path: type:
      let base = baseNameOf path;
      in !(builtins.elem base [
        ".devenv"
        ".direnv"
        "build"
        "result"
        ".git"
        "node_modules"
      ]);
  };

  compileIncludes = [
    "src/handlers"
    "src/commands"
    "src/contextCommands"
    "src/events"
    "src/data/fce_data.csv"
  ];

  # Runtime directory scans (handlers/commands/events) and fce_data.csv need to
  # be embedded in the compiled binary; see deno compile --include docs.
  compileIncludeFlags = lib.concatStringsSep " " (
    map (path: "--include ${path}") compileIncludes
  );

  # Fixed-output derivation that populates Deno's cache (DENO_DIR) with every
  # remote (jsr:) and npm: dependency resolved from deno.lock, plus the matching
  # `denort` standalone runtime that `deno compile` needs. This is the "native
  # vendoring" approach: it is the only step allowed network access, letting the
  # real build run fully offline with --cached-only.
  #
  # We run a throwaway `deno compile` (output discarded) purely to warm the cache
  # the same way the real build does, so denort + every dependency is present.
  #
  # The cache contents are platform-specific: `deno compile` downloads the
  # denort runtime for the build platform, and npm packages with native
  # binaries (e.g. biome) only cache the matching platform variant. So the
  # output hash must be pinned per system below.
  #
  # If you change dependencies (or the deno version), update the hash for each
  # system: set it to `lib.fakeHash`, run the build once, and copy the "got:"
  # hash here.
  #
  # Deno's cache includes non-reproducible artifacts (analysis cache, registry
  # JSON key ordering). We strip/normalize those in postBuild so the FOD hash is
  # stable across machines and rebuilds.
  deps = stdenvNoCC.mkDerivation {
    pname = "${pname}-deps";
    inherit version src;

    nativeBuildInputs = [ deno jq ];

    dontConfigure = true;
    dontInstall = true;

    postBuild = ''
      bash ${./sanitize-deno-cache.sh} "$out"
    '';

    buildPhase = ''
      runHook preBuild

      export DENO_DIR="$out"
      export HOME="$TMPDIR"

      deno compile \
        --frozen \
        --no-check \
        --allow-all \
        ${compileIncludeFlags} \
        --output "$TMPDIR/warmup" \
        src/index.ts

      runHook postBuild
    '';

    # The cache is content-addressed, so this is a fixed-output derivation.
    outputHashMode = "recursive";
    outputHashAlgo = "sha256";
    outputHash = {
      x86_64-linux = "sha256-9kvZuttdCJe2GYOuuWWH2lbpVhon5HAzLC8mitWThMA=";
    }.${stdenvNoCC.hostPlatform.system} or lib.fakeHash;
  };
in
stdenvNoCC.mkDerivation {
  inherit pname version src;

  nativeBuildInputs = [ deno ];

  configurePhase = ''
    runHook preConfigure

    # deno compile needs a writable cache, so copy the FOD output in.
    cp -r ${deps} ./.deno-dir
    chmod -R u+w ./.deno-dir
    export DENO_DIR="$PWD/.deno-dir"
    export HOME="$TMPDIR"

    runHook postConfigure
  '';

  buildPhase = ''
    runHook preBuild

    # --no-check mirrors the `start` task (`deno run`), which does not
    # type-check. The codebase has pre-existing strictness errors that only
    # surface under `deno check`/`deno compile`'s default type checking.
    deno compile \
      --cached-only \
      --frozen \
      --no-check \
      --allow-all \
      ${compileIncludeFlags} \
      --output ${pname} \
      src/index.ts

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    install -Dm755 ${pname} $out/bin/${pname}

    runHook postInstall
  '';

  meta = {
    description = "Dalmatian Discord bot";
    mainProgram = pname;
    platforms = [ "x86_64-linux" "aarch64-linux" ];
  };
}
