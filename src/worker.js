// Eigene Login-Seite. Zugangsdaten stehen als Secrets im Cloudflare-Dashboard,
// nicht im Code:
//   SITE_PASSWORD  (Pflicht)  Passwort
//   SITE_USER      (optional) Anmeldename; ohne Wert zählt nur das Passwort
// Nach erfolgreichem Login setzt der Worker ein signiertes Cookie.

const encoder = new TextEncoder();
const LOGIN_PATH = "/__login";
const COOKIE_NAME = "session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;

function toHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function safeEqual(a, b) {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

function signingKey(env) {
  return `${env.SITE_USER || ""}\n${env.SITE_PASSWORD}`;
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

async function hasValidSession(request, env) {
  const cookies = request.headers.get("Cookie") || "";
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return false;
  const [expires, signature] = match[1].split(".");
  if (!expires || !signature || Number(expires) < Date.now() / 1000) return false;
  return safeEqual(signature, await sign(expires, signingKey(env)));
}

function loginPage(failed) {
  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>*</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex;
    align-items: center; justify-content: center;
    background: #111; font-family: system-ui, sans-serif;
  }
  form { display: flex; flex-direction: column; gap: 12px; width: min(320px, 86vw); }
  input, button {
    font: inherit; padding: 12px 14px; border-radius: 8px;
    border: 1px solid ${failed ? "#c44" : "#444"};
    background: #1c1c1c; color: #eee;
  }
  input:focus { outline: none; border-color: #888; }
  button { border-color: #444; background: #2a2a2a; cursor: pointer; }
  button:hover { background: #333; }
</style>
</head>
<body>
<form method="POST" action="${LOGIN_PATH}">
  <input name="username" type="text" placeholder="Anmeldename" autocomplete="username" autocapitalize="none" autofocus required />
  <input name="password" type="password" placeholder="Passwort" autocomplete="current-password" required />
  <button type="submit">Anmelden</button>
</form>
</body>
</html>`;
  return new Response(html, {
    status: 401,
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "no-store",
    },
  });
}

async function handleLogin(request, env) {
  let username = "";
  let password = "";
  try {
    const form = await request.formData();
    username = String(form.get("username") || "");
    password = String(form.get("password") || "");
  } catch {
    // ungültiger Body -> unten abgelehnt
  }

  const userOk = env.SITE_USER ? await safeEqual(username, env.SITE_USER) : true;
  const passOk = await safeEqual(password, env.SITE_PASSWORD);
  if (!(userOk && passOk)) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    return loginPage(true);
  }

  const expires = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
  const token = `${expires}.${await sign(expires, signingKey(env))}`;
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return new Response(null, {
    status: 303,
    headers: {
      Location: "/",
      "Cache-Control": "no-store",
      "Set-Cookie": `${COOKIE_NAME}=${token}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; SameSite=Lax${secure}`,
    },
  });
}

export default {
  async fetch(request, env) {
    if (!env.SITE_PASSWORD) {
      return new Response("Passwortschutz nicht konfiguriert", { status: 503 });
    }

    const url = new URL(request.url);
    if (url.pathname === LOGIN_PATH && request.method === "POST") {
      return handleLogin(request, env);
    }

    if (await hasValidSession(request, env)) {
      return env.ASSETS.fetch(request);
    }
    return loginPage(false);
  },
};
