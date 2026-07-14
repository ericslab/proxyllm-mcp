#!/usr/bin/env node
// MCP server for ProxyLLM (https://proxyllm.ai), the OpenAI-compatible LLM
// gateway. Free tools first (model catalog, savings calculator, key
// introspection); account tools ride the agent signup funnel documented at
// https://proxyllm.ai/auth.md. Error bodies are returned verbatim on purpose:
// ProxyLLM's 402 responses carry the checkout link and next step.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const GATEWAY = process.env.PROXYLLM_GATEWAY_URL ?? "https://api.proxyllm.ai";
const DASHBOARD = "https://proxyllm.ai";
const ENV_TOKEN = () => process.env.PROXYLLM_ACCOUNT_TOKEN;
const ENV_KEY = () => process.env.PROXYLLM_ROUTING_KEY;

async function call(url, { method = "GET", token, body } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text.slice(0, 2000) };
  }
  return { status: res.status, body: parsed };
}

function reply(payload) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

function needToken(given) {
  const token = given || ENV_TOKEN();
  if (!token) {
    return {
      missing: reply({
        error:
          "No account token. Pass account_token, or set PROXYLLM_ACCOUNT_TOKEN. No account yet? Call proxyllm_signup with your operator's email.",
      }),
    };
  }
  return { token };
}

const server = new McpServer({ name: "proxyllm", version: "1.0.0" });

// ---- free tools -----------------------------------------------------------

const TIERS = [
  { name: "ChatGPT Plus", cost: 20, capacity: 700 },
  { name: "ChatGPT Pro 5x", cost: 100, capacity: 3500 },
  { name: "ChatGPT Pro 20x", cost: 200, capacity: 14000 },
];
const PROXYLLM_FEE = 129;

server.registerTool(
  "proxyllm_savings_calculator",
  {
    title: "LLM spend: API vs subscription math",
    description:
      "Given a monthly OpenAI API bill in USD, returns the ChatGPT/Codex subscription tier that absorbs that workload through ProxyLLM Codex Hosted, the flat total (subscription + $129 fee), and the monthly savings. Free, no auth.",
    inputSchema: { monthly_openai_bill_usd: z.number().min(0) },
  },
  async ({ monthly_openai_bill_usd: bill }) => {
    let tier = TIERS.find((t) => bill <= t.capacity);
    if (!tier) {
      const seats = Math.ceil(bill / TIERS[2].capacity);
      tier = {
        name: `${seats}x ChatGPT Pro 20x`,
        cost: seats * TIERS[2].cost,
        capacity: seats * TIERS[2].capacity,
      };
    }
    const total = tier.cost + PROXYLLM_FEE;
    const savings = Math.max(0, bill - total);
    return reply({
      monthly_openai_bill_usd: bill,
      plan: tier.name,
      plan_cost_usd: tier.cost,
      plan_capacity_usd: tier.capacity,
      proxyllm_fee_usd: PROXYLLM_FEE,
      new_monthly_total_usd: total,
      monthly_savings_usd: savings,
      note:
        savings > 0
          ? `A $${bill} API bill becomes $${total}/mo flat. Capacity follows the plan's usage windows (planning estimate, not a guarantee); overflow falls back to a second account or your own API key.`
          : "Below the flat-cost break-even, ProxyLLM still gives one endpoint with fallback lanes, budgets, and request logs; the flat lane starts paying for itself as volume grows.",
      next: `${DASHBOARD}/auth.md`,
    });
  },
);

server.registerTool(
  "proxyllm_list_models",
  {
    title: "List models",
    description:
      "OpenAI-shaped model list from the gateway. No auth required; with a routing key it reflects that key's lanes, including the live Codex catalog.",
    inputSchema: { routing_key: z.string().optional() },
  },
  async ({ routing_key }) =>
    reply(
      await call(`${GATEWAY}/v1/models`, { token: routing_key || ENV_KEY() }),
    ),
);

server.registerTool(
  "proxyllm_introspect_key",
  {
    title: "Introspect a routing key",
    description:
      "GET /v1/key: the key's provider lanes, reachable models, whether a Codex subscription backs it, and monthly budget state. Authed by the routing key itself.",
    inputSchema: { routing_key: z.string().optional() },
  },
  async ({ routing_key }) => {
    const key = routing_key || ENV_KEY();
    if (!key)
      return reply({
        error: "Pass routing_key or set PROXYLLM_ROUTING_KEY (pllm_...).",
      });
    return reply(await call(`${GATEWAY}/v1/key`, { token: key }));
  },
);

