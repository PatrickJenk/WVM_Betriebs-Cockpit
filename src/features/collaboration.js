import { repository, authHeaders } from "../services/repository.js";
import { uuid } from "../services/ids.js";
import { canLead, canManageMain, isAdministrator } from "../auth/roles.js";
export function createCollaboration({
  data,
  user,
  esc,
  show,
  modal,
  toast,
  save,
}) {
  const admin = () => isAdministrator(user);
  const can = (p) =>
    admin() && (canManageMain(user) || user.systemPermissions?.includes(p));
  const call = (method, path, payload) =>
    repository.call(method, "/api/" + path, payload);
  const field = (name, label, value = "", type = "text") =>
    `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" maxlength="500"></label>`;
  const header = (title) =>
    `<div class="modal-heading"><h2>${title}</h2><button type="button" class="close icon-button" aria-label="Schliessen">×</button></div>`;
  const error = (e) => {
    const p = document.querySelector("#extension-error");
    if (p) p.textContent = e.message;
    else toast(e.message);
  };
  function contacts() {
    const root = document.querySelector("#content");
    const previousQuery =
      document.querySelector("#contact-search")?.value || "";
    let list;
    try {
      list = call("GET", "contacts").contacts;
    } catch (e) {
      root.textContent = e.message;
      return;
    }
    root.innerHTML = `<div class="page-heading"><h1>Betriebspersonal</h1>${canLead(user) ? '<button class="primary" id="contact-add">+ Neuer Kontakt</button>' : ""}</div><label>Kontakte durchsuchen<input id="contact-search" type="search" placeholder="Name, Funktion, E-Mail oder Erreichbarkeit"></label><div id="contact-groups"></div>`;
    document.querySelector("#contact-search").value = previousQuery;
    const draw = () => {
      const query = document
        .querySelector("#contact-search")
        .value.toLocaleLowerCase("de-CH");
      document.querySelector("#contact-groups").innerHTML = [
        ["WVM", "WVM – Wärmeverbund Marzili Bern AG"],
        ["EWB", "EWB – Energie Wasser Bern"],
      ]
        .map(
          ([org, title]) =>
            `<section class="contact-section"><h2>${title}</h2><div class="table-wrap"><table class="contact-table"><thead><tr><th>Person</th><th>Funktion / Zuständigkeit</th><th>E-Mail</th><th>Telefon</th><th>Erreichbarkeit</th>${canLead(user) ? "<th>Verwalten</th>" : ""}</tr></thead><tbody>${
              list
                .filter(
                  (c) =>
                    c.organization === org &&
                    [c.name, c.function, c.email, c.phone, c.availability]
                      .join(" ")
                      .toLocaleLowerCase("de-CH")
                      .includes(query),
                )
                .sort((a, b) => a.name.localeCompare(b.name, "de"))
                .map(
                  (c) =>
                    `<tr><td><div class="contact-person">${c.imageId ? `<img class="contact-photo" alt="Profilbild ${esc(c.name)}" src="/api/contacts/images/${encodeURIComponent(c.imageId)}">` : `<span class="contact-photo avatar">${esc(c.name.slice(0, 2))}</span>`}<strong>${esc(c.name)}</strong></div></td><td>${esc(c.function)}</td><td><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></td><td><a href="tel:${esc(c.phone.replace(/[^+\d]/g, ""))}">${esc(c.phone)}</a></td><td>${esc(c.availability)}</td>${canLead(user) ? `<td><button class="secondary" data-contact-edit="${esc(c.id)}">Bearbeiten</button> <button class="danger-button" data-contact-delete="${esc(c.id)}">Löschen</button></td>` : ""}</tr>`,
                )
                .join("") ||
              `<tr><td colspan="6">Keine Kontakte gefunden.</td></tr>`
            }</tbody></table></div></section>`,
        )
        .join("");
      document
        .querySelectorAll("[data-contact-edit]")
        .forEach(
          (b) =>
            (b.onclick = () =>
              contactForm(list.find((c) => c.id === b.dataset.contactEdit))),
        );
      document.querySelectorAll("[data-contact-delete]").forEach(
        (b) =>
          (b.onclick = () => {
            const c = list.find((c) => c.id === b.dataset.contactDelete);
            if (!confirm(`Kontakt ${c.name} löschen?`)) return;
            try {
              call("DELETE", "contacts/" + c.id, { version: c.version });
              contacts();
              toast("Kontakt gelöscht.");
            } catch (e) {
              toast(e.message);
            }
          }),
      );
    };
    document.querySelector("#contact-search").oninput = draw;
    if (canLead(user))
      document.querySelector("#contact-add").onclick = () => contactForm();
    draw();
  }
  function contactForm(c = {}) {
    show(
      `<form id="contact-form">${header(c.id ? "Kontakt bearbeiten" : "Neuer Kontakt")}<div class="form-body form-grid"><label>Organisation<select name="organization"><option value="WVM">WVM</option><option value="EWB" ${c.organization === "EWB" ? "selected" : ""}>EWB</option></select></label>${field("name", "Vorname und Nachname", c.name)}${field("function", "Funktion / Zuständigkeit", c.function)}${field("email", "E-Mail-Adresse", c.email, "email")}${field("phone", "Telefonnummer", c.phone, "tel")}${field("availability", "Erreichbarkeit", c.availability)}<label>Profilbild (PNG, JPEG, WebP, max. 2 MB)<input name="photo" type="file" accept="image/png,image/jpeg,image/webp"></label><label class="check-label"><input name="removePhoto" type="checkbox">Profilbild entfernen</label><p id="extension-error" role="alert"></p></div><div class="modal-footer"><button class="primary">Speichern</button></div></form>`,
    );
    const f = document.querySelector("#contact-form");
    for (const fieldName of [
      "organization",
      "name",
      "function",
      "email",
      "phone",
      "availability",
    ])
      f.elements[fieldName].required = true;
    f.onsubmit = async (e) => {
      e.preventDefault();
      const button = f.querySelector("button.primary");
      button.disabled = true;
      try {
        const p = Object.fromEntries(new FormData(f));
        p.version = c.version || 0;
        p.imageId = f.elements.removePhoto.checked ? "" : c.imageId || "";
        const file = f.elements.photo.files[0];
        if (file) {
          if (file.size > 2 * 1024 * 1024)
            throw Error("Bild ist grösser als 2 MB.");
          const response = await fetch("/api/contacts/images", {
            method: "POST",
            headers: authHeaders(),
            body: file,
          });
          const result = await response.json();
          if (!response.ok) throw Error(result.error);
          p.imageId = result.id;
        }
        delete p.photo;
        call("PUT", "contacts/" + (c.id || uuid()), p);
        modal.close();
        contacts();
        toast("Kontakt gespeichert.");
      } catch (e) {
        error(e);
      } finally {
        button.disabled = false;
      }
    };
  }
  function mail(back) {
    if (!can("smtp")) return;
    let result;
    try {
      result = call("GET", "mail");
    } catch (e) {
      toast(e.message);
      return;
    }
    const s = result.settings;
    show(
      `${header("E-Mail-Einstellungen")}<div class="form-body"><form id="mail-form" class="form-grid">${field("host", "SMTP-Host", s.host)}${field("port", "SMTP-Port", s.port || 587, "number")}${field("username", "SMTP-Benutzername", s.username)}<label>SMTP-Passwort ${s.passwordSet ? "(gespeichert; leer lassen zum Beibehalten)" : ""}<input name="password" type="password" autocomplete="new-password"></label><label class="check-label"><input name="clearPassword" type="checkbox">Gespeichertes Passwort entfernen</label><label>Verschlüsselung<select name="encryption"><option value="starttls">STARTTLS</option><option value="tls" ${s.encryption === "tls" ? "selected" : ""}>SSL/TLS</option></select></label>${field("senderName", "Absendername", s.senderName)}${field("senderEmail", "Absenderadresse", s.senderEmail, "email")}${field("replyTo", "Reply-To-Adresse", s.replyTo, "email")}${field("baseUrl", "Basis-URL der Webseite", s.baseUrl || location.origin, "url")}<label class="check-label"><input name="enabled" type="checkbox" ${s.enabled ? "checked" : ""}>Automatischen Mailversand aktivieren</label><fieldset class="full"><legend>Vorlage für Logbuch-E-Mails</legend><label>Betreff<input name="templateSubject" maxlength="250" value="${esc(s.template?.subject || "")}"></label><label>Nachrichtentext<textarea name="templateBody" rows="8" maxlength="12000">${esc(s.template?.body || "")}</textarea></label><label>Signatur<textarea name="templateSignature" rows="3" maxlength="1500">${esc(s.template?.signature || "")}</textarea></label><p class="muted">Platzhalter: <code>{{art}}</code>, <code>{{titel}}</code>, <code>{{standort}}</code>, <code>{{ersteller}}</code>, <code>{{faellig}}</code>, <code>{{beschreibung}}</code>, <code>{{link}}</code>.</p><button type="button" class="secondary" id="mail-preview">Vorschau anzeigen</button><div id="mail-preview-output" hidden><strong></strong><p class="prewrap"></p></div></fieldset><button class="primary">Einstellungen speichern</button></form><hr><form id="mail-test"><label>Empfänger für Test E-Mail<input name="to" type="email" required></label><p>${result.deliveryBlocked ? "Der Versand ist in dieser Umgebung gesperrt. Du kannst die SMTP-Einstellungen speichern." : "Der Test verwendet die gespeicherten Einstellungen und funktioniert auch bei deaktiviertem automatischem Versand."}</p><button class="secondary" ${result.deliveryBlocked ? "disabled" : ""}>Test E-Mail senden</button></form><p id="extension-error" role="status"></p><p>Versandstatus: ${result.status.map((r) => `${esc(r.status)}`).join(" · ") || "Noch keine Benachrichtigungen"}</p></div>`,
      back,
    );
    const mailForm = document.querySelector("#mail-form");
    const template = () => ({
      subject: mailForm.elements.templateSubject.value,
      body: mailForm.elements.templateBody.value,
      signature: mailForm.elements.templateSignature.value,
    });
    document.querySelector("#mail-preview").onclick = () => {
      try {
        const sample = call("POST", "mail/preview", { template: template() });
        const output = document.querySelector("#mail-preview-output");
        output.querySelector("strong").textContent = sample.subject;
        output.querySelector("p").textContent = sample.text;
        output.hidden = false;
      } catch (e) {
        error(e);
      }
    };
    mailForm.onsubmit = (e) => {
      e.preventDefault();
      try {
        const f = e.currentTarget,
          p = Object.fromEntries(new FormData(f));
        p.enabled = f.elements.enabled.checked;
        p.clearPassword = f.elements.clearPassword.checked;
        p.port = Number(p.port);
        p.template = template();
        delete p.templateSubject;
        delete p.templateBody;
        delete p.templateSignature;
        call("PUT", "mail", p);
        document.querySelector("#extension-error").textContent =
          "Einstellungen gespeichert.";
        f.elements.password.value = "";
        f.elements.clearPassword.checked = false;
      } catch (e) {
        error(e);
      }
    };
    document.querySelector("#mail-test").onsubmit = async (e) => {
      e.preventDefault();
      const f = e.currentTarget,
        b = f.querySelector("button");
      b.disabled = true;
      try {
        const response = await fetch("/api/mail/test", {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ to: f.elements.to.value }),
        });
        const p = await response.json();
        if (!response.ok) throw Error(p.error);
        document.querySelector("#extension-error").textContent =
          "Test E-Mail erfolgreich versendet.";
      } catch (e) {
        error(e);
      } finally {
        b.disabled = false;
      }
    };
  }
  function account(id, back) {
    let u = data.users.find((u) => u.id === id);
    if (!u || u.backupAdmin || !admin()) return;
    const manageRoles =
      can("roles") && (u.systemRole !== "main" || canManageMain(user));
    show(
      `<form id="account-details">${header("Benutzereinstellungen: " + esc(u.name))}<div class="form-body form-grid">${field("email", "E-Mail-Adresse", u.email, "email")}<label class="check-label"><input name="notificationsEnabled" type="checkbox" ${u.notificationsEnabled !== false ? "checked" : ""}>E-Mail-Benachrichtigungen aktivieren</label>${manageRoles ? `<label>Betriebsrolle<select name="role">${["Admin", "Administrator", "WVM", "EPC"].map((r) => `<option ${u.role === r ? "selected" : ""}>${r}</option>`).join("")}</select></label><label>Systemrolle<select name="systemRole"><option value="user">Benutzer</option><option value="admin" ${adminUser(u) ? "selected" : ""}>Administrator</option>${canManageMain(user) ? `<option value="main" ${u.systemRole === "main" ? "selected" : ""}>Hauptadministrator</option>` : ""}</select></label><label class="check-label"><input name="smtp" type="checkbox" ${u.systemPermissions?.includes("smtp") ? "checked" : ""}>SMTP-Konfiguration erlauben</label><label class="check-label"><input name="roles" type="checkbox" ${u.systemPermissions?.includes("roles") ? "checked" : ""}>Rollenverwaltung erlauben</label>` : `<p>Rolle: ${esc(u.systemRole === "main" ? "Hauptadministrator" : u.role)}</p>`}<p>WVM/EPC bestimmen weiterhin die betrieblichen Zugriffsrechte. Administratoren besitzen die bestehenden Verwaltungsrechte.</p><p id="extension-error" role="alert"></p></div><div class="modal-footer"><button class="primary">Speichern</button></div></form>`,
      back,
    );
    const f = document.querySelector("#account-details");
    f.onsubmit = (e) => {
      e.preventDefault();
      u = data.users.find((u) => u.id === id);
      const before = structuredClone(data.users);
      try {
        u.email = f.elements.email.value;
        u.notificationsEnabled = f.elements.notificationsEnabled.checked;
        if (manageRoles) {
          u.role = f.elements.role.value;
          u.systemRole = f.elements.systemRole.value;
          if (
            (u.systemRole === "main" || u.systemRole === "admin") &&
            !adminUser(u)
          )
            u.role = "Administrator";
          else if (u.systemRole === "user" && adminUser(u))
            u.role = ["WVM", "EPC"].includes(u.company) ? u.company : "WVM";
          u.systemPermissions = ["smtp", "roles"].filter(
            (p) => f.elements[p].checked,
          );
        }
        if (!save()) {
          data.users = before;
          error(
            Error(
              "Speichern fehlgeschlagen. Eingaben prüfen und erneut versuchen.",
            ),
          );
          return;
        }
        modal.close();
        if (id === user.id) {
          const current = data.users.find((p) => p.id === id);
          Object.assign(user, current, {
            systemRole: current.systemRole,
            systemPermissions: current.systemPermissions || [],
          });
        }
        toast("Benutzereinstellungen gespeichert.");
      } catch (e) {
        data.users = before;
        error(e);
      }
    };
  }
  function adminUser(u) {
    return ["Admin", "Administrator"].includes(u.role);
  }
  return { contacts, mail, account, can };
}
