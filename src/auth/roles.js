export const isAdministrator = (user) =>
  ["Admin", "Administrator"].includes(user?.role);

export const canManageMain = (user) =>
  isAdministrator(user) &&
  (user.systemRole === "main" || user.backupAdmin === true);

// Older accounts retain their access until an administrator assigns a role.
export const canLead = (user) =>
  user?.leadership ?? (user?.role === "WVM" || isAdministrator(user));
