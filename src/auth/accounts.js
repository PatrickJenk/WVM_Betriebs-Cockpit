import { canLead, isAdministrator } from "./roles.js";
export { isAdministrator } from "./roles.js";
// Rollen und Formulare; Anmeldung und Berechtigungen prüft der Server.
export const roles = ["Admin", "WVM", "EPC"];
export function initializeAccounts(data) {
  if (data.accountVersion !== 2) {
    data.users = [
      {
        id: "admin",
        name: "WVM-admin",
        initials: "ADM",
        role: "Admin",
        company: "WVM",
        mustChangePassword: false,
      },
      {
        id: "pj",
        name: "Patrick Jenk",
        initials: "PJ",
        role: "WVM",
        company: "WVM",
        mustChangePassword: true,
      },
      {
        id: "mm",
        name: "Marcel Maibach",
        initials: "MM",
        role: "EPC",
        company: "EPC",
        mustChangePassword: true,
      },
    ];
    data.accountVersion = 2;
    data.entries.forEach((e) => {
      if (["MS", "AK"].includes(e.createdBy)) e.createdBy = "MM";
    });
    globalThis.sessionStorage?.removeItem("cockpit-account");
  }
}
export function createAccounts({
  data,
  user,
  esc,
  options,
  show,
  modal,
  save,
  shell,
  toast,
  authenticate,
  changePassword,
  getAuthError,
  onLogin,
  onLogout,
  getAudit,
  getPasswordMinimum,
  editAccount,
  manageAccount,
}) {
  function setUser(account) {
    Object.assign(user, {
      leadership: undefined,
      systemRole: undefined,
      systemPermissions: [],
      backupAdmin: false,
      ...account,
    });
  }
  function enter(chosen) {
    sessionStorage.removeItem?.("cockpit-pending-account");
    setUser(chosen);
    sessionStorage.setItem("cockpit-account", chosen.id);
    shell();
    onLogin?.();
  }
  function login() {
    Object.assign(user, { id: null, name: "", initials: "", role: null });
    const pending =
      authenticate &&
      data.users.find(
        (u) =>
          u.id === sessionStorage.getItem("cockpit-account") &&
          u.mustChangePassword,
      );
    if (pending) return firstPassword(pending);
    document.querySelector("#app").innerHTML =
      `<main class="login-page"><section class="login-card"><div class="partner-logos login-logos"><img class="marzili" src="/assets/marzili-logo.png" alt="WVM"><img class="ewb" src="/assets/ewb-logo.png" alt="ewb"></div><h1>Betriebs Cockpit</h1><form id="login-form"><label>Benutzername<input name="username" autocomplete="username" required></label><label>Passwort<input name="password" type="password" autocomplete="current-password" required></label><label class="check-label"><input id="show-login-password" type="checkbox"> Passwort anzeigen</label><p id="login-error" role="alert"></p><button class="primary">Anmelden</button></form><p class="muted">Geschützter Zugang</p></section></main>`;
    document.querySelector("#show-login-password").onchange = (event) => {
      document.querySelector("#login-form").elements.password.type = event
        .target.checked
        ? "text"
        : "password";
    };
    document.querySelector("#login-form").onsubmit = (e) => {
      e.preventDefault();
      const f = e.currentTarget;
      const name = f.elements.username.value.trim();
      const password = f.elements.password.value;
      const chosen = authenticate
        ? authenticate(name, password)
        : data.users.find(
            (u) =>
              u.active !== false &&
              (u.initials.toLowerCase() === name.toLowerCase() ||
                (!u.initialsLogin &&
                  u.name.toLowerCase() === name.toLowerCase())) &&
              u.password === password,
          );
      if (!chosen) {
        document.querySelector("#login-error").textContent =
          getAuthError?.() || "Benutzername oder Passwort falsch.";
        return;
      }
      if (!chosen.mustChangePassword) return enter(chosen);
      firstPassword(chosen);
    };
  }
  function firstPassword(chosen) {
    const minimum = getPasswordMinimum?.() || 8;
    sessionStorage.setItem("cockpit-pending-account", chosen.id);
    document.querySelector("#app").innerHTML =
      `<main class="login-page"><section class="login-card"><h1>Eigenes Passwort festlegen</h1><p>${esc(chosen.name)} · Bitte ersetze das Startpasswort.</p><form id="password-form"><label>Neues Passwort<input name="password" type="password" minlength="${minimum}" autocomplete="new-password" required></label><label>Passwort wiederholen<input name="confirmation" type="password" autocomplete="new-password" required></label><label class="check-label"><input id="show-new-password" type="checkbox"> Passwort anzeigen</label><p id="password-error" role="alert"></p><button class="primary">Speichern und anmelden</button><button type="button" class="secondary" id="cancel-password-change">Abmelden</button></form></section></main>`;
    document.querySelector("#cancel-password-change").onclick = logout;
    document.querySelector("#show-new-password").onchange = (event) => {
      const form = document.querySelector("#password-form");
      form.elements.password.type = form.elements.confirmation.type = event
        .target.checked
        ? "text"
        : "password";
    };
    document.querySelector("#password-form").onsubmit = (event) => {
      event.preventDefault();
      const f = event.currentTarget,
        pw = f.elements.password.value;
      if (pw.length < minimum || pw !== f.elements.confirmation.value) {
        document.querySelector("#password-error").textContent =
          `Mindestens ${minimum} Zeichen, kein Startpasswort und identische Eingaben erforderlich.`;
        return;
      }
      if (changePassword) {
        try {
          const saved = changePassword(pw);
          if (!saved || saved.mustChangePassword)
            throw Error("Passwort konnte nicht gespeichert werden.");
          sessionStorage.removeItem("cockpit-pending-account");
          enter(saved);
          toast("Eigenes Passwort dauerhaft gespeichert.");
        } catch (error) {
          document.querySelector("#password-error").textContent =
            error.message ||
            "Passwort konnte nicht gespeichert werden. Bitte erneut versuchen.";
        }
        return;
      }
      const old = { ...chosen };
      Object.assign(chosen, { password: pw, mustChangePassword: false });
      if (!save()) {
        Object.assign(chosen, old);
        return;
      }
      enter(chosen);
    };
  }
  function logout() {
    try {
      onLogout?.();
    } catch (error) {
      toast(error.message || "Abmelden nicht möglich. Bitte erneut versuchen.");
      return;
    }
    if (authenticate)
      Object.assign(data, {
        users: [],
        entries: [],
        documents: [],
        folders: [],
        plants: [],
      });
    sessionStorage.setItem("cockpit-account", "signed-out");
    sessionStorage.removeItem?.("cockpit-pending-account");
    if (modal.open) modal.close();
    Object.assign(user, { id: null, name: "", initials: "", role: null });
    login();
  }
  function ownPassword() {
    show(
      '<div class="modal-heading"><h2>Mein Passwort ändern</h2><button class="close icon-button">✕</button></div><div class="form-body"><form id="own-password"><label>Aktuelles Passwort<input name="current" type="password" autocomplete="current-password" required></label><label>Neues Passwort (mindestens 12 Zeichen)<input name="password" type="password" minlength="12" autocomplete="new-password" required></label><label>Passwort wiederholen<input name="confirmation" type="password" autocomplete="new-password" required></label><p id="own-password-error" role="alert"></p><button class="primary">Passwort speichern</button></form></div>',
    );
    document.querySelector("#own-password").onsubmit = (event) => {
      event.preventDefault();
      const f = event.currentTarget;
      try {
        if (f.elements.password.value !== f.elements.confirmation.value)
          throw Error("Passwörter stimmen nicht überein.");
        const saved = changePassword(
          f.elements.password.value,
          f.elements.current.value,
        );
        Object.assign(user, saved);
        modal.close();
        shell();
        toast("Passwort gespeichert. Andere Sitzungen wurden abgemeldet.");
      } catch (error) {
        document.querySelector("#own-password-error").textContent =
          error.message;
      }
    };
  }
  function commit(action, message) {
    if (!isAdministrator(user)) return;
    const before = structuredClone(data.users);
    action();
    if (!save()) {
      data.users = before;
      return;
    }
    modal.close();
    manage();
    toast(message);
    return true;
  }
  function fields(account = {}) {
    const yesNo = (value) => options(["Ja", "Nein"], value ? "Ja" : "Nein");
    const roles = [
      ["roleUser", "User", account.userRole ?? true],
      ["roleLeadership", "Leitung", canLead(account)],
      ["roleAdmin", "Admin", isAdministrator(account)],
    ];
    return `<label>Name<input name="accountName" value="${esc(account.name || "")}" required maxlength="100"></label>
      <label>E-Mail<input name="email" type="email" value="${esc(account.email || "")}" required maxlength="254"></label>
      <label>Kürzel / Benutzername<input name="initials" value="${esc(account.initials || "")}" required maxlength="5"></label>
      <label>Unternehmen<select name="company" required><option value="">Unternehmen auswählen</option>${options(["WVM", "EPC"], account.company)}</select></label>
      <details class="account-role-picker full"><summary>Rollen</summary><fieldset aria-label="Rollen, mindestens eine auswählen">${roles.map(([name, label, checked]) => `<label class="check-label"><input name="${name}" type="checkbox" value="${label}" ${checked ? "checked" : ""}>${label}</label>`).join("")}</fieldset></details>
      ${account.id ? `<label>Aktiv<select name="active" required>${yesNo(account.active !== false)}</select></label>` : ""}`;
  }
  function bindRolePicker(form) {
    const picker = form.querySelector(".account-role-picker");
    const update = () => {
      const selected = [...picker.querySelectorAll("input:checked")].map(
        (input) => input.value,
      );
      picker.querySelector("summary").textContent =
        "Rollen · " + (selected.length ? selected.join(", ") : "Auswählen");
    };
    picker.onchange = update;
    update();
  }
  function formData(form, feedback) {
    const f = form.elements;
    if (
      !f.roleUser.checked &&
      !f.roleAdmin.checked &&
      !f.roleLeadership.checked
    ) {
      const picker = form.querySelector(".account-role-picker");
      picker.open = true;
      f.roleUser.focus();
      feedback.textContent = "Bitte mindestens eine Rolle auswählen.";
      return null;
    }
    return {
      name: f.accountName.value,
      initials: f.initials.value,
      email: f.email.value,
      company: f.company.value,
      userRole: f.roleUser.checked,
      admin: f.roleAdmin.checked,
      leadership: f.roleLeadership.checked,
      ...(f.active && { active: f.active.value === "Ja" }),
    };
  }
  async function saveAccount(path, method, values, button, feedback) {
    button.disabled = true;
    feedback.textContent =
      path.endsWith("/invitation") || !path
        ? "E-Mail wird versendet …"
        : "Änderungen werden gespeichert …";
    try {
      const result = await manageAccount(path, method, values);
      const message =
        result.delivery === "failed"
          ? `Konto gespeichert. ${result.deliveryError} Verwende «Erneut senden» bei diesem Konto.`
          : result.delivery === "sent"
            ? "Startpasswort an den Mailserver übergeben."
            : "Benutzer gespeichert.";
      if (modal.open && feedback.isConnected)
        manage(result.delivery === "failed" ? message : "");
      if (result.delivery !== "failed") toast(message);
    } catch (error) {
      feedback.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }
  function edit(account) {
    show(`<div class="modal-heading"><h2>Benutzer bearbeiten</h2><button class="close icon-button" aria-label="Schliessen">✕</button></div>
      <form id="account-edit"><div class="form-body form-grid">${fields(account)}<p class="full" id="account-edit-error" role="alert"></p></div>
      <div class="modal-footer"><button type="button" class="secondary" id="account-back">Zurück</button><button class="primary" type="submit">Speichern</button></div></form>`);
    const form = document.querySelector("#account-edit");
    bindRolePicker(form);
    document.querySelector("#account-back").onclick = () => manage();
    form.onsubmit = (event) => {
      event.preventDefault();
      const feedback = document.querySelector("#account-edit-error");
      const values = formData(form, feedback);
      if (!values) return;
      saveAccount(
        "/" + account.id,
        "PUT",
        values,
        form.querySelector('button[type="submit"]'),
        feedback,
      );
    };
  }
  let managementBack;
  function manage(message = "", back = managementBack) {
    if (!isAdministrator(user)) return;
    managementBack = back;
    const delivery = {
      sending: "Versand ausstehend",
      failed: "Versand fehlgeschlagen",
      required: "Versand erforderlich",
      sent: "Startpasswort versendet",
    };
    show(
      `<div class="modal-heading"><h2>Benutzer verwalten</h2><button class="close icon-button" aria-label="Schliessen">✕</button></div><div class="form-body">
      <form id="account-add" class="form-grid">${fields()}<p class="full">Das Startpasswort wird per E-Mail versendet und muss bei der ersten Anmeldung geändert werden.</p><button type="submit" class="primary full">Benutzer hinzufügen</button></form>
      <p id="account-error" role="alert">${esc(message)}</p><p><button class="secondary" id="security-audit">Sicherheitsprotokoll</button></p>
      <div class="account-list">${data.users
        .map(
          (u) =>
            `<div class="account-row"><span class="avatar">${esc(u.initials)}</span><div><b>${esc(u.name)}</b><small>${esc([u.company, !u.backupAdmin && u.userRole !== false ? "User" : "", u.backupAdmin ? "Backup-Admin" : u.systemRole === "main" ? "Hauptadministrator" : isAdministrator(u) ? "Admin" : "", canLead(u) ? "Leitung" : "", u.active === false ? "Inaktiv" : "", delivery[u.invitationStatus]].filter(Boolean).join(" · "))}</small></div>${
              u.backupAdmin
                ? ""
                : `<button class="secondary" data-edit-user="${esc(u.id)}">Bearbeiten</button>
      ${editAccount ? `<button class="secondary" data-user-settings="${esc(u.id)}">E-Mail &amp; Rechte</button>` : ""}
      ${u.id !== user.id ? `<button class="secondary" data-reset-user="${esc(u.id)}" ${u.active === false ? "disabled" : ""}>${["failed", "sending", "required"].includes(u.invitationStatus) ? "Erneut senden" : "Passwort zurücksetzen"}</button><button class="danger-button" data-delete-user="${esc(u.id)}">Löschen</button>` : ""}`
            }</div>`,
        )
        .join("")}</div></div>`,
      back,
    );
    const form = document.querySelector("#account-add");
    bindRolePicker(form);
    const feedback = document.querySelector("#account-error");
    form.onsubmit = (event) => {
      event.preventDefault();
      const values = formData(form, feedback);
      if (!values) return;
      saveAccount(
        "",
        "POST",
        values,
        form.querySelector('button[type="submit"]'),
        feedback,
      );
    };
    document.querySelector("#security-audit").onclick = () => {
      try {
        const events = getAudit();
        show(
          `<div class="modal-heading"><h2>Sicherheitsprotokoll</h2><button class="close icon-button" aria-label="Schliessen">✕</button></div><div class="form-body"><p>Die letzten 500 Ereignisse. Es werden keine Passwörter gespeichert.</p>${events.map((e) => `<p><b>${esc(e.at)} · ${esc(e.actor || "Unbekannt")}</b><br>${esc(e.action)}<br><small>${esc(e.details)}</small></p>`).join("")}</div>`,
          () => manage(),
        );
      } catch (error) {
        toast(error.message);
      }
    };
    document.querySelectorAll("[data-edit-user]").forEach((button) => {
      button.onclick = () =>
        edit(data.users.find((u) => u.id === button.dataset.editUser));
    });
    document.querySelectorAll("[data-user-settings]").forEach((button) => {
      button.onclick = () =>
        editAccount(button.dataset.userSettings, () => manage());
    });
    document.querySelectorAll("[data-reset-user]").forEach((button) => {
      button.onclick = () => {
        const account = data.users.find(
          (u) => u.id === button.dataset.resetUser,
        );
        if (!account.email) {
          feedback.textContent =
            "Bitte zuerst eine geschäftliche E-Mail-Adresse hinterlegen.";
          return;
        }
        if (
          confirm(
            `Neues Startpasswort an ${account.email} senden? Das bisherige Passwort wird dabei ungültig.`,
          )
        )
          saveAccount(
            "/" + account.id + "/invitation",
            "POST",
            { email: account.email },
            button,
            feedback,
          );
      };
    });
    document.querySelectorAll("[data-delete-user]").forEach((button) => {
      button.onclick = () => {
        const account = data.users.find(
          (u) => u.id === button.dataset.deleteUser,
        );
        if (
          confirm(
            `Benutzer ${account.name} löschen? Logbucheinträge bleiben erhalten.`,
          )
        )
          commit(() => {
            data.users = data.users.filter((u) => u.id !== account.id);
          }, "Benutzer gelöscht.");
      };
    });
  }
  function restore() {
    const id = sessionStorage.getItem("cockpit-account"),
      chosen = data.users.find(
        (u) => u.id === id && u.active !== false && !u.mustChangePassword,
      );
    if (!chosen) return false;
    setUser(chosen);
    return true;
  }
  return { login, logout, manage, restore, ownPassword };
}
