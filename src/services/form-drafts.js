export function formDraft(userId, form, id) {
  const key = "cockpit-draft:" + JSON.stringify([userId, form, id]);
  return {
    read() {
      try {
        return JSON.parse(sessionStorage.getItem(key));
      } catch {
        return null;
      }
    },
    write(value) {
      try {
        sessionStorage.setItem(key, JSON.stringify(value));
      } catch {
        // The open form still holds its values if storage is unavailable.
      }
    },
    clear() {
      try {
        sessionStorage.removeItem(key);
      } catch {
        // Storage may be disabled.
      }
    },
  };
}
