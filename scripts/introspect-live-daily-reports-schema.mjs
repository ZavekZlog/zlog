const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env.local");
const OUT_PATH = path.join(ROOT, "docs", "LIVE_SCHEMA_DAILY_REPORTS.json");

const TARGET_TABLES = [
  "daily_reports",
  "report_labour",
  "report_plant",
  "report_photos",
  "projects",
];

function loadEnvLocal(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

function extractTableDef(definitions, tableName) {
  const def = definitions?.[tableName];
  if (!def) return { present: false };

  const required = new Set(def.required || []);
  const properties = def.properties || {};
  const columns = Object.entries(properties).map(([name, prop]) => {
    const col = {
      name,
      type: prop.type ?? null,
      format: prop.format ?? null,
      nullable:
        prop.nullable !== undefined
          ? prop.nullable
          : !required.has(name),
      required: required.has(name),
    };
    if (prop.description) col.description = prop.description;
    if (prop.default !== undefined) col.default = prop.default;
    if (prop.enum) col.enum = prop.enum;
    if (prop.items) col.items = prop.items;
    if (prop.$ref) col.$ref = prop.$ref;
    if (Array.isArray(prop.type)) col.type = prop.type;
    return col;
  });

  return {
    present: true,
    type: def.type ?? null,
    required: def.required || [],
    columns,
  };
}

async function tryFetch(url, headers, label) {
  try {
    const res = await fetch(url, { headers });
    const contentType = res.headers.get("content-type") || "";
    let body;
    const text = await res.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 2000);
    }
    return {
      label,
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      contentType,
      body,
    };
  } catch (err) {
    return {
      label,
      ok: false,
      status: null,
      statusText: null,
      error: String(err && err.message ? err.message : err),
    };
  }
}

