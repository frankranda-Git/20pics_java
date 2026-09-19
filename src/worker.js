// Passwortschutz per HTTP Basic Auth. Das Passwort steht als Secret
// SITE_PASSWORD im Cloudflare-Dashboard, nicht im Code.

const encoder = new TextEncoder();

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

function unauthorized() {
  return new Response("*", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="*", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
}

export default {
  async fetch(request, env) {
    if (!env.SITE_PASSWORD) {
      return new Response("Passwortschutz nicht konfiguriert", { status: 503 });
    }

    const header = request.headers.get("Authorization") || "";
    if (header.startsWith("Basic ")) {
      try {
        const decoded = new TextDecoder().decode(
          Uint8Array.from(atob(header.slice(6)), (c) => c.charCodeAt(0))
        );
        // Benutzername wird ignoriert, nur das Passwort zählt.
        const password = decoded.slice(decoded.indexOf(":") + 1);
        if (await safeEqual(password, env.SITE_PASSWORD)) {
          return env.ASSETS.fetch(request);
        }
      } catch {
        // ungültiger Header -> unten 401
      }
    }
    return unauthorized();
  },
};
