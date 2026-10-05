import { z } from "zod";

/** Runtime authentication is a separate transport, never a tool or channel. */
export const connectionPurposeTransportSchema = z.discriminatedUnion(
  "connectionPurpose",
  [
    z.object({
      connectionPurpose: z.literal("tool"),
      transport: z.enum(["mcp_remote", "rest_api", "local_stdio"]),
    }),
    z.object({
      connectionPurpose: z.literal("channel"),
      transport: z.enum(["chat_sdk", "rest_api"]),
      config: z.object({ provider: z.string().optional() }).passthrough().optional(),
    }).refine(
      (connection) => connection.transport === "chat_sdk" || connection.config?.provider === "agentmail",
      { message: "REST channel connections require the AgentMail provider", path: ["config", "provider"] },
    ),
    z.object({
      connectionPurpose: z.literal("ai"),
      transport: z.literal("runtime_auth"),
    }),
  ],
);
export type ConnectionPurposeTransport = z.infer<
  typeof connectionPurposeTransportSchema
>;

export const AI_PROVIDERS = [
  "anthropic",
  "openai",
  "openrouter",
  "xai",
] as const;
export const aiProviderSchema = z.enum(AI_PROVIDERS);
export const aiAuthMethodSchema = z.enum(["subscription", "api_key", "third_party_api"]);
/** OpenAI-compatible wire protocol spoken to a third-party endpoint. */
export const aiThirdPartyWireApiSchema = z.enum(["responses", "chat"]);
export type AiProvider = z.infer<typeof aiProviderSchema>;
export type AiAuthMethod = z.infer<typeof aiAuthMethodSchema>;
const requirement = { provider: aiProviderSchema, method: aiAuthMethodSchema };
export const aiConnectionBindingSchema = z.discriminatedUnion("mode", [
  z.object({
    provider: aiProviderSchema,
    // Retained on the wire for older servers during rolling upgrades. The
    // responsible user's provider default determines the actual run method.
    method: aiAuthMethodSchema,
    mode: z.literal("responsible_user"),
  }).strict(),
  z
    .object({
      ...requirement,
      mode: z.literal("shared"),
      connectionId: z.string().uuid(),
      grantId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      ...requirement,
      // Legacy wire format only; human access still applies. New UI never creates it.
      mode: z.literal("delegated"),
      connectionId: z.string().uuid(),
      grantId: z.string().uuid(),
    })
    .strict(),
]);
export type AiConnectionBinding = z.infer<typeof aiConnectionBindingSchema>;
/**
 * Descriptor stored in `config.ai`. `baseUrl`/`model`/`wireApi` are only
 * meaningful for the `third_party_api` method; the catalog schema also uses
 * this shape, so the fields stay optional here and creation validates them.
 */
export const aiConnectionMetadataSchema = z
  .object({
    ...requirement,
    baseUrl: z.string().trim().min(1).max(2048).optional(),
    model: z.string().trim().min(1).max(256).optional(),
    wireApi: aiThirdPartyWireApiSchema.optional(),
  })
  .strict();
export type AiConnectionMetadata = z.infer<typeof aiConnectionMetadataSchema>;

/** Existing integrations only. This table describes compatibility, never routing. */
export const AI_CONNECTION_CAPABILITIES: Record<
  AiProvider,
  {
    name: string;
    methods: Partial<
      Record<AiAuthMethod, { adapters: readonly string[]; envKey: string }>
    >;
  }