async function main() {
  const env = loadEnvLocal(ENV_PATH);
  const URL = env.NEXT_PUBLIC_SUPABASE_URL;
  const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!URL || !ANON) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
    );
  }

  const host = (() => {
    try {
      return new URL(URL).host;
    } catch {
      return "(invalid URL)";
    }
  })();

  console.log(`Supabase host: ${host}`);
  console.log(`Anon key loaded: yes (length ${ANON.length}, not printed)`);

  const baseHeaders = {
    apikey: ANON,
    Authorization: `Bearer ${ANON}`,
  };

  const openapiHeaders = {
    ...baseHeaders,
    Accept: "application/openapi+json",
  };

  const result = {
    fetched_at: new Date().toISOString(),
    supabase_host: host,
    source: "PostgREST OpenAPI via GET /rest/v1/",
    openapi: null,
    tables: {},
    daily_reports_select: null,
    alternatives_tried: [],
    errors: [],
  };

  let openapi = null;
  const primary = await tryFetch(`${URL}/rest/v1/`, openapiHeaders, "GET /rest/v1/ Accept openapi+json");
  result.openapi = {
    status: primary.status,
    statusText: primary.statusText,
    contentType: primary.contentType,
    ok: primary.ok,
  };

  if (primary.ok && primary.body && typeof primary.body === "object") {
    openapi = primary.body;
  } else {
    result.errors.push({
      step: "openapi_primary",
      status: primary.status,
      statusText: primary.statusText,
      contentType: primary.contentType,
      body_preview:
        typeof primary.body === "string"
          ? primary.body.slice(0, 500)
          : primary.body,
      error: primary.error || null,
    });

    const alts = [
      {
        url: `${URL}/rest/v1/`,
        headers: { ...baseHeaders, Accept: "application/json" },
        label: "GET /rest/v1/ Accept application/json",
      },
      {
        url: `${URL}/rest/v1/?`,
        headers: openapiHeaders,
        label: "GET /rest/v1/? Accept openapi+json",
      },
      {
        url: `${URL}/rest/v1/`,
        headers: {
          ...baseHeaders,
          Accept: "application/openapi+json",
          Prefer: "return=representation",
        },
        label: "GET /rest/v1/ Prefer return=representation",
      },
    ];

    for (const alt of alts) {
      const altRes = await tryFetch(alt.url, alt.headers, alt.label);
      result.alternatives_tried.push({
        label: alt.label,
        status: altRes.status,
        statusText: altRes.statusText,
        contentType: altRes.contentType,
        ok: altRes.ok,
        error: altRes.error || null,
        body_preview:
          typeof altRes.body === "string"
            ? altRes.body.slice(0, 300)
            : altRes.body && typeof altRes.body === "object"
              ? {
                  keys: Object.keys(altRes.body).slice(0, 20),
                  info: altRes.body.info || undefined,
                  openapi: altRes.body.openapi || undefined,
                  swagger: altRes.body.swagger || undefined,
                }
              : altRes.body,
      });
      if (
        altRes.ok &&
        altRes.body &&
        typeof altRes.body === "object" &&
        (altRes.body.definitions ||
          altRes.body.components?.schemas ||
          altRes.body.paths)
      ) {
        openapi = altRes.body;
        result.openapi.recovered_via = alt.label;
        break;
      }
    }
  }

  if (openapi) {
    const definitions =
      openapi.definitions ||
      openapi.components?.schemas ||
      {};
    result.openapi.definition_keys_sample = Object.keys(definitions).slice(0, 50);
    result.openapi.definition_count = Object.keys(definitions).length;
    result.openapi.openapi_version =
      openapi.openapi || openapi.swagger || null;
    result.openapi.info = openapi.info || null;

    for (const table of TARGET_TABLES) {
      result.tables[table] = extractTableDef(definitions, table);
    }
  } else {
    result.errors.push({
      step: "openapi_all_failed",
      message: "Could not obtain OpenAPI schema from any endpoint tried",
    });
    for (const table of TARGET_TABLES) {
      result.tables[table] = { present: false, reason: "openapi_unavailable" };
    }
  }

  // Anon select probe
  const selectHeaders = {
    ...baseHeaders,
    Accept: "application/json",
    Prefer: "count=exact",
  };
  try {
    const selRes = await fetch(
      `${URL}/rest/v1/daily_reports?select=*&limit=1`,
      { headers: selectHeaders }
    );
    const contentRange = selRes.headers.get("content-range");
    const text = await selRes.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 1000);
    }
    const isEmptyArray = Array.isArray(body) && body.length === 0;
    const hasError =
      !selRes.ok ||
      (body && typeof body === "object" && !Array.isArray(body) && body.message);

    result.daily_reports_select = {
      status: selRes.status,
      statusText: selRes.statusText,
      contentRange,
      ok: selRes.ok,
      readable_with_anon: selRes.ok && Array.isArray(body),
      empty_result: isEmptyArray,
      likely_rls_empty: selRes.ok && isEmptyArray,
      error_body: hasError && !Array.isArray(body) ? body : null,
      row_sample_keys:
        Array.isArray(body) && body[0] && typeof body[0] === "object"
          ? Object.keys(body[0])
          : null,
      note: selRes.ok
        ? isEmptyArray
          ? "SELECT succeeded with empty array (typical when RLS allows policy but no visible rows for anon)"
          : "SELECT succeeded and returned row(s)"
        : "SELECT failed (permission/RLS or other error)",
    };
  } catch (err) {
    result.daily_reports_select = {
      ok: false,
      error: String(err && err.message ? err.message : err),
    };
    result.errors.push({ step: "daily_reports_select", error: String(err) });
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2), "utf8");
  console.log(`Wrote: ${OUT_PATH}`);

  // Concise summary for stdout
  const dr = result.tables.daily_reports;
  if (dr?.present && dr.columns) {
    console.log("\n=== daily_reports columns (live OpenAPI) ===");
    for (const c of dr.columns) {
      const nullStr = c.nullable ? "nullable" : "not null";
      const reqStr = c.required ? "required" : "optional";
      const fmt = c.format ? ` format=${c.format}` : "";
      console.log(
        `- ${c.name}: type=${JSON.stringify(c.type)}${fmt} (${nullStr}, ${reqStr})`
      );
    }
  } else {
    console.log("\ndaily_reports: NOT present in OpenAPI definitions");
  }

  console.log("\n=== related tables present? ===");
  for (const t of TARGET_TABLES) {
    const tab = result.tables[t];
    console.log(
      `- ${t}: ${tab?.present ? `yes (${tab.columns?.length ?? 0} cols)` : "no"}`
    );
  }

  console.log("\n=== anon select ===");
  console.log(JSON.stringify(result.daily_reports_select, null, 2));

  if (result.errors.length) {
    console.log("\n=== errors ===");
    console.log(JSON.stringify(result.errors, null, 2));
  }
}

main().catch((err) => {
  console.error("FATAL:", err.message || err);
  process.exit(1);
});
