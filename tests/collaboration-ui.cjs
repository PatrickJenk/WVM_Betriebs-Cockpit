const assert = require("node:assert/strict");
const { parseHTML } = require("linkedom");
(async () => {
  const { document, HTMLElement } = parseHTML(
    '<html><body><div id="content"></div><dialog id="modal"></dialog></body></html>',
  );
  global.document = document;
  global.location = { origin: "http://localhost:4173" };
  global.sessionStorage = { getItem: () => "main" };
  Object.defineProperty(HTMLElement.prototype, "elements", {
    configurable: true,
    get() {
      return new Proxy(
        {},
        { get: (_, name) => this.querySelector(`[name="${String(name)}"]`) },
      );
    },
  });
  Object.defineProperty(HTMLElement.prototype, "checked", {
    configurable: true,
    get() {
      return this.hasAttribute("checked");
    },
    set(value) {
      if (value) this.setAttribute("checked", "");
      else this.removeAttribute("checked");
    },
  });
  global.FormData = class extends Map {
    constructor(form) {
      super(
        Array.from(form.querySelectorAll("[name]")).map((n) => [
          n.getAttribute("name"),
          n.value,
        ]),
      );
    }
  };
  const { repository } = await import("../src/services/repository.js");
  const { createCollaboration } =
    await import("../src/features/collaboration.js");
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const users = [
    { id: "main", name: "Hauptadmin", role: "Admin", systemRole: "main" },
    {
      id: "member",
      name: "Benutzer",
      role: "WVM",
      company: "WVM",
      email: "member@example.ch",
    },
  ];
  const data = { users },
    user = { ...users[0] },
    messages = [],
    requests = [];
  const contacts = [
    {
      id: "a",
      name: "<script>Person A</script>",
      organization: "WVM",
      function: "Betrieb",
      email: "a@example.ch",
      phone: "+41 31 123 45 67",
      availability: "Montag",
      imageId: "picture",
      version: 1,
    },
    {
      id: "b",
      name: "Person B",
      organization: "EWB",
      function: "Support",
      email: "b@example.ch",
      phone: "031 222 22 22",
      availability: "Dienstag",
      version: 1,
    },
  ];
  repository.call = (method, url, value) => {
    requests.push({ method, url, value });
    if (url === "/api/contacts" && method === "GET") return { contacts };
    if (url === "/api/mail" && method === "GET")
      return {
        settings: {
          host: "smtp.example.ch",
          port: 587,
          username: "smtp-user",
          senderEmail: "mail@example.ch",
          passwordSet: true,
          encryption: "starttls",
        },
        status: [{ status: "retry", count: 1 }],
      };
    return { ok: true };
  };
  const modal = document.querySelector("#modal");
  let saves = 0,
    failSave = false;
  modal.close = () => (modal.open = false);
  const ui = createCollaboration({
    data,
    user,
    esc,
    show: (html) => {
      modal.innerHTML = html;
      modal.open = true;
    },
    modal,
    toast: (m) => messages.push(m),
    save: () => {
      saves++;
      return !failSave;
    },
  });
  ui.contacts();
  assert.equal(document.querySelectorAll(".contact-section").length, 2);
  assert.equal(document.querySelector(".contact-table script"), null);
  assert.equal(
    document.querySelector('a[href="mailto:a@example.ch"]').textContent,
    "a@example.ch",
  );
  assert.ok(document.querySelector('a[href="tel:+41311234567"]'));
  assert.equal(
    document.querySelector(".contact-photo").getAttribute("src"),
    "/api/contacts/images/picture",
  );
  const search = document.querySelector("#contact-search");
  search.value = "Support";
  search.oninput();
  assert.equal(document.querySelectorAll("[data-contact-edit]").length, 1);
  assert.equal(
    document.querySelector("[data-contact-edit]").dataset.contactEdit,
    "b",
  );
  ui.contacts();
  assert.equal(
    document.querySelector("#contact-search").value,
    "Support",
    "refresh preserves search",
  );
  document.querySelector("[data-contact-edit]").onclick();
  assert.equal(modal.querySelector('[name="name"]').value, "Person B");
  assert.ok(
    modal
      .querySelector('[name="photo"]')
      .getAttribute("accept")
      .includes("image/jpeg"),
  );
  let contactForm = document.querySelector("#contact-form");
  contactForm.elements.name.value = "Aktualisierte Person";
  contactForm.elements.photo.files = [];
  await contactForm.onsubmit({ preventDefault() {} });
  assert.equal(
    requests.some(
      (r) =>
        r.method === "PUT" &&
        r.url === "/api/contacts/b" &&
        r.value.name === "Aktualisierte Person" &&
        r.value.version === 1,
    ),
    true,
    "contact form submits versioned API payload",
  );
  document.querySelector("[data-contact-edit]").onclick();
  contactForm = document.querySelector("#contact-form");
  const file = { name: "photo.png", size: 100, type: "image/png" };
  contactForm.elements.photo.files = [file];
  let uploaded = false;
  global.fetch = async (url, init) => {
    assert.equal(url, "/api/contacts/images");
    assert.equal(init.method, "POST");
    assert.equal(init.body, file);
    uploaded = true;
    return { ok: true, json: async () => ({ id: "uploaded-image" }) };
  };
  await contactForm.onsubmit({ preventDefault() {} });
  assert.equal(uploaded, true);
  assert.ok(
    requests.some(
      (r) =>
        r.method === "PUT" &&
        r.url === "/api/contacts/b" &&
        r.value.imageId === "uploaded-image",
    ),
  );
  ui.mail();
  let f = document.querySelector("#mail-form");
  assert.equal(f.elements.password.value, "");
  assert.match(modal.textContent, /gespeichert/);
  f.elements.enabled.checked = true;
  f.elements.clearPassword.checked = true;
  f.onsubmit({ preventDefault() {}, currentTarget: f });
  const settings = requests.at(-1);
  assert.equal(settings.url, "/api/mail");
  assert.equal(settings.value.enabled, true);
  assert.equal(settings.value.port, 587);
  assert.equal(settings.value.password, "");
  assert.equal(
    f.elements.clearPassword.checked,
    false,
    "clear checkbox reset after save",
  );
  assert.match(modal.textContent, /Einstellungen gespeichert/);
  ui.account("member");
  f = document.querySelector("#account-details");
  f.elements.email.value = "updated@example.ch";
  f.elements.notificationsEnabled.checked = false;
  failSave = true;
  f.onsubmit({ preventDefault() {} });
  assert.equal(data.users[1].email, "member@example.ch");
  assert.equal(modal.open, true);
  failSave = false;
  f.onsubmit({ preventDefault() {} });
  assert.equal(
    data.users[1].email,
    "updated@example.ch",
    "retry targets current user after rollback",
  );
  assert.equal(data.users[1].notificationsEnabled, false);
  assert.equal(saves, 2);
  assert.equal(modal.open, false);
  ui.account("main");
  f = document.querySelector("#account-details");
  assert.ok(f.querySelector('option[value="main"]'));
  Object.assign(user, {
    id: "delegated",
    role: "Administrator",
    systemRole: "admin",
    systemPermissions: ["roles"],
  });
  ui.account("main");
  assert.equal(
    document.querySelector('#account-details [name="systemRole"]'),
    null,
    "delegated admin cannot edit main role",
  );
  Object.assign(user, {
    ...data.users[1],
    role: "WVM",
    systemRole: "user",
    leadership: false,
  });
  ui.contacts();
  assert.equal(document.querySelector("#contact-add"), null);
  assert.equal(document.querySelector("[data-contact-edit]"), null);
  assert.equal(ui.can("smtp"), false);
  console.log(
    "Passed: contact DOM grouping/search/links/images/escaping, admin-only actions, SMTP form, user settings and failed-save retry.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
