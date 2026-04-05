const AUTH_REALM = "FamilyAdvisor Private";

function unauthorized() {
  return new Response("Autenticazione richiesta", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${AUTH_REALM}", charset="UTF-8"`,
      "Cache-Control": "no-store",
    },
  });
}

function decodeBasicAuth(header) {
  if (!header || !header.startsWith("Basic ")) {
    return null;
  }

  try {
    const decoded = atob(header.slice(6));
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex === -1) {
      return null;
    }

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const expectedUsername = env.BASIC_AUTH_USER;
    const expectedPassword = env.BASIC_AUTH_PASS;

    if (!expectedUsername || !expectedPassword) {
      return unauthorized();
    }

    const credentials = decodeBasicAuth(request.headers.get("Authorization"));
    if (
      !credentials ||
      credentials.username !== expectedUsername ||
      credentials.password !== expectedPassword
    ) {
      return unauthorized();
    }

    const assetResponse = await env.ASSETS.fetch(request);
    const response = new Response(assetResponse.body, assetResponse);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  },
};
