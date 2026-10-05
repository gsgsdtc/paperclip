// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { AiConnectionField } from "./AiConnectionField";

vi.mock("@/api/ai-connections", () => ({
  aiConnectionsApi: { list: vi.fn(async () => ({ connections: [], currentUserId: "user-1" })) },
}));
vi.mock("./AiConnectionPicker", () => ({
  AiConnectionPicker: ({ onConnect }: { onConnect: () => void }) => <button onClick={onConnect}>Connect another account</button>,
}));
vi.mock("./AiConnectionCredentialStep", () => ({
  AiConnectionCredentialStep: ({ onComplete }: { onComplete: (result: unknown) => void }) => <button onClick={() => onComplete({
    method: "subscription", connectionId: "new-subscription", grantId: "new-grant",
  })}>Finish subscription</button>,
}));

it("binds the newly connected subscription even when the previous connection used an API key", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onChange = vi.fn();
  try {
    await act(async () => root.render(
      <QueryClientProvider client={client}>
        <AiConnectionField companyId="company-1" agentId="agent-1" agentName="Codex" adapterType="codex_local"
          value={{ provider: "openai", method: "api_key", mode: "delegated", connectionId: "old-key", grantId: "old-grant" }}
          onChange={onChange} />
      </QueryClientProvider>,
    ));
    act(() => container.querySelector<HTMLButtonElement>("button")!.click());
    const finish = [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Finish subscription")!;
    act(() => finish.click());
    expect(onChange).toHaveBeenCalledWith({
      provider: "openai", method: "subscription", mode: "delegated",
      connectionId: "new-subscription", grantId: "new-grant",
    });
  } finally {
    act(() => root.unmount());
    client.clear();
    container.remove();
  }
});
