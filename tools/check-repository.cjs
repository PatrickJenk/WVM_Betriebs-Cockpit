// Guard candidate source files; report filenames only, never matched secret values.
const fs = require("node:fs"),
  path = require("node:path"),
  { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const files = [
  ...new Set(
    execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { cwd: root },
    )
      .toString()
      .split("\0")
      .filter(Boolean),
  ),
];
const failures = [];
const forbidden =
  /^(?:tmp|output|node_modules|\.npm-cache|hosting-data|storage[^/]*)\/|(?:^|\/)(?:secret\.key|state\.json)|\.(?:sqlite(?:-wal|-shm)?|pem|p12|pfx|key|log|pyc)$/i;
const secrets = [
  /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{30,}\b/,
  /\bAKIA[A-Z0-9]{16}\b/,
];
for (const file of files) {
  if (!fs.existsSync(path.join(root, file))) continue;
  if (
    forbidden.test(file) ||
    (/(?:^|\/)\.env(?:\.|$)/.test(file) && file !== ".env.example")
  )
    failures.push("Private/generierte Datei im Commit-Kandidaten: " + file);
  if (/^\.github\/workflows\/.*\.ya?ml$/i.test(file))
    failures.push("Nicht erlaubter Actions-Workflow: " + file);
  if (
    !/\.(?:md|js|cjs|mjs|json|sh|py|txt)$/.test(file) &&
    ![".env.example", ".gitignore", ".gitattributes"].includes(file)
  )
    continue;
  const text = fs.readFileSync(path.join(root, file), "utf8");
  if (secrets.some((pattern) => pattern.test(text)))
    failures.push("Mögliches Secret prüfen/rotieren: " + file);
  if (file.endsWith(".md")) {
    const prose = text.replace(/```[\s\S]*?```/g, "");
    for (const match of prose.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      let target = match[1].trim().replace(/^<|>$/g, "").split("#")[0];
      if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
      try {
        target = decodeURIComponent(target);
      } catch {
        failures.push("Ungültiger Link in " + file);
        continue;
      }
      if (!fs.existsSync(path.resolve(root, path.dirname(file), target)))
        failures.push("Fehlendes Linkziel in " + file + ": " + target);
    }
  }
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Repository geprüft: ${files.length} Quell-/Dokumentkandidaten, lokale Links, typische Secret-Muster und kein Actions-Workflow. Alte Historie ist separat zu beurteilen.`,
  );
