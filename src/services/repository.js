const KEY = "waerme-cockpit-v1",
  TOKEN = "cockpit-server-token";
let csrf = "",
  authenticated = false,
  revision = 0,
  baseline = "",
  migrating = false;
export let lastError = "";
export const mentionState = { seen: [] };
export const authSettings = {
  production: false,
  passwordMinimum: 8,
  mfaEnabled: false,
};
function accept(result) {
  mentionState.seen = result.mentionSeen || [];
  if (result.security) Object.assign(authSettings, result.security);
  revision = result.revision;
  baseline = JSON.stringify(result.data);
  authenticated = result.authenticated ?? !!result.data?.users?.length;
  return result.data;
}
function request(method, url, payload) {
  if (method === "PUT" && url === "/api/state") {
    const session = request("GET", "/api/session");
    if (
      !session.authenticated ||
      session.accountId !== sessionStorage.getItem("cockpit-account")
    )
      throw Error(
        "Die Anmeldung wurde in einem anderen Tab geändert. Bitte diese Seite neu laden und mit dem gewünschten Konto anmelden.",
      );
  }
  const xhr = new XMLHttpRequest();
  xhr.open(method, url, false);
  xhr.setRequestHeader("Content-Type", "application/json");
  if (csrf) xhr.setRequestHeader("X-CSRF-Token", csrf);
  xhr.send(payload === undefined ? null : JSON.stringify(payload));
  csrf = xhr.getResponseHeader("X-CSRF-Token") || csrf;
  let result;
  try {
    result = JSON.parse(xhr.responseText);
  } catch {
    throw Error("Server nicht erreichbar.");
  }
  if (xhr.status < 200 || xhr.status >= 300)
    throw Object.assign(Error(result.error || "Speichern fehlgeschlagen."), {
      status: xhr.status,
    });
  return result;
}
export const repository = {
  load() {
    sessionStorage.removeItem(TOKEN);
    const result = request("GET", "/api/session");
    if (!result.authenticated)
      sessionStorage.setItem("cockpit-account", "signed-out");
    else if (result.accountId)
      sessionStorage.setItem("cockpit-account", result.accountId);
    return accept(result);
  },
  markMentionsSeen(ids) {
    const result = request("POST", "/api/mentions/seen", { ids });
    mentionState.seen = result.mentionSeen || [];
  },
  save(data) {
    if (JSON.stringify(data) === baseline) return;
    try {
      const result = request("PUT", "/api/state", {
        revision,
        data,
        migration: migrating,
      });
      Object.assign(data, accept(result));
      lastError = "";
    } catch (error) {
      lastError = error.message;
      throw error;
    }
  },
  authenticate(name, password, code) {
    try {
      const result = request("POST", "/api/login", { name, password, code });
      accept(result);
      lastError = "";
      return result.data.users.find(
        (u) => u.name.toLowerCase() === name.toLowerCase(),
      );
    } catch (error) {
      lastError = error.message;
      return null;
    }
  },
  changePassword(password, data, currentPassword) {
    try {
      const result = request("POST", "/api/password", {
        password,
        currentPassword,
      });
      Object.assign(data, accept(result));
      lastError = "";
      return (
        data.users.find(
          (u) => u.id === sessionStorage.getItem("cockpit-account"),
        ) ||
        data.users.find(
          (u) => u.id === sessionStorage.getItem("cockpit-pending-account"),
        )
      );
    } catch (error) {
      lastError = error.message;
      throw error;
    }
  },
  setupMfa(password, code) {
    return request("POST", "/api/mfa/setup", { password, code });
  },
  confirmMfa(code, data) {
    const result = request("POST", "/api/mfa/confirm", { code });
    Object.assign(data, accept(result));
    return result.recoveryCodes;
  },
  audit() {
    return request("GET", "/api/audit").events;
  },
  logout() {
    request("POST", "/api/logout", {});
    csrf = "";
    authenticated = false;
    sessionStorage.removeItem(TOKEN);
  },
  async refresh() {
    if (migrating || !authenticated) return null;
    const response = await fetch("/api/state", {
      headers: authHeaders(),
      cache: "no-store",
    });
    if (response.status === 401)
      throw Object.assign(Error("Bitte erneut anmelden."), { status: 401 });
    if (!response.ok) throw Error("Server nicht erreichbar.");
    const result = await response.json();
    if (result.accountId !== sessionStorage.getItem("cockpit-account"))
      throw Object.assign(
        Error(
          "Die Anmeldung wurde in einem anderen Tab ge\u00e4ndert. Bitte erneut anmelden.",
        ),
        { status: 401 },
      );
    if (document.querySelector("#modal")?.open) return null;
    const mentionsChanged =
      JSON.stringify(mentionState.seen) !==
      JSON.stringify(result.mentionSeen || []);
    return result.revision > revision || mentionsChanged
      ? accept(result)
      : null;
  },
  async migrateLocal(data, toast) {
    if (authSettings.production) return;
    if (migrating || localStorage.getItem("cockpit-migrated-v1")) return;
    migrating = true;
    let complete = true;
    try {
      let local;
      try {
        local = JSON.parse(localStorage.getItem(KEY));
      } catch {}
      if (
        local &&
        !localStorage.getItem("cockpit-metadata-migrated-v1") &&
        data.users.find(
          (u) => u.id === sessionStorage.getItem("cockpit-account"),
        )?.role === "Admin"
      ) {
        const before = structuredClone(data);
        for (const key of [
          "folders",
          "documents",
          "entries",
          "plants",
          "users",
        ]) {
          if (key === "entries" && data.logbookResetAt) continue;
          for (const item of local[key] || []) {
            if (!data[key].some((x) => x.id === item.id)) data[key].push(item);
          }
        }
        try {
          repository.save(data);
          localStorage.setItem("cockpit-metadata-migrated-v1", "done");
        } catch {
          Object.assign(data, before);
          complete = false;
        }
      }
      if (
        local?.documents?.some(
          (d) => !data.documents.some((x) => x.id === d.id),
        )
      )
        complete = false;
      const references = [
        ...data.documents,
        ...data.entries.flatMap((e) => e.attachments || []),
      ];
      for (const ref of references) {
        const response = await fetch("/api/files/" + ref.id, {
          method: "HEAD",
          headers: authHeaders(),
        });
        if (response.ok) continue;
        if (response.status !== 404) {
          complete = false;
          continue;
        }
        const file = await legacyFile(ref.id);
        if (file) {
          try {
            await putFile(ref.id, file);
          } catch {
            complete = false;
          }
        } else complete = false;
      }
      if (complete) {
        localStorage.setItem("cockpit-migrated-v1", "done");
        localStorage.removeItem(KEY);
      }
      if (references.length)
        toast(
          complete
            ? "Bisherige Dateien sind am Server verfügbar."
            : "Einige bisherige Dateien fehlen noch. Im ursprünglichen PC-Browser als Admin anmelden.",
        );
    } catch {
      toast("Übernahme unterbrochen. Beim nächsten Login erneut versuchen.");
    } finally {
      migrating = false;
    }
  },
};
const authHeaders = () => ({
  "X-CSRF-Token": csrf,
});
let legacyDb;
async function legacyFile(id) {
  try {
    legacyDb ??= await new Promise((resolve, reject) => {
      const r = indexedDB.open("waerme-files", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("files");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return await new Promise((resolve, reject) => {
      const request = legacyDb
        .transaction("files")
        .objectStore("files")
        .get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}
export async function putFile(id, file) {
  const response = await fetch("/api/files/" + id, {
    method: "PUT",
    headers: authHeaders(),
    body: file,
  });
  if (!response.ok)
    throw Error((await response.json()).error || "Upload fehlgeschlagen.");
}
export async function getFile(id) {
  const response = await fetch("/api/files/" + id, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!response.ok) throw Error("Datei nicht verfügbar.");
  return response.blob();
}
export async function deleteFile(id) {
  const response = await fetch("/api/files/" + id, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!response.ok) throw Error("Datei konnte nicht gelöscht werden.");
}
