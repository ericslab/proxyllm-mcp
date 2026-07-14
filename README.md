# proxyllm-mcp

MCP server for [ProxyLLM](https://proxyllm.ai), the OpenAI-compatible LLM gateway. It gives any MCP client (Claude Code, Claude Desktop, Cursor, Cline, Windsurf, OpenClaw) live model catalogs, plan-savings math, routing-key introspection and provisioning, and an account signup flow an agent can complete on its own: email OTP in, `sk_` account token out, HTTP 402 with a checkout link until a human activates the membership.

## Install

Claude Code:

```bash
claude mcp add proxyllm -- npx -y proxyllm-mcp
```

Cursor, Cline, Claude Desktop, or any client that takes a JSON server entry:

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

No configuration is required to start. Two optional environment variables save passing tokens per call:

- `PROXYLLM_ACCOUNT_TOKEN`: an `sk_` (read+write) or `rk_` (read-only) account token for the management tools.
- `PROXYLLM_ROUTING_KEY`: a `pllm_` routing key for key introspection and key-scoped model lists.

## Tools

Free, no account needed:

- `proxyllm_savings_calculator`: monthly OpenAI API bill in, subscription tier + flat total + monthly savings out.
- `proxyllm_list_models`: OpenAI-shaped model list from the gateway.
- `proxyllm_introspect_key`: what a routing key can do (lanes, models, budget, whether a Codex subscription backs it).

Account flow (an agent can run this end to end):

- `proxyllm_signup`: emails a 6-digit code to the operator's inbox. No captcha.
- `proxyllm_verify_signup`: exchanges the code for the `sk_` account token (returned once).
- `proxyllm_account`: account state; while unpaid it carries the checkout link and a message written to be relayed to the operator. Poll until `plan` is `"pro"`.

Provisioning (paid accounts):

- `proxyllm_create_routing_key`: mints a `pllm_` key, optionally wiring its provider chain (Codex subscription seats, self-hosted Claude Code bridges, metered API keys) in the same call.
- `proxyllm_list_routing_keys`: keys, plus the wireable lane ids with `include_lanes`.
- `proxyllm_usage`: 30-day usage summary.

Unpaid accounts get `402 payment_required` on management tools by design; the body names the price ($129/mo flat), the checkout URL, and the 48-hour removal deadline for never-activated accounts. Error bodies are returned verbatim because they contain the next step.

## Links

- Agent auth manifest: <https://proxyllm.ai/auth.md>
- OpenAPI: <https://proxyllm.ai/openapi.json>
- Docs: <https://proxyllm.ai/docs/api>
- Agent card: <https://proxyllm.ai/.well-known/agent-card.json>

MIT license.
