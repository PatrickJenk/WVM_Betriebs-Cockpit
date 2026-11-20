// No bundler is used. Compile every shipped/test JavaScript file without running it.
const fs = require("node:fs"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
function files(dir) {
  if (!fs.existsSync(path.join(root, dir))) return [];
  return fs
    .readdirSync(path.join(root, dir), { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? files(path.join(dir, e.name))
        : /\.(?:c?js|mjs)$/.test(e.name)
          ? [path.join(dir, e.name)]
          : [],
    );
}
const targets = [
  ...fs.readdirSync(root).filter((p) => /\.cjs$/.test(p)),
  ...["src", "public", "tools", "tests"].flatMap(files),
];
for (const file of targets) {
  const result = spawnSync(
    process.execPath,
    ["--check", path.join(root, file)],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    console.error(file + "\n" + result.stderr);
    process.exit(1);
  }
}
console.log(
  `Syntax geprüft: ${targets.length} JavaScript-Dateien. Kein Build-Schritt erforderlich.`,
);
