import { isAdministrator } from "../auth/roles.js";

export function createManagement({
  user,
  show,
  structure,
  accounts,
  collaboration,
}) {
  function open() {
    if (!isAdministrator(user)) return;
    const mailAvailable = collaboration?.can("smtp");
    show(
      `<div class="modal-heading"><h2>Cockpit verwalten</h2><button type="button" class="close icon-button" aria-label="Schliessen">×</button></div>
      <div class="form-body"><div class="management-grid">
        <button type="button" class="management-card" id="management-navigation"><strong>Navigation</strong><span>Wärmeverbünde, Standorte, Unterkategorien und Register</span></button>
        ${mailAvailable ? '<button type="button" class="management-card" id="management-mail"><strong>E-Mail-Versand</strong><span>SMTP, Absender und Testversand</span></button>' : ""}
        <button type="button" class="management-card" id="management-users"><strong>Benutzerverwaltung</strong><span>Konten, Rollen und Einladungen</span></button>
      </div></div>`,
    );
    const find = (id) => document.getElementById(id);
    find("management-navigation").onclick = () => structure.manage(open);
    if (mailAvailable)
      find("management-mail").onclick = () => collaboration.mail(open);
    find("management-users").onclick = () => accounts.manage("", open);
  }
  return { open };
}
