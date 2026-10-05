// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiConnectionPicker } from "./AiConnectionPicker";
import type {
  AiConnectionBinding,
  AiConnectionSummary,
} from "./model";

/**
 * The shape the API returns for the operator's own instance: an OpenAI
 * subscription that owns the provider default, plus a DeepSeek-compatible
 * endpoint added afterwards. The endpoint is a personal account that is not the
 * default, which is exactly the case that used to be unreachable from an
 * agent's picker — it was created, it showed up under Apps, and it could never
 * be bound.
 */
const subscription: AiConnectionSummary = {
  id: "d65186b4-9b10-4c85-9b21-4b984fcc114a",
  grantId: "d124374c-19b7-41a0-b9eb-e89a471a66b0",
  companyId: "17b4c0b0-699d-48d6-92d9-bd1fd98d639e",
  provider: "openai",
  method: "subscription",
  name: "My OpenAI subscription",
  accountLabel: "guoshiguang@gmail.com",
  ownership: "personal",
  ownerUserId: "user-1",
  status: "connected",
  isDefault: true,
};
const thirdParty: AiConnectionSummary = {
  ...subscription,
  id: "08677463-38a8-4bf2-ab1f-872a14e6e602",
  grantId: "7b942481-fd9b-4b9a-bae5-3c8ea4d4bd0c",
  method: "third_party_api",
  name: "deep-seek",
  accountLabel: undefined,
  model: "deepseek-chat",
  isDefault: false,
};

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

function render(connections: AiConnectionSummary[]) {
  const onChange = vi.fn<(binding: AiConnectionBinding) => void>();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <AiConnectionPicker
        requirement={{ companyId: subscription.companyId, provider: "openai" }}
        connections={connections}
        currentUserId="user-1"
        agentId="agent-1"
        agentName="Codex"
        onChange={onChange}
        onConnect={() => {}}
      />,
    );
  });
  return onChange;
}

function choice(label: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.getAttribute("aria-label") === label,
  );
}

describe("AiConnectionPicker", () => {
  it("offers a personal account that is not the provider default", () => {
    render([subscription, thirdParty]);
    const row = choice("deep-seek");
    expect(row).toBeDefined();
    expect(row!.disabled).toBe(false);
    expect(row!.textContent).toContain("Your account · Third-party API · deepseek-chat");
  });

  it("binds a non-default personal account directly instead of through the default", () => {
    const onChange = render([subscription, thirdParty]);
    act(() => choice("deep-seek")!.click());
    expect(onChange).toHaveBeenCalledWith({
      provider: "openai",
      method: "third_party_api",
      mode: "delegated",
      connectionId: thirdParty.id,
      grantId: thirdParty.grantId,
    });
  });

  it("keeps the provider default as the responsible-user choice", () => {
    render([subscription, thirdParty]);
    const row = choice("Responsible user’s connection");
    expect(row!.textContent).toContain("For you: My OpenAI subscription");
  });

  it("offers the default subscription as an explicit account", () => {
    render([subscription]);
    expect(choice("deep-seek")).toBeUndefined();
    expect(choice(subscription.name)).toBeDefined();
    expect(document.querySelectorAll("button[aria-label]").length).toBe(2);
  });

  it("switches directly back to the default ChatGPT subscription", () => {
    const onChange = render([subscription, thirdParty]);
    act(() => choice(subscription.name)!.click());
    expect(onChange).toHaveBeenCalledWith({
      provider: "openai", method: "subscription", mode: "delegated",
      connectionId: subscription.id, grantId: subscription.grantId,
    });
  });

  it("disables an account that needs attention", () => {
    render([subscription, { ...thirdParty, status: "needs_attention" }]);
    const row = choice("deep-seek");
    expect(row!.disabled).toBe(true);
    expect(row!.textContent).toContain("Needs attention");
  });
});
