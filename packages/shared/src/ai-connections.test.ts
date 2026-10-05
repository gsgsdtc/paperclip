import { describe, expect, it } from "vitest";
import {
  AI_CONNECTION_CAPABILITIES,
  aiConnectionMetadataSchema,
  createAiConnectionSchema,
  isAiConnectionCompatible,
  isThirdPartyBaseUrl,
  normalizeThirdPartyBaseUrl,
  thirdPartyEndpointOf,
} from "./ai-connections.js";

const thirdParty = {
  provider: "openai" as const,
  method: "third_party_api" as const,
  name: "Relay",
  ownership: "personal" as const,
  apiKey: "sk-relay",
  baseUrl: "https://gateway.example.com/v1",
  model: "deepseek-chat",
};

describe("third-party AI connections", () => {
  it("registers the method for codex only", () => {
    expect(AI_CONNECTION_CAPABILITIES.openai.methods.third_party_api).toEqual({
      adapters: ["codex_local"],
      envKey: "OPENAI_API_KEY",
    });
    expect(
      AI_CONNECTION_CAPABILITIES.anthropic.methods.third_party_api,
    ).toBeUndefined();
  });

  it("is compatible with codex_local through the capability table", () => {
    expect(
      isAiConnectionCompatible(
        { provider: "openai", method: "third_party_api" },
        "codex_local",
      ),
    ).toBe(true);
    expect(
      isAiConnectionCompatible(
        { provider: "openai", method: "third_party_api" },
        "claude_local",
      ),
    ).toBe(false);
  });

  it("accepts a complete third-party connection and defaults the wire protocol", () => {
    const parsed = createAiConnectionSchema.parse(thirdParty);
    expect(parsed.wireApi).toBeUndefined();
    expect(thirdPartyEndpointOf(parsed)).toEqual({
      baseUrl: "https://gateway.example.com/v1",
      model: "deepseek-chat",
      wireApi: "chat",
    });
  });

  it("requires base URL, model, and key for third-party connections", () => {
    for (const patch of [
      { baseUrl: undefined },
      { model: undefined },
      { apiKey: undefined },
      { baseUrl: "file:///etc/passwd" },
      { loginSessionId: "session" },
    ]) {
      expect(() =>
        createAiConnectionSchema.parse({ ...thirdParty, ...patch }),
      ).toThrow();
    }
    expect(() =>
      createAiConnectionSchema.parse({
        ...thirdParty,
        provider: "anthropic",
      }),
    ).toThrow();
  });

  it("keeps the subscription and API-key credential rules unchanged", () => {
    expect(() =>
      createAiConnectionSchema.parse({
        provider: "openai",
        method: "api_key",
        name: "OpenAI",
        ownership: "personal",
        apiKey: "sk-openai",
      }),
    ).not.toThrow();
    expect(() =>
      createAiConnectionSchema.parse({
        provider: "openai",
        method: "api_key",
        name: "OpenAI",
        ownership: "personal",
        apiKey: "sk-openai",
        model: "gpt-5.1-codex",
      }),
    ).not.toThrow();
  });

  it("parses endpoint metadata and rejects unknown keys", () => {
    expect(
      aiConnectionMetadataSchema.parse({
        provider: "openai",
        method: "third_party_api",
        baseUrl: "https://gateway.example.com/v1",
        model: "deepseek-chat",
        wireApi: "chat",
      })?.wireApi,
    ).toBe("chat");
    expect(() =>
      aiConnectionMetadataSchema.parse({
        provider: "openai",
        method: "third_party_api",
        unexpected: true,
      }),
    ).toThrow();
    // Catalog descriptors carry no instance endpoint fields.
    expect(
      aiConnectionMetadataSchema.parse({
        provider: "openai",
        method: "third_party_api",
      }),
    ).toEqual({ provider: "openai", method: "third_party_api" });
  });

  it("only accepts http(s) base URLs and strips trailing slashes", () => {
    expect(isThirdPartyBaseUrl("http://gateway.internal:8080/v1")).toBe(true);
    expect(isThirdPartyBaseUrl("https://gateway.example.com/v1")).toBe(true);
    expect(isThirdPartyBaseUrl("ftp://gateway.example.com")).toBe(false);
    expect(isThirdPartyBaseUrl("not a url")).toBe(false);
    expect(normalizeThirdPartyBaseUrl("https://gateway.example.com/v1/")).toBe(
      "https://gateway.example.com/v1",
    );
  });
});
