// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThirdPartyModelField } from "./ThirdPartyModelField";

const thirdPartyModels = vi.hoisted(() => vi.fn());
vi.mock("@/api/ai-connections", () => ({
  aiConnectionsApi: { thirdPartyModels },
}));

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  thirdPartyModels.mockReset();
});

function render(props: Partial<Parameters<typeof ThirdPartyModelField>[0]> = {}) {
  const onChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <QueryClientProvider client={client}>
        <ThirdPartyModelField
          companyId="company-1"
          baseUrl=""
          apiKey=""
          value=""
          onChange={onChange}
          {...props}
        />
      </QueryClientProvider>,
    );
  });
  return onChange;
}

function fetchButton() {
  return [...document.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Fetch models"),
  ) as HTMLButtonElement;
}

describe("ThirdPartyModelField", () => {
  it("fetches endpoint models and selects one", async () => {
    thirdPartyModels.mockResolvedValue({ models: ["deepseek-chat", "deepseek-reasoner"] });
    const onChange = render({ baseUrl: "https://gateway.example.com/v1", apiKey: "sk-test" });
    expect(fetchButton().disabled).toBe(false);

    await act(async () => {
      fetchButton().click();
    });
    for (let i = 0; i < 5; i += 1) await act(async () => { await Promise.resolve(); });

    expect(thirdPartyModels).toHaveBeenCalledWith("company-1", {
      baseUrl: "https://gateway.example.com/v1",
      apiKey: "sk-test",
    });
    const option = document.querySelector<HTMLButtonElement>("[role=option]");
    expect(option?.textContent).toContain("deepseek-chat");
    await act(async () => {
      option!.click();
    });
    expect(onChange).toHaveBeenCalledWith("deepseek-chat");
  });

  it("does not fetch until the endpoint and key are present", () => {
    const onChange = render();
    expect(fetchButton().disabled).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });
});
