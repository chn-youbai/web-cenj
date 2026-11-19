import type { Env } from "../_lib/env";
import { DEFAULT_CORS_HEADERS, noContentOptions } from "../_lib/http";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const origin = url.origin;
  const assetUrl = `${origin}/data/gaokao_2050.json`;

  try {
    const resp = context.env.ASSETS
      ? await context.env.ASSETS.fetch(new Request(assetUrl))
      : await fetch(assetUrl);

    if (resp?.ok) {
      const data = await resp.json();
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=86400, s-maxage=604800",
          ...DEFAULT_CORS_HEADERS,
        },
      });
    }
  } catch {
    // fallback to redirect
  }

  return Response.redirect(assetUrl, 302);
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return noContentOptions("GET, OPTIONS");
};
