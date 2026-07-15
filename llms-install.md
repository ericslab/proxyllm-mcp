# Installing proxyllm-mcp

This is a stdio MCP server published to npm as `proxyllm-mcp`. It runs with `npx`, so there is nothing to clone or build.

## Config

Add this to your MCP client config (Cline, Claude Desktop, etc.):

```json
{
  "mcpServers": {
    "proxyllm": {
      "command": "npx",
      "args": ["-y", "proxyllm-mcp"]
    }
  }
}
```

That is enough to use the read-only tools: `proxyllm_savings_calculator`, `proxyllm_list_models`, and `proxyllm_signup` / `proxyllm_verify_signup` (which an agent uses to create its own gateway account by email OTP).

## Optional environment

The account and provisioning tools act on a specific account. Provide a token if you already have one:

```json
{
  "mcpServers": {
    "proxyllm": {
      "command": "npx",
      "args": ["-y", "proxyllm-mcp"],
      "env": {
        "PROXYLLM_ACCOUNT_TOKEN": "sk_...",
        "PROXYLLM_ROUTING_KEY": "pllm_..."
      }
    }
  }
}
```

- `PROXYLLM_ACCOUNT_TOKEN` (`sk_...`): enables `proxyllm_account`, `proxyllm_create_routing_key`, `proxyllm_list_routing_keys`, `proxyllm_usage`. Mint one with the `proxyllm_signup` tool or at https://proxyllm.ai/auth.md. No token is needed just to start the server.
- `PROXYLLM_ROUTING_KEY` (`pllm_...`): enables `proxyllm_introspect_key`.

No API keys, no secrets beyond the token you supply. Full agent-facing docs: https://proxyllm.ai/auth.md.
