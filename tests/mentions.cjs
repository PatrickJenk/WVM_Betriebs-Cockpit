const assert = require("node:assert/strict");
(async () => {
  const { findMentions, entryMentions, isPersonalEntry, mentionSummary } =
    await import("../src/services/mentions.js");
  const users = [
    { id: "pj", name: "Patrick Jenk", initials: "PJ", company: "WVM" },
    { id: "tl", name: "Tobias Lück", initials: "TL", company: "WVM" },
    { id: "mm", name: "Marcel Maibach", initials: "MM", company: "EPC" },
  ];
  assert.deepEqual(
    findMentions(
      "Klappen mit @tobias angeschaut. @Patrick Jenk hat die Revision bestellt.",
      users,
    ).map((p) => p.id),
    ["pj", "tl"],
  );
  assert.deepEqual(
    findMentions("@Patrick Jenk und nochmals @patrick", users).map((p) => p.id),
    ["pj"],
  );
  assert.deepEqual(
    findMentions("Kontakt kontakt@patrick.ch oder @Patrickx", users),
    [],
  );
  assert.deepEqual(
    findMentions("@Patrick", [...users, { id: "p2", name: "Patrick Müller" }]),
    [],
  );
  assert.equal(
    findMentions("@Patrick Jenk", [
      ...users,
      { id: "p2", name: "Patrick Müller" },
    ])[0].id,
    "pj",
  );
  assert.deepEqual(
    findMentions(
      "@Marcel",
      users.map((p) => ({ ...p, active: p.id !== "mm" })),
    ),
    [],
  );
  const entry = {
    createdById: "mm",
    description: "Mit @Tobias angeschaut",
    mentions: findMentions("@Tobias", users),
  };
  assert.equal(isPersonalEntry(entry, users[1], users), true);
  assert.equal(
    isPersonalEntry({ ...entry, status: "Erledigt" }, users[1], users),
    true,
  );
  assert.equal(
    isPersonalEntry({ ...entry, status: "In Bearbeitung" }, users[1], users),
    true,
  );
  assert.equal(isPersonalEntry(entry, users[2], users), false);
  assert.equal(isPersonalEntry(entry, users[0], users), false);
  assert.equal(
    isPersonalEntry(
      { createdById: "pj", description: "Ohne Markierung" },
      users[0],
      users,
    ),
    false,
  );
  assert.equal(
    isPersonalEntry({ nextSteps: "Mit @Patrick prüfen" }, users[0], users),
    true,
  );
  assert.equal(
    entryMentions(entry, [{ ...users[1], name: "Tobias Neuername" }])[0].id,
    "tl",
  );
  assert.equal(
    entryMentions({ description: "Mit @Patrick" }, users)[0].id,
    "pj",
  );
  const completed = { ...entry, id: "done", status: "Erledigt" };
  const pending = { ...entry, id: "open", status: "Pendenz" };
  assert.equal(mentionSummary([completed], users[1], users, []).color, "red");
  assert.equal(
    mentionSummary([completed], users[1], users, ["done"]).color,
    "blue",
  );
  assert.equal(
    mentionSummary([completed, pending], users[1], users, ["done", "open"])
      .color,
    "orange",
  );
  assert.equal(
    mentionSummary([completed, pending], users[1], users, ["done"]).color,
    "red",
  );
  assert.equal(mentionSummary([], users[1], users, []).count, 0);
  console.log(
    "Passed: full names, unique first names, case, umlauts, deduplication, email/boundary rejection, inactive/ambiguous users, stable IDs and personal entry filter.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