> = {
  anthropic: {
    name: "Claude",
    methods: {
      subscription: {
        adapters: ["claude_local"],
        envKey: "CLAUDE_CODE_OAUTH_TOKEN",
      },
      api_key: { adapters: ["claude_local"], envKey: "ANTHROPIC_API_KEY" },
    },
  },
  openai: {
    name: "OpenAI",
    methods: {
      subscription: { adapters: ["codex_local"], envKey: "CODEX_HOME" },
      api_key: { adapters: ["codex_local"], envKey: "OPENAI_API_KEY" },
      third_party_api: {
        adapters: ["codex_local"],
        envKey: "OPENAI_API_KEY",
      },
    },
  },
  openrouter: {
    name: "OpenRouter",
    methods: {
      api_key: { adapters: ["opencode_local"], envKey: "OPENROUTER_API_KEY" },
    },
  },
  xai: {
    name: "Grok",
    methods: {
      subscription: { adapters: ["grok_local"], envKey: "GROK_HOME" },
      api_key: { adapters: ["grok_local"], envKey: "XAI_API_KEY" },
    },
  },
};
export function isAiConnectionCompatible(
  requirement: AiConnectionMetadata | AiConnectionBinding,
  adapterType: string,
  model?: unknown,
  runnerProvider?: unknown,
  acpxAgent?: unknown,
): boolean {
  if (adapterType === "paperclip_runner")
    adapterType =
      runnerProvider === "claude" ||
      (runnerProvider === "acpx" && acpxAgent === "claude")
        ? "claude_local"
        : runnerProvider === "acpx" && acpxAgent === "grok"
          ? "grok_local"
        : runnerProvider === "codex"
          ? "codex_local"
          : runnerProvider === "opencode"
            ? "opencode_local"
            : "unsupported";
  const methods = AI_CONNECTION_CAPABILITIES[requirement.provider].methods;
  const candidates = "mode" in requirement && requirement.mode === "responsible_user"
    ? Object.values(methods)
    : requirement.method ? [methods[requirement.method]] : [];
  return (
    candidates.some((method) => method?.adapters.includes(adapterType)) &&
    (requirement.provider !== "openrouter" ||
      (typeof model === "string" && model.startsWith("openrouter/")))
  );
}
export type AiConnectionUnavailableReason =
  | "responsible_user_missing"
  | "membership_missing"
  | "default_missing"
  | "connection_missing"
  | "connection_unavailable"
  | "incompatible"
  | "access_denied"
  | "credential_missing";
export interface AiConnectionAttribution {
  connectionId: string;
  grantId: string;
  provider: AiProvider;
  method: AiAuthMethod;
  mode: AiConnectionBinding["mode"];
  responsibleUserId: string | null;
}
export type AiConnectionResolution =
  | { ok: true; attribution: AiConnectionAttribution }
  | { ok: false; reason: AiConnectionUnavailableReason; message: string };

export interface AiManagedConnectionSummary {
  id: string;
  grantId: string;
  companyId: string;
  provider: AiProvider;
  method: AiAuthMethod;
  name: string;
  accountLabel?: string;
  ownership: "personal" | "shared";
  ownerUserId?: string;
  ownerName?: string;
  isDefault: boolean;
  status: "connected" | "needs_attention" | "expired" | "revoked";
  unavailableReason?: string;
  /** Present only for `third_party_api` accounts; never a secret value. */
  baseUrl?: string;
  model?: string;
  wireApi?: AiThirdPartyWireApi;
  usageProbeSupported?: boolean;
}
export interface AiConnectionList {
  currentUserId: string;
  canManageConnections: boolean;
  connections: AiManagedConnectionSummary[];
}
export const createAiConnectionSchema = z
  .object({
    ...requirement,
    name: z.string().trim().min(1).max(160),
    ownership: z.enum(["personal", "shared"]),
    apiKey: z.string().trim().min(1).max(32768).optional(),
    loginSessionId: z.string().max(128).optional(),
    /** Third-party (OpenAI-compatible) endpoint fields. */
    baseUrl: z.string().trim().min(1).max(2048).optional(),
    model: z.string().trim().min(1).max(256).optional(),
    wireApi: aiThirdPartyWireApiSchema.optional(),
    connectionId: z.string().uuid().optional(),
    agentIds: z.array(z.string().uuid()).max(1000).default([]),
    allAgents: z.boolean().default(false),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!AI_CONNECTION_CAPABILITIES[v.provider].methods[v.method])
      ctx.addIssue({ code: "custom", message: "Unsupported sign-in method" });
    if (v.method === "third_party_api") {
      if (!v.baseUrl || !isThirdPartyBaseUrl(v.baseUrl))
        ctx.addIssue({
          code: "custom",
          message: "Provide an http(s) endpoint base URL",
          path: ["baseUrl"],
        });
      if (!v.model)
        ctx.addIssue({
          code: "custom",
          message: "Provide the model name served by this endpoint",
          path: ["model"],
        });
      if (!v.apiKey || v.loginSessionId)
        ctx.addIssue({
          code: "custom",
          message: "Provide exactly the credential for the selected sign-in method",
          path: ["apiKey"],
        });
      return;
    }
    if (
      v.method === "api_key"
        ? !v.apiKey || Boolean(v.loginSessionId)
        : !v.loginSessionId || Boolean(v.apiKey)
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Provide exactly the credential for the selected sign-in method",
      });
    }
  });
