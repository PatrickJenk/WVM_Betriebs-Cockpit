const mailTemplateDefaults = {
  subject: "{{art}}: {{titel}}",
  body: "{{art}}\n\nWärmeverbund: {{standort}}\nTitel: {{titel}}\nVon: {{ersteller}}\nFällig: {{faellig}}\n\n{{beschreibung}}\n\n{{link}}",
  signature: "",
};

function logbookMessage(payload, entryId, baseUrl, template = {}) {
  const link =
    baseUrl.replace(/\/$/, "") + "/#entry/" + encodeURIComponent(entryId);
  const values = new Map([
    ["art", payload.kind],
    ["titel", payload.title],
    ["standort", payload.site],
    ["ersteller", payload.actor],
    ["faellig", payload.dueDate || "–"],
    ["beschreibung", payload.description],
    ["link", link],
  ]);
  const render = (text) =>
    text.replace(/{{\s*([a-z]+)\s*}}/g, (token, key) =>
      values.has(key) ? String(values.get(key) || "") : token,
    );
  return {
    subject: render(template.subject || mailTemplateDefaults.subject).replace(
      /[\r\n]+/g,
      " ",
    ),
    text: [
      render(template.body || mailTemplateDefaults.body),
      render(template.signature || ""),
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

module.exports = { logbookMessage, mailTemplateDefaults };
