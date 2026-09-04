# MCP servers: VirusTotal and AbuseIPDB

Two small [MCP](https://modelcontextprotocol.io/) servers written against the official SDK, which
the triage agent calls as tools during analysis. No hardcoded HTTP node in the workflow: the agent
decides when to use them.

- `virustotal-server.js` (port 3001): `lookup_ip`, `lookup_domain`, `lookup_file_hash`
- `abuseipdb-server.js` (port 3002): `check_ip`

**Transport: stateless Streamable HTTP**, each exposed at `http://localhost:<port>/mcp`. Not stdio,
because n8n's built-in MCP Client Tool node only speaks network transports (SSE or Streamable HTTP)
and cannot spawn a subprocess. So these run as long-lived local services rather than per-call
children.

Both trim the vendor response down to the fields that matter for a triage decision. VirusTotal in
particular returns very large payloads with per-engine breakdowns, which would bloat the agent's
context for no benefit.

## Install and run

```bash
npm install

# Load VT_API_KEY / ABUSEIPDB_API_KEY from ../.env, then start both servers
node virustotal-server.js   # http://localhost:3001/mcp
node abuseipdb-server.js    # http://localhost:3002/mcp
```

## API keys

- VirusTotal: https://www.virustotal.com/gui/my-apikey (free tier, about 4 requests per minute)
- AbuseIPDB: https://www.abuseipdb.com/account/api (free tier, 1000 requests per day)

Each server reads its key from an environment variable (`VT_API_KEY`, `ABUSEIPDB_API_KEY`, see
`../.env`), never from the code.

In n8n, each MCP Client Tool node just points at `http://localhost:<port>/mcp` with authentication
set to none, since the servers are bound locally. No key is entered on the n8n side: they stay in
the environment of the MCP servers themselves.

## Manual test, without n8n

```bash
curl -s -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"lookup_ip","arguments":{"ip":"8.8.8.8"}}}'
```

Expected: a JSON result with `malicious_votes`, `community_reputation`, and similar fields.