export type CreateAiConnection = z.infer<typeof createAiConnectionSchema>;
export type AiThirdPartyWireApi = z.infer<typeof aiThirdPartyWireApiSchema>;
/**
 * The wire protocol assumed when an endpoint does not name one.
 *
 * `chat`, not `responses`. The Responses API is OpenAI's own; every other
 * OpenAI-*compatible* endpoint — DeepSeek, Moonshot, Qwen, the Ark and
 * OpenRouter gateways — implements `/chat/completions` and nothing else, so
 * assuming `responses` makes the first attempt fail for almost everyone who
 * points Codex at a third party. OpenAI's own endpoint speaks both, so this
 * default is the one that is wrong for the fewest people; the picker is still
 * there for the ones it is wrong for.
 */
export const DEFAULT_AI_THIRD_PARTY_WIRE_API: AiThirdPartyWireApi = "chat";

/** Boards may point Codex at internal gateways, so both http and https are allowed. */
export function isThirdPartyBaseUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      Boolean(parsed.hostname)
    );
  } catch {
    return false;
  }
}

/** Stored/compared form of a third-party endpoint: no trailing slashes. */
export function normalizeThirdPartyBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

/** Non-secret endpoint descriptor for a third-party connection, or null. */
export function thirdPartyEndpointOf(
  metadata: AiConnectionMetadata | null | undefined,
): { baseUrl: string; model: string; wireApi: AiThirdPartyWireApi } | null {
  if (!metadata || metadata.method !== "third_party_api") return null;
  if (!metadata.baseUrl || !metadata.model) return null;
  return {
    baseUrl: metadata.baseUrl,
    model: metadata.model,
    wireApi: metadata.wireApi ?? DEFAULT_AI_THIRD_PARTY_WIRE_API,
  };
}

export const aiConnectionLoginIntentSchema = z
  .object({
    provider: aiProviderSchema,
    method: z.literal("subscription"),
    name: z.string().trim().min(1).max(160),
    ownership: z.enum(["personal", "shared"]),
    connectionId: z.string().uuid().optional(),
    agentIds: z.array(z.string().uuid()).max(1000).default([]),
    allAgents: z.boolean().default(false),
  })
  .strict();
export type AiConnectionLoginIntent = z.infer<
  typeof aiConnectionLoginIntentSchema
>;

export const localAiConnectionSchema = aiConnectionLoginIntentSchema.extend({
  localSessionId: z.string().uuid().optional(),
});
export const localAiLoginStartSchema = aiConnectionLoginIntentSchema.extend({ restart: z.boolean().optional() });
export interface LocalAiLoginStatus {
  status: "ready" | "sign_in_required" | "expired";
}
export interface LocalAiLoginAttempt {
  sessionId: string;
  command: string;
  expiresAt: string;
}

/** Preview-era copies of rotating local credentials must be reconnected. */
export function aiSubscriptionNeedsIsolatedLogin(config: Record<string, unknown> | undefined): boolean {
  const metadata = aiConnectionMetadataSchema.safeParse(config?.ai);
  return metadata.success && metadata.data.method === "subscription" &&
    (metadata.data.provider === "openai" || metadata.data.provider === "xai") &&
    config?.aiIsolatedSubscription !== true;
}
