// Gemeinsamer Einstieg in bestehende Verwaltungsabläufe. Keine eigenen Daten.
export function createManagement({
  user,
  data,
  esc,
  show,
  modal,
  getState,
  structure,
  accounts,
  admin,
}) {
  function open() {
    if (!["Admin", "Administrator"].includes(user.role)) return;
    const current = data.structure.sites.find(
      (s) => s.id === getState().current,
    );
    show(
      `<div class="modal-heading"><div><h2>Cockpit verwalten</h2><p>Was möchtest du ergänzen oder bearbeiten?</p></div><button class="close icon-button" aria-label="Schliessen">×</button></div><div class="form-body management-body"><div class="management-grid"><button class="management-card" id="management-navigation"><strong>Verbünde & Standorte</strong><span>Anlegen, umbenennen und verschieben. Auch Unterkategorien verwalten.</span></button><button class="management-card" id="management-users"><strong>Benutzer & Zugänge</strong><span>Konten und Rollen verwalten oder Passwörter zurücksetzen.</span></button></div><section class="management-section"><h3>Standort verwalten</h3><p>Register und Anlagen gehören immer zu einem Standort.</p><label>Standort auswählen<select id="management-site"><option value="">Bitte auswählen</option>${data.structure.sites.map((s) => `<option value="${esc(s.id)}" ${s.id === current?.id ? "selected" : ""}>${esc(data.structure.networks.find((n) => n.id === s.heatNetworkId)?.name || "")} / ${esc(s.name)}</option>`).join("")}</select></label><div class="management-actions"><button class="secondary" id="management-tabs">Register verwalten</button><button class="secondary" id="management-plants">Anlagen verwalten</button></div><p class="muted">Ordner und Unterordner bearbeitest du direkt im jeweiligen Dokumentregister über «Neuer Ordner» oder das Stiftsymbol.</p></section><details class="management-help"><summary>Was kann ich selbst ändern?</summary><p>Verbünde, Standorte, Unterkategorien, Register, Ordner, Anlagen und Benutzer lassen sich ohne Programmierung pflegen. Neue Register sind zusätzliche Dokumentbereiche, beispielsweise für Arbeitsrapporte.</p><p>Neue Berechnungen, Formularfelder, Schnittstellen und Arbeitsabläufe benötigen eine technische Erweiterung.</p></details><details class="management-help"><summary>Übergabe & Hilfe bei einer Störung</summary><ol><li>Zwei verantwortliche Personen als Admin einweisen und die wichtigsten Abläufe gemeinsam ausprobieren.</li><li>Hosting-, Domain- und Sicherungszugänge beim Unternehmen hinterlegen. Passwörter nicht in Dokumentordnern oder Logbucheinträgen speichern.</li><li>Die zuständige IT lässt externe Sicherungen und eine Wiederherstellung prüfen und übernimmt Updates.</li></ol><p>Bei Problemen: Zeitpunkt, betroffene Ansicht, Arbeitsschritte und genaue Fehlermeldung festhalten. Bei einer Speichermeldung Eingaben vor dem Neuladen separat sichern. Keine Betriebsdaten löschen oder eine leere Datenbank anlegen.</p><p>Die IT prüft Server, Speicherplatz und Sicherungen. Technische Betreuung, Erreichbarkeit und Kosten für spätere Erweiterungen sollten bei der Übergabe schriftlich vereinbart werden.</p><a href="/api/handbook" target="_blank" rel="noopener">Benutzerhandbuch öffnen</a></details></div><div class="modal-footer"><button class="secondary" id="management-close">Schliessen</button></div>`,
    );
    const find = (id) => document.getElementById(id);
    find("management-navigation").onclick = structure.manage;
    find("management-users").onclick = accounts.manage;
    const select = find("management-site");
    const update = () => {
      find("management-tabs").disabled = !select.value;
      find("management-plants").disabled = !select.value;
    };
    select.onchange = update;
    update();
    find("management-tabs").onclick = () => {
      if (select.value) structure.manageTabs(select.value);
    };
    find("management-plants").onclick = () => {
      if (select.value) admin.plants(select.value);
    };
    find("management-close").onclick = () => modal.close();
  }
  return { open };
}
