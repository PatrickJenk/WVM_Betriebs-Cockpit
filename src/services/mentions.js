// Namentliche Erwähnungen dokumentieren Zusammenarbeit, ohne Aufgaben zuzuweisen.
export function findMentions(text, users = []) {
  const normalize = (value) =>
    String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase("de-CH");
  const escape = (value) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const active = users.filter((u) => u.active !== false && u.name);
  const names = active.map((u) => normalize(u.name).trim());
  const source = normalize(text);
  if (!source.includes("@")) return [];
  return active
    .filter((u, index) => {
      const full = names[index],
        first = full.split(/\s+/)[0];
      const unique =
        names.filter((name) => name.split(/\s+/)[0] === first).length === 1;
      const aliases = [full, ...(unique && first !== full ? [first] : [])]
        .map(escape)
        .join("|");
      return new RegExp(
        "(^|[^\\p{L}\\p{N}_@])@(?:" + aliases + ")(?![\\p{L}\\p{N}_-])",
        "u",
      ).test(source);
    })
    .map((u) => ({
      id: u.id,
      name: u.name,
      initials: u.initials,
      company: u.company,
    }));
}
export function entryMentions(entry, users = []) {
  return (
    entry.mentions ||
    findMentions(
      [entry.description, entry.nextSteps].filter(Boolean).join("\n"),
      users,
    )
  );
}
export function isPersonalEntry(entry, user, users = []) {
  return entryMentions(entry, users).some((p) => p.id === user.id);
}
export function mentionSummary(entries, user, users = [], seen = []) {
  const mentioned = entries.filter((e) => isPersonalEntry(e, user, users));
  const unread = mentioned.filter((e) => !seen.includes(e.id)).length;
  return {
    entries: mentioned,
    count: mentioned.length,
    unread,
    color: unread
      ? "red"
      : mentioned.some((e) => e.status !== "Erledigt")
        ? "orange"
        : "blue",
  };
}
