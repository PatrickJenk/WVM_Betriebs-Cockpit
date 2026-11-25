// DOM integration against the same real HTTP server as the permission tests.
// LinkeDOM supplies DOM parsing; validation/dialog/download browser APIs are stubbed.
const assert = require("node:assert/strict");
const { parseHTML } = require("linkedom");
module.exports = async function testLeadershipUI({ base, token, meetingId }) {
  const { document, HTMLElement } = parseHTML(
    '<html><body><div id="content"></div><dialog id="modal"></dialog></body></html>',
  );
  const originalFetch = global.fetch;
  const originals = Object.fromEntries(
    [
      "document",
      "location",
      "sessionStorage",
      "FormData",
      "confirm",
      "setInterval",
    ].map((key) => [key, global[key]]),
  );
  Object.defineProperty(HTMLElement.prototype, "elements", {
    configurable: true,
    get() {
      return new Proxy(
        {},
        {
          get: (_, name) =>
            name === "namedItem"
              ? (key) => this.querySelector(`[name="${key}"]`)
              : this.querySelector(`[name="${String(name)}"]`),
        },
      );
    },
  });
  HTMLElement.prototype.reportValidity = () => true;
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
  const options = (values, selected) =>
    values
      .map((v) => {
        const [id, label] = Array.isArray(v) ? v : [v, v];
        return `<option value="${esc(id)}" ${id === selected ? "selected" : ""}>${esc(label)}</option>`;
      })
      .join("");
  let requests = 0;
  const messages = [];
  global.document = document;
  global.location = { hash: "#leadership/" + meetingId };
  global.sessionStorage = { getItem: () => "wvm" };
  global.FormData = class extends Map {
    constructor(form) {
      super(
        Array.from(form.querySelectorAll("[name]")).map((n) => [
          n.name || n.getAttribute("name"),
          n.value,
        ]),
      );
    }
  };
  global.fetch = async (url, init = {}) => {
    requests++;
    try {
      return await originalFetch(new URL(url, base), {
        ...init,
        headers: { ...init.headers, Authorization: "Bearer " + token },
      });
    } finally {
      requests--;
    }
  };
  const waitFor = async (predicate) => {
    const until = Date.now() + 5000;
    while (!predicate()) {
      if (Date.now() > until)
        throw Error("DOM action timed out: " + messages.join("; "));
      await new Promise((r) => setTimeout(r, 10));
    }
  };
  const modal = document.querySelector("#modal");
  modal.close = () => {
    modal.open = false;
  };
  const show = (html) => {
    modal.innerHTML = html;
    modal.open = true;
    modal.querySelector(".close").onclick = modal.close;
  };
  const { createLeadership } = await import("../src/features/leadership.js");
  const feature = createLeadership({
    user: { id: "wvm", role: "WVM" },
    data: { entries: [] },
    esc,
    options,
    fmt: (s) => s.slice(0, 10),
    show,
    modal,
    toast: (s) => messages.push(s),
    openEntry: () => {},
  });
  try {
    await feature.render();
    assert.ok(document.querySelector("#lead-meeting-form"));
    const form = document.querySelector("#lead-meeting-form");
    form.elements.title.value = 'Sitzung <img src=x onerror="alert(1)">';
    form.elements.agenda.value = "Betrieb prüfen\nOffene Fragen";
    form.elements.summary.value = "Verantwortlichkeiten geklärt";
    form.oninput();
    assert.equal(feature.isDirty(), true);
    form.onsubmit({ preventDefault() {} });
    await waitFor(
      () =>
        document.querySelector("#lead-save-status")?.textContent ===
        "Gespeichert",
    );
    assert.equal(feature.isDirty(), false);
    document.querySelector("#lead-refresh").onclick();
    await waitFor(() =>
      messages.includes(
        "Pendenzen aktualisiert. Geänderte Punkte bitte erneut prüfen.",
      ),
    );
    assert.equal(
      document.querySelector("#content img"),
      null,
      "Escaped title cannot create HTML",
    );
    assert.equal(
      document.querySelector('[name="agenda"]').value,
      "Betrieb prüfen\nOffene Fragen",
    );
    // Closing without checking all items must retain the editable form.
    document.querySelector("#lead-close").onclick();
    await waitFor(() =>
      messages.includes("Bitte alle Pendenzen als besprochen markieren."),
    );
    assert.equal(modal.open, undefined);
    document
      .querySelectorAll('input[type="checkbox"]')
      .forEach((n) => (n.checked = true));
    document.querySelector("#lead-close").onclick();
    await waitFor(() => modal.open === true);
    assert.ok(document.querySelector("#lead-confirm-close"));
    // Keep this fixture draft: test task creation and automatic snapshot refresh.
    modal.close();
    document.querySelector("#lead-task-new").onclick();
    await waitFor(() => !!document.querySelector("#lead-task-form"));
    const taskForm = document.querySelector("#lead-task-form");
    taskForm.elements.title.value = "Nachverfolgung aus DOM-Test";
    taskForm.elements.description.value = "Besprochene Massnahme";
    await taskForm.onsubmit({ preventDefault() {}, currentTarget: taskForm });
    assert.equal(
      modal.open,
      false,
      document.querySelector("#lead-task-error")?.textContent,
    );
    assert.ok(
      document
        .querySelector("#content")
        .textContent.includes("Nachverfolgung aus DOM-Test"),
    );
    assert.ok(document.querySelector("#lead-meeting-form"));
    console.log(
      "Passed: real DOM form save, escaped text, draft retention, review validation, closure dialog, task creation and snapshot refresh.",
    );
    // Exercise the new workflow using the real request transport and archive.
    const callbacks = [];
    global.setInterval = (fn) => callbacks.push(fn);
    global.confirm = () => true;
    const { createJourfix } = await import("../src/features/jourfix.js");
    const jourfix = createJourfix({
      user: { id: "wvm", role: "WVM" },
      esc,
      toast: (s) => messages.push(s),
    });
    const event = { preventDefault() {} };
    location.hash = "#jourfix/epc";
    await jourfix.render();
    const agenda = document.querySelector("#jourfix-agenda");
    agenda.elements.namedItem("title").value = "DOM-Test Traktandum";
    await agenda.onsubmit(event);
    await document.querySelector("#jourfix-new").onclick(event);
    await jourfix.render();
    const preparation = document.querySelector("#jourfix-form");
    assert.equal(document.querySelector("#jourfix-close"), null);
    preparation.elements.namedItem("time").value = "08:15";
    const search = document.querySelector("#jourfix-person-search");
    search.value = "Betriebsleitung";
    search.oninput();
    const suggestion = document.querySelector("[data-pick=wvm]");
    assert.ok(suggestion);
    document
      .querySelector("#jourfix-suggestions")
      .onclick({ target: suggestion });
    await preparation.onsubmit(event);
    assert.equal(location.hash, "#jourfix/epc", messages.join(" / "));
    await jourfix.render();
    const protocolLink = document.querySelector('a[href^="#jourfix/epc/"]');
    assert.ok(protocolLink);
    location.hash = protocolLink.getAttribute("href");
    await jourfix.render();
    const note = document.querySelector('textarea[name^="note:"]');
    assert.ok(note);
    note.value = "Gemeinsame Notizen";
    document.querySelector("#jourfix-form").dataset.dirty = "true";
    await callbacks[0]();
    assert.equal(jourfix.isDirty(), false, messages.join(" / "));
    const forward = global.fetch;
    let committed, release;
    const responseStarted = new Promise((resolve) => {
      committed = resolve;
    });
    const responseGate = new Promise((resolve) => {
      release = resolve;
    });
    global.fetch = async (url, init) => {
      const response = await forward(url, init);
      if (init?.method === "PATCH") {
        committed();
        await responseGate;
      }
      return response;
    };
    document.querySelector("#jourfix-add").onclick();
    const firstSave = callbacks[0]();
    await Promise.race([
      responseStarted,
      firstSave.then(() => {
        throw Error("Pendenz wurde nicht gespeichert: " + messages.join(" / "));
      }),
    ]);
    const pending = document.querySelector(
      '[data-jourfix-item] [name="title"]',
    );
    pending.value = "Während des Speicherns ergänzt";
    document.querySelector("#jourfix-form").dataset.dirty = "true";
    global.fetch = forward;
    release();
    await firstSave;
    await callbacks[0]();
    assert.equal(jourfix.isDirty(), false, messages.join(" / "));
    await jourfix.render(true);
    assert.equal(
      document.querySelector('[data-jourfix-item] [name="title"]').value,
      "Während des Speicherns ergänzt",
    );
    document.querySelector("#jourfix-add").onclick();
    await document.querySelector("#jourfix-close").onclick(event);
    assert.equal(location.hash, "#jourfix/epc", messages.join(" / "));
    await jourfix.render();
    assert.ok(document.querySelector("[data-jourfix-pdf]"));
    assert.equal(document.querySelector('a[href^="#jourfix/epc/"]'), null);
    assert.equal(
      document
        .querySelector("#jourfix-agenda")
        .closest("section")
        .querySelectorAll("li").length,
      0,
    );
  } finally {
    await waitFor(() => requests === 0);
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete global[key];
      else global[key] = value;
    }
  }
};
