// One-time online activation. The old admin password alone NEVER grants access.
// A separate, 256-bit setup code is needed before any account/data API is exposed.
const http = require("node:http");
const crypto = require("node:crypto");

function hash(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return salt + ":" + crypto.scryptSync(password, salt, 32).toString("hex");
}
async function matches(password, stored) {
  if (!/^[a-f0-9]{32}:[a-f0-9]{64}$/.test(stored || "")) return false;
  const [salt, value] = stored.split(":");
  const derived = await new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, 32, (e, result) =>
      e ? reject(e) : resolve(result),
    ),
  );
  return crypto.timingSafeEqual(derived, Buffer.from(value, "hex"));
}
function pending(store) {
  if (
    !store.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='hosting_setup'",
      )
      .get()
  )
    return null;
  return (
    store.db
      .prepare("SELECT * FROM hosting_setup WHERE id=1 AND used=0")
      .get() || null
  );
}
function json(res, status, value) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
}
function page(nonce) {
  return `<!doctype html><html lang="de-CH"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cockpit sicher einrichten</title><style>body{font:16px system-ui,sans-serif;background:#eef3f3;color:#15363b;margin:0;padding:32px 16px}main{max-width:540px;margin:auto;background:white;padding:28px;border-radius:16px;box-shadow:0 12px 40px #15363b18}h1{font-size:25px}p{line-height:1.6}label{display:block;margin:18px 0}input{display:block;box-sizing:border-box;width:100%;padding:12px;margin-top:6px;border:1px solid #91a7ab;border-radius:7px;font:inherit}button{padding:12px 18px;background:#14565b;color:white;border:0;border-radius:7px;font:inherit;cursor:pointer}button:disabled{opacity:.5}#error{color:#a31919}a{color:#14565b}</style></head><body><main><h1>Betriebs Cockpit sicher einrichten</h1><p>Bevor die Betriebsdaten freigegeben werden, ändere bitte das Passwort von <strong>WVM-admin</strong>. Andere Benutzer kannst du danach unter «Cockpit verwalten» neu erstellen.</p><form id="setup"><label>Einrichtungscode aus deiner lokalen Einrichtungsdatei<input name="setupCode" type="password" autocomplete="off" required maxlength="100"></label><label>Bisheriges Passwort von WVM-admin<input name="currentPassword" type="password" autocomplete="current-password" required maxlength="128"></label><label>Neues Admin-Passwort – mindestens 12, besser 20 Zeichen<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><label>Neues Passwort wiederholen<input name="confirmation" type="password" autocomplete="new-password" required maxlength="128"></label><p id="error" role="alert"></p><button>Passwort ändern und Cockpit freigeben</button></form><p>Ohne Einrichtungscode ist der Zugriff gesperrt. Dein neues Passwort wird nur als geschützter Hash gespeichert.</p></main><script nonce="${nonce}">document.getElementById('setup').onsubmit=async function(event){event.preventDefault();const f=event.currentTarget,e=document.getElementById('error'),b=f.querySelector('button');e.textContent='';if(f.elements.password.value!==f.elements.confirmation.value){e.textContent='Die neuen Passwörter stimmen nicht überein.';return;}b.disabled=true;try{const r=await fetch('/api/hosting-setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({setupCode:f.elements.setupCode.value,currentPassword:f.elements.currentPassword.value,password:f.elements.password.value})});const result=await r.json();if(!r.ok)throw Error(result.error||'Einrichtung fehlgeschlagen.');f.reset();f.innerHTML='<p>Das neue Admin-Passwort wurde gespeichert. Du kannst dich jetzt als WVM-admin mit dem neuen Passwort anmelden.</p><a href="/">Cockpit öffnen</a>';setTimeout(()=>location.replace('/'),1500);}catch(error){e.textContent=error.message;b.disabled=false;}};</script></body></html>`;
}
function start(store, onReady) {
  const setup = pending(store);
  const active = store.read().data.users.filter((u) => u.active !== false);
  if (
    !setup ||
    active.length !== 1 ||
    active[0].id !== setup.admin_id ||
    active[0].name !== "WVM-admin"
  )
    throw Error(
      "Geschützte Ersteinrichtung fehlt. Ein neues vollständiges Infomaniak-Paket erstellen.",
    );
  if (setup.expires < Date.now())
    throw Error(
      "Einrichtungscode abgelaufen. Ein neues Erstinstallationspaket erstellen.",
    );
  let busy = false,
    completed = false;
  const server = http.createServer(
    { requestTimeout: 30000, headersTimeout: 15000 },
    async (req, res) => {
      store.headers(res);
      res.setHeader("Cache-Control", "no-store");
      try {
        store.guard(req);
        const url = req.url.split("?")[0];
        if (completed) {
          json(res, 503, {
            error: "Cockpit wird gestartet. Bitte kurz warten.",
          });
          return;
        }
        if (req.method === "GET" && (url === "/" || url === "/index.html")) {
          const nonce = crypto.randomBytes(18).toString("base64");
          res.setHeader(
            "Content-Security-Policy",
            `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
          );
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(page(nonce));
          return;
        }
        if (url !== "/api/hosting-setup" || req.method !== "POST") {
          json(res, 403, {
            error: "Bitte zuerst die geschützte Ersteinrichtung abschliessen.",
          });
          return;
        }
        if (busy)
          throw store.error(
            "Einrichtung wird gerade geprüft. Bitte erneut versuchen.",
            429,
          );
        busy = true;
        try {
          store.rate(req, "hosting-setup");
          const chunks = [];
          let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 8192) throw store.error("Anfrage zu gross.", 413);
            chunks.push(chunk);
          }
          let input;
          try {
            input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          } catch {
            throw store.error("Ungültige Eingabe.");
          }
          if (
            !input ||
            typeof input.setupCode !== "string" ||
            typeof input.currentPassword !== "string" ||
            input.currentPassword.length > 128
          )
            throw store.error(
              "Einrichtungscode oder bisheriges Passwort ungültig.",
              403,
            );
          const currentSetup = pending(store);
          if (
            !currentSetup ||
            currentSetup.expires < Date.now() ||
            !crypto.timingSafeEqual(
              crypto.createHash("sha256").update(input.setupCode).digest(),
              Buffer.from(currentSetup.digest, "hex"),
            )
          )
            throw store.error(
              "Einrichtungscode oder bisheriges Passwort ungültig.",
              403,
            );
          const admin = store
            .read()
            .data.users.find(
              (u) => u.id === setup.admin_id && u.active !== false,
            );
          if (
            !admin ||
            !(await matches(input.currentPassword, admin.passwordHash))
          )
            throw store.error(
              "Einrichtungscode oder bisheriges Passwort ungültig.",
              403,
            );
          store.passwordPolicy(input.password);
          if (await matches(input.password, admin.passwordHash))
            throw store.error(
              "Bitte ein neues, anderes Admin-Passwort festlegen.",
            );
          store.locked(() => {
            const state = store.read(),
              latest = state.data.users.find((u) => u.id === admin.id);
            if (!pending(store) || latest.passwordHash !== admin.passwordHash)
              throw store.error(
                "Einrichtung wurde zwischenzeitlich geändert.",
                409,
              );
            latest.passwordHash = hash(input.password);
            latest.passwordPolicyMinimum = 12;
            latest.mustChangePassword = false;
            latest.hostingPasswordChangeRequired = false;
            state.revision++;
            store.persist(state);
            store.db
              .prepare(
                "UPDATE hosting_setup SET used=1,digest='',expires=0 WHERE id=1",
              )
              .run();
            store.db.exec("DELETE FROM sessions;");
            store.audit(latest, "hosting.setup.completed");
          });
          completed = true;
          res.once("finish", () => {
            server.close(() => onReady());
            server.closeIdleConnections();
          });
          json(res, 200, { ok: true });
        } finally {
          busy = false;
        }
      } catch (error) {
        json(res, error.status || 500, {
          error: error.status
            ? error.message
            : "Einrichtung fehlgeschlagen. Bitte Serverprotokoll prüfen.",
        });
        if (!error.status) console.error(error.message);
      }
    },
  );
  server.on("error", (error) => {
    console.error("Ersteinrichtung: " + error.message);
    process.exitCode = 1;
  });
  server.listen(
    Number(process.env.PORT || 4173),
    process.env.HOST || "0.0.0.0",
    () =>
      console.log(
        "Geschützte Cockpit-Ersteinrichtung bereit. WVM-admin muss ein neues Passwort festlegen.",
      ),
  );
  return server;
}
module.exports = { start, pending };
