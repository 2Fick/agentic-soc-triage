#!/usr/bin/env node
/**
 * VirusTotal MCP server.
 *
 * Exposes VirusTotal IP/domain/file-hash reputation lookups as MCP tools, so the triage agent
 * calls VirusTotal itself (tool-calling) instead of n8n wiring a fixed HTTP request node.
 *
 * Transport: Streamable HTTP, stateless (n8n's built-in "MCP Client Tool" node only speaks
 * network transports, SSE or HTTP Streamable, not stdio/command-line, so this runs as a
 * small persistent local HTTP service rather than a subprocess spawned per call).
 * Auth: reads the API key from the VT_API_KEY environment variable, never hardcode it here.
 *
 * VirusTotal's public API v3 responses are large (per-engine breakdowns, full metadata); each
 * tool below trims the response down to what a SOC triage decision actually needs, both to keep
 * the agent's context small and to avoid leaking the full response verbatim into the LLM prompt.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { z } from "zod";

const PORT = process.env.PORT ?? 3001;
const API_BASE = "https://www.virustotal.com/api/v3";
const REQUEST_TIMEOUT_MS = 15_000;

function getApiKey() {
  const key = process.env.VT_API_KEY;
  if (!key) {
    throw new Error(
      "VT_API_KEY is not set. Configure it as an environment variable for this process " +
        "(get a free key at https://www.virustotal.com/gui/my-apikey)."
    );
  }
  return key;
}

async function vtGet(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { "x-apikey": getApiKey() },
      signal: controller.signal,
    });
    if (res.status === 404) {
      return { notFound: true };
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`VirusTotal API error ${res.status}: ${body.slice(0, 300)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

function textResult(obj) {
  return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] };
}

function errorResult(err) {
  return {
    content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
    isError: true,
  };
}

/** Extracts the fields relevant to a triage verdict out of VT's full attributes object. */
function summarizeAttributes(attributes, extraFields = {}) {
  const stats = attributes.last_analysis_stats ?? {};
  return {
    malicious_votes: stats.malicious ?? 0,
    suspicious_votes: stats.suspicious ?? 0,
    harmless_votes: stats.harmless ?? 0,
    undetected_votes: stats.undetected ?? 0,
    community_reputation: attributes.reputation ?? 0,
    ...extraFields,
  };
}

/** Builds a fresh McpServer with all tools registered (see docs/server.md "stateless" pattern:
 * a new server+transport pair per request avoids cross-request state bleed). */
function createServer() {
  const server = new McpServer({ name: "virustotal-mcp", version: "1.0.0" });

  server.registerTool(
    "lookup_ip",
    {
      title: "VirusTotal IP reputation",
      description:
        "Look up an IPv4/IPv6 address on VirusTotal: how many security vendors flag it as " +
        "malicious/suspicious, its community reputation score, owning AS/country.",
      inputSchema: { ip: z.string().describe("IPv4 or IPv6 address, e.g. 8.8.8.8") },
    },
    async ({ ip }) => {
      try {
        const data = await vtGet(`/ip_addresses/${encodeURIComponent(ip)}`);
        if (data.notFound) return textResult({ ip, found: false });
        const a = data.data.attributes;
        return textResult({
          ip,
          found: true,
          ...summarizeAttributes(a, { country: a.country, as_owner: a.as_owner, asn: a.asn }),
        });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "lookup_domain",
    {
      title: "VirusTotal domain reputation",
      description:
        "Look up a domain name on VirusTotal: vendor detections, community reputation score, " +
        "registrar/creation date.",
      inputSchema: { domain: z.string().describe("Domain name, e.g. example.com") },
    },
    async ({ domain }) => {
      try {
        const data = await vtGet(`/domains/${encodeURIComponent(domain)}`);
        if (data.notFound) return textResult({ domain, found: false });
        const a = data.data.attributes;
        return textResult({
          domain,
          found: true,
          ...summarizeAttributes(a, {
            categories: a.categories,
            creation_date: a.creation_date,
          }),
        });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "lookup_file_hash",
    {
      title: "VirusTotal file hash reputation",
      description:
        "Look up a file by its MD5, SHA1 or SHA256 hash on VirusTotal: vendor detections, file " +
        "type, and whether VirusTotal has ever seen this file before (a hash unknown to VT is " +
        "itself a signal for a custom/novel binary).",
      inputSchema: { hash: z.string().describe("MD5, SHA1 or SHA256 hash of the file") },
    },
    async ({ hash }) => {
      try {
        const data = await vtGet(`/files/${encodeURIComponent(hash)}`);
        if (data.notFound) return textResult({ hash, found: false, note: "Unknown to VirusTotal" });
        const a = data.data.attributes;
        return textResult({
          hash,
          found: true,
          ...summarizeAttributes(a, {
            type_description: a.type_description,
            meaningful_name: a.meaningful_name,
            first_submission_date: a.first_submission_date,
          }),
        });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  return server;
}

const app = createMcpExpressApp();

app.post("/mcp", async (req, res) => {
  try {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on("close", () => {
      transport.close();
      server.close();
    });
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  }
});

for (const method of ["get", "delete"]) {
  app[method]("/mcp", (_req, res) => {
    res.writeHead(405).end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null }));
  });
}

app.listen(PORT, () => {
  console.log(`VirusTotal MCP server listening on http://localhost:${PORT}/mcp`);
});
