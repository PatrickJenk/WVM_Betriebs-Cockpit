import { uuid } from "../services/ids.js";
// Rollen und Formulare; Anmeldung und Berechtigungen prüft der Server.
export const roles = ["Admin", "WVM", "EPC"];
export const isAdministrator = (u) =>
  ["Admin", "Administrator"].includes(u?.role);
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
  setupMfa,
  confirmMfa,
  getAudit,
  getPasswordMinimum,
  getMfaEnabled,
  onBeforeLogin,
}) {
  function enter(chosen) {
    if (chosen.mustSetupMfa) {
      document.querySelector("#app").textContent =
        "Bitte zuerst die Zwei-Faktor-Anmeldung einrichten.";
      setupOwnMfa(() => enter(data.users.find((u) => u.id === chosen.id)));
      return;
    }
    Object.assign(user, chosen);
    sessionStorage.setItem("cockpit-account", chosen.id);
    onBeforeLogin?.();
    shell();
    onLogin?.();
  }
  function login() {
    Object.assign(user, { id: null, name: "", initials: "", role: null });
    document.querySelector("#app").innerHTML =
      `<main class="login-page"><section class="login-card"><div class="partner-logos login-logos"><img class="marzili" src="/assets/marzili-logo.png" alt="WVM"><img class="ewb" src="/assets/ewb-logo.png" alt="ewb"></div><h1>Betriebs Cockpit</h1><form id="login-form"><label>Benutzername<input name="username" autocomplete="username" required></label><label>Passwort<input name="password" type="password" autocomplete="current-password" required></label><label class="check-label"><input id="show-login-password" type="checkbox"> Passwort anzeigen</label><p id="login-error" role="alert"></p><button class="primary">Anmelden</button></form><p class="muted">Geschützter Zugang</p></section></main>`;
    if (getMfaEnabled?.())
      document
        .querySelector("#login-form")
        .insertAdjacentHTML?.(
          "afterbegin",
          '<label>Zwei-Faktor-Code (falls eingerichtet)<input name="code" autocomplete="one-time-code" placeholder="Authenticator-Code oder Wiederherstellungscode"></label>',
        );
    document.querySelector("#show-login-password").onchange = (event) => {
      document.querySelector("#login-form").elements.password.type = event
        .target.checked
        ? "text"
        : "password";
    };
    document.querySelector("#login-form").onsubmit = (e) => {
      e.preventDefault();
      const f = e.currentTarget;
      const authenticated = authenticate
        ? authenticate(
            f.elements.username.value.trim(),
            f.elements.password.value,
            f.elements.code?.value,
          )
        : null;
      const chosen = data.users.find(
        (u) =>
          u.active !== false &&
          u.name.toLowerCase() ===
            f.elements.username.value.trim().toLowerCase() &&
          (authenticate
            ? authenticated && u.id === authenticated.id
            : u.password === f.elements.password.value),
      );
      if (!chosen) {
        document.querySelector("#login-error").textContent =
          getAuthError?.() || "Benutzername oder Passwort falsch.";
        return;
      }
      if (!chosen.mustChangePassword) return enter(chosen);
      const minimum = getPasswordMinimum?.() || 8;
      sessionStorage.setItem("cockpit-pending-account", chosen.id);
      document.querySelector("#app").innerHTML =
        `<main class="login-page"><section class="login-card"><h1>Eigenes Passwort festlegen</h1><p>${esc(chosen.name)} · Bitte ersetze das Startpasswort.</p><form id="password-form"><label>Neues Passwort<input name="password" type="password" minlength="${minimum}" autocomplete="new-password" required></label><label>Passwort wiederholen<input name="confirmation" type="password" autocomplete="new-password" required></label><label class="check-label"><input id="show-new-password" type="checkbox"> Passwort anzeigen</label><p id="password-error" role="alert"></p><button class="primary">Speichern und anmelden</button></form></section></main>`;
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
        if (
          pw.length < minimum ||
          pw === "ChangeMe123" ||
          pw !== f.elements.confirmation.value
        ) {
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
  function temporaryPassword() {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    return Array.from(
      bytes,
      (b) =>
        "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#"[b % 58],
    ).join("");
  }
  function setupOwnMfa(afterEnabled) {
    show(
      '<div class="modal-heading"><h2>Zwei-Faktor-Anmeldung</h2><button class="close icon-button">✕</button></div><div class="form-body"><p>Für das öffentliche Hosting erforderlich. Eine Authenticator-App bereithalten.</p><form id="mfa-setup"><label>Aktuelles Passwort<input name="password" type="password" autocomplete="current-password" required></label><label>Aktueller Zwei-Faktor-Code (falls bereits eingerichtet)<input name="code" autocomplete="one-time-code"></label><p id="mfa-error" role="alert"></p><button class="primary">Einrichtung starten</button></form></div>',
    );
    document.querySelector("#mfa-setup").onsubmit = (event) => {
      event.preventDefault();
      const f = event.currentTarget;
      try {
        const result = setupMfa(
          f.elements.password.value,
          f.elements.code.value,
        );
        show(
          `<div class="modal-heading"><h2>Authenticator verbinden</h2><button class="close icon-button">✕</button></div><div class="form-body"><p>In der Authenticator-App manuell einen zeitbasierten Eintrag für Wärme-Cockpit hinzufügen. Diesen Schlüssel eintragen:</p><p><code>${esc(result.secret)}</code></p><form id="mfa-confirm"><label>Sechsstelliger Code aus der App<input name="code" inputmode="numeric" pattern="[0-9]{6}" autocomplete="one-time-code" required></label><p id="mfa-error" role="alert"></p><button class="primary">Aktivieren</button></form></div>`,
        );
        document.querySelector("#mfa-confirm").onsubmit = (event) => {
          event.preventDefault();
          try {
            const codes = confirmMfa(event.currentTarget.elements.code.value);
            afterEnabled?.();
            show(
              `<div class="modal-heading"><h2>Zwei-Faktor-Anmeldung aktiv</h2></div><div class="form-body"><p>Diese einmal verwendbaren Wiederherstellungscodes jetzt sicher und getrennt vom Passwort aufbewahren. Sie werden nur einmal angezeigt.</p><pre>${codes.map(esc).join("\n")}</pre></div><div class="modal-footer"><button class="close primary">Gesichert – Schliessen</button></div>`,
            );
          } catch (error) {
            document.querySelector("#mfa-error").textContent = error.message;
          }
        };
      } catch (error) {
        document.querySelector("#mfa-error").textContent = error.message;
      }
    };
  }
  function manage() {
    if (!isAdministrator(user)) return;
    show(
      `<div class="modal-heading"><h2>Benutzer verwalten</h2><button class="close icon-button" aria-label="Schliessen">✕</button></div><div class="form-body"><form id="account-add" class="form-grid"><label>Benutzername / Name<input name="accountName" required maxlength="100"></label><label>Kürzel<input name="initials" required maxlength="5"></label><label>Rolle / Unternehmen<select name="role">${options(roles, "WVM")}</select></label><p>Zufälliges Startpasswort · Beim ersten Login ändern.</p><button class="primary full">Benutzer hinzufügen</button></form><p id="account-error" role="alert"></p><div class="account-list">${data.users.map((u) => `<div class="account-row"><span class="avatar">${esc(u.initials)}</span><div><b>${esc(u.name)}</b><small>${esc(u.role)}</small></div><button class="secondary" data-reset-user="${esc(u.id)}">Passwort zurücksetzen</button>${u.id !== user.id ? `<button class="danger-button" data-delete-user="${esc(u.id)}">Löschen</button>` : ""}</div>`).join("")}</div></div>`,
    );
    const accountForm = document.querySelector("#account-add");
    const note = accountForm.querySelector?.("p");
    if (note)
      note.textContent =
        "Ein zufälliges Startpasswort wird einmal angezeigt. Beim ersten Login ändern.";
    accountForm.insertAdjacentHTML?.(
      "afterend",
      '<p><button class="secondary" id="security-mfa">Meine Zwei-Faktor-Anmeldung einrichten</button> <button class="secondary" id="security-audit">Sicherheitsprotokoll</button></p>',
    );
    const mfaButton = document.querySelector("#security-mfa"),
      auditButton = document.querySelector("#security-audit");
    if (!getMfaEnabled?.()) mfaButton?.remove?.();
    if (mfaButton) mfaButton.onclick = () => setupOwnMfa();
    if (auditButton)
      auditButton.onclick = () => {
        try {
          const events = getAudit();
          show(
            `<div class="modal-heading"><h2>Sicherheitsprotokoll</h2><button class="close icon-button">✕</button></div><div class="form-body"><p>Die letzten 500 Ereignisse. Es werden keine Passwörter gespeichert.</p>${events.map((e) => `<p><b>${esc(e.at)} · ${esc(e.actor || "Unbekannt")}</b><br>${esc(e.action)}<br><small>${esc(e.details)}</small></p>`).join("")}</div>`,
          );
        } catch (error) {
          toast(error.message);
        }
      };
    document.querySelector("#account-add").onsubmit = (e) => {
      e.preventDefault();
      const f = e.currentTarget,
        name = f.elements.accountName.value.trim(),
        initials = f.elements.initials.value.trim().toUpperCase(),
        role = f.elements.role.value;
      const startPassword = temporaryPassword();
      if (!name || !initials || !roles.includes(role)) return;
      if (
        data.users.some(
          (u) =>
            u.name.toLowerCase() === name.toLowerCase() ||
            u.initials.toUpperCase() === initials,
        )
      ) {
        document.querySelector("#account-error").textContent =
          "Name oder Kürzel bereits vergeben.";
        return;
      }
      const committed = commit(
        () =>
          data.users.push({
            id: uuid(),
            name,
            initials,
            role,
            company: role === "Admin" ? "WVM" : role,
            password: startPassword,
            mustChangePassword: true,
          }),
        "Benutzer hinzugefügt.",
      );
      if (committed && !data.users.find((u) => u.name === name)?.password)
        show(
          `<div class="modal-heading"><h2>Startpasswort für ${esc(name)}</h2></div><div class="form-body"><p>Dieses Passwort wird nur jetzt angezeigt. Sicher weitergeben; beim ersten Login muss es geändert werden.</p><p><code>${esc(startPassword)}</code></p></div><div class="modal-footer"><button class="close primary">Schliessen</button></div>`,
        );
    };
    document.querySelectorAll("[data-reset-user]").forEach(
      (b) =>
        (b.onclick = () => {
          const u = data.users.find((u) => u.id === b.dataset.resetUser);
          const startPassword = temporaryPassword();
          const committed = commit(
            () =>
              Object.assign(u, {
                password: startPassword,
                mustChangePassword: true,
              }),
            "Passwort zurückgesetzt.",
          );
          if (!committed) return;
          if (u.id === user.id) {
            alert("Neues Startpasswort (nur jetzt sichtbar): " + startPassword);
            logout();
          } else if (!data.users.find((x) => x.id === u.id)?.password)
            show(
              `<div class="modal-heading"><h2>Neues Startpasswort für ${esc(u.name)}</h2></div><div class="form-body"><p>Nur jetzt sichtbar. Beim nächsten Login ändern.</p><p><code>${esc(startPassword)}</code></p></div><div class="modal-footer"><button class="close primary">Schliessen</button></div>`,
            );
        }),
    );
    document.querySelectorAll("[data-delete-user]").forEach(
      (b) =>
        (b.onclick = () => {
          const u = data.users.find((u) => u.id === b.dataset.deleteUser);
          if (!u || u.id === user.id) return;
          if (
            !confirm(
              `Benutzer ${u.name} löschen? Logbucheinträge bleiben erhalten.`,
            )
          )
            return;
          commit(() => {
            data.users = data.users.filter((x) => x.id !== u.id);
          }, "Benutzer gelöscht.");
        }),
    );
  }
  function restore() {
    const id = sessionStorage.getItem("cockpit-account"),
      chosen = data.users.find(
        (u) =>
          u.id === id &&
          u.active !== false &&
          !u.mustChangePassword &&
          !u.mustSetupMfa,
      );
    if (!chosen) return false;
    Object.assign(user, chosen);
    return true;
  }
  return { login, logout, manage, restore, ownPassword };
}
