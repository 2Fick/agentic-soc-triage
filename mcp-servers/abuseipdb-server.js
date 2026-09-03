#!/usr/bin/env node
/**
 * AbuseIPDB MCP server.
 *
 * Exposes AbuseIPDB's IP reputation/abuse-report lookup as an MCP tool, so the triage agent
 * calls AbuseIPDB itself (tool-calling) instead of n8n wiring a fixed HTTP request node.
 *
 * Transport: Streamable HTTP, stateless (n8n's built-in "MCP Client Tool" node only speaks
 * network transports, SSE or HTTP Streamable, not stdio/command-line, so this runs as a
 * small persistent local HTTP service rather than a subprocess spawned per call).
 * Auth: reads the API key from the ABUSEIPDB_API_KEY environment variable.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { z } from "zod";

const PORT = process.env.PORT ?? 3002;
const API_BASE = "https://api.abuseipdb.com/api/v2";
const REQUEST_TIMEOUT_MS = 15_000;

function getApiKey() {
  const key = process.env.ABUSEIPDB_API_KEY;
  if (!key) {
    throw new Error(
      "ABUSEIPDB_API_KEY is not set. Configure it as an environment variable for this process " +
        "(get a free key at https://www.abuseipdb.com/account/api)."
    );
  }
  return key;
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

function createServer() {
  const server = new McpServer({ name: "abuseipdb-mcp", version: "1.0.0" });

  server.registerTool(
    "check_ip",
    {
      title: "AbuseIPDB IP abuse check",
      description:
        "Check an IPv4/IPv6 address against AbuseIPDB's community abuse reports: confidence " +
        "score (0-100) that the IP is malicious, total report count, ISP/usage type, and country.",
      inputSchema: {
        ip: z.string().describe("IPv4 or IPv6 address, e.g. 118.25.6.39"),
        maxAgeInDays: z
          .number()
          .int()
          .min(1)
          .max(365)
          .optional()
          .describe("Only consider reports from the last N days (default 90)"),
      },
    },
    async ({ ip, maxAgeInDays }) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const url = new URL(`${API_BASE}/check`);
        url.searchParams.set("ipAddress", ip);
        url.searchParams.set("maxAgeInDays", String(maxAgeInDays ?? 90));

        const res = await fetch(url, {
          headers: { Key: getApiKey(), Accept: "application/json" },
          signal: controller.signal,
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`AbuseIPDB API error ${res.status}: ${body.slice(0, 300)}`);
        }
        const { data } = await res.json();
        return textResult({
          ip: data.ipAddress,
          abuse_confidence_score: data.abuseConfidenceScore,
          total_reports: data.totalReports,
          num_distinct_reporters: data.numDistinctUsers,
          last_reported_at: data.lastReportedAt,
          is_whitelisted: data.isWhitelisted,
          country_code: data.countryCode,
          usage_type: data.usageType,
          isp: data.isp,
          domain: data.domain,
        });
      } catch (err) {
        return errorResult(err);
      } finally {
        clearTimeout(timeout);
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
  console.log(`AbuseIPDB MCP server listening on http://localhost:${PORT}/mcp`);
});