// ---- signup funnel --------------------------------------------------------

server.registerTool(
  "proxyllm_signup",
  {
    title: "Create a ProxyLLM account (email OTP)",
    description:
      "Starts autonomous account creation: a 6-digit code is emailed to the operator's inbox (no captcha, no browser). New accounts are unpaid and are removed after 48 hours unless a human activates the membership. Follow with proxyllm_verify_signup.",
    inputSchema: {
      email: z.string().email().describe("The human operator's email"),
      source: z
        .string()
        .optional()
        .describe("Attribution slug; defaults to mcp"),
    },
  },
  async ({ email, source }) =>
    reply(
      await call(`${DASHBOARD}/api/auth?action=agent-signup`, {
        method: "POST",
        body: { email, source: source ?? "mcp" },
      }),
    ),
);

server.registerTool(
  "proxyllm_verify_signup",
  {
    title: "Verify the emailed code, receive the account token",
    description:
      "Exchanges the 6-digit code for an sk_ account token. The token is returned exactly once: store it (PROXYLLM_ACCOUNT_TOKEN). While the account is unpaid the response carries a checkout link to relay to the operator.",
    inputSchema: { email: z.string().email(), code: z.string() },
  },
  async ({ email, code }) =>
    reply(
      await call(`${DASHBOARD}/api/auth?action=agent-verify`, {
        method: "POST",
        body: { email, code },
      }),
    ),
);

server.registerTool(
  "proxyllm_account",
  {
    title: "Account state (poll until paid)",
    description:
      'GET /v1/organizations/me. Works while unpaid: plan is "free" plus a payment block until the operator activates the membership, then "pro". Poll this after handing over the checkout link.',
    inputSchema: { account_token: z.string().optional() },
  },
  async ({ account_token }) => {
    const t = needToken(account_token);
    if (t.missing) return t.missing;
    return reply(
      await call(`${GATEWAY}/v1/organizations/me`, { token: t.token }),
    );
  },
);

// ---- provisioning ---------------------------------------------------------

const providerLane = z.object({
  provider: z
    .string()
    .describe(
      "codex, bridge, or an API-key provider (openai, anthropic, openrouter, ...)",
    ),
  model: z.string().nullish(),
  credential_id: z.string().nullish(),
  codex_session_id: z.string().nullish(),
  bridge_instance_id: z.string().nullish(),
});

server.registerTool(
  "proxyllm_create_routing_key",
  {
    title: "Create a routing key",
    description:
      "Mints a pllm_ routing key (returned once) for OPENAI_API_KEY-style use against the gateway. Optionally wires the provider chain in the same call; discover wireable lane ids with proxyllm_list_routing_keys include_lanes.",
    inputSchema: {
      account_token: z.string().optional(),
      label: z.string().max(60).optional(),
      monthly_budget_usd: z.number().positive().optional(),
      mode: z.enum(["fallback", "classifier"]).optional(),
      providers: z.array(providerLane).max(5).optional(),
    },
  },
  async ({ account_token, ...body }) => {
    const t = needToken(account_token);
    if (t.missing) return t.missing;
    return reply(
      await call(`${GATEWAY}/v1/organizations/routing-keys`, {
        method: "POST",
        token: t.token,
        body,
      }),
    );
  },
);

server.registerTool(
  "proxyllm_list_routing_keys",
  {
    title: "List routing keys (and wireable lanes)",
    description:
      "Lists the account's routing keys. include_lanes adds the wireable lanes (connected Codex sessions, bridges, saved provider keys) with the ids provider chains reference.",
    inputSchema: {
      account_token: z.string().optional(),
      include_lanes: z.boolean().optional(),
    },
  },
  async ({ account_token, include_lanes }) => {
    const t = needToken(account_token);
    if (t.missing) return t.missing;
    const qs = include_lanes ? "?include=lanes" : "";
    return reply(
      await call(`${GATEWAY}/v1/organizations/routing-keys${qs}`, {
        token: t.token,
      }),
    );
  },
);

server.registerTool(
  "proxyllm_usage",
  {
    title: "30-day usage summary",
    description: "GET /v1/organizations/usage for the account.",
    inputSchema: { account_token: z.string().optional() },
  },
  async ({ account_token }) => {
    const t = needToken(account_token);
    if (t.missing) return t.missing;
    return reply(
      await call(`${GATEWAY}/v1/organizations/usage`, { token: t.token }),
    );
  },
);

await server.connect(new StdioServerTransport());
