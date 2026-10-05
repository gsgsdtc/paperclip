import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AI_CONNECTION_CAPABILITIES, DEFAULT_AI_THIRD_PARTY_WIRE_API, type AiProvider, type AiAuthMethod, type AiConnectionLoginIntent } from "@paperclipai/shared";
import { AgentProviderConnection } from "@/components/new-agent/AgentProviderConnection";
import { ProviderApiKeyCard } from "@/components/AdapterLoginChrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { aiConnectionsApi } from "@/api/ai-connections";
import { environmentsApi } from "@/api/environments";
import { instanceSettingsApi } from "@/api/instanceSettings";
import { queryKeys } from "@/lib/queryKeys";
import { resolveAdapterTestEnvironmentId, resolveLocalDefaultEnvironmentId, resolveManagedSandboxEnvironmentId } from "@/lib/adapter-test-environment";
import { resolveForcedKubernetesEnvironment } from "@/lib/forced-kubernetes-environment";
import { aiMethodLabel } from "./model";

type ThirdPartyWireApi = "responses" | "chat";

type Props = {
  companyId: string;
  provider: AiProvider;
  initialMethod?: AiAuthMethod;
  fixedMethod?: boolean;
  connectionId?: string;
  name: string;
  hideName?: boolean;
  nameForMethod?: (method: AiAuthMethod) => string;
  ownership: "personal" | "shared";
  agentIds: string[];
  allAgents: boolean;
  environmentId?: string;
  onComplete: (result: { connectionId: string; grantId: string; method: AiAuthMethod }) => void;
  onCancel: () => void;
};

/** The sign-in methods a provider actually offers, in the order we present them. */
const METHOD_ORDER: AiAuthMethod[] = ["subscription", "api_key", "third_party_api"];

/** Connections hosts the same provider step as agent setup, with its own save intent. */
export function AiConnectionCredentialStep(props: Props) {
  const methods = METHOD_ORDER.filter(
    (method) => AI_CONNECTION_CAPABILITIES[props.provider].methods[method],
  );
  // A reconnect or a fixed-method host names one method; every other host lets
  // the operator pick, so an OpenAI API key or an OpenAI-compatible endpoint is
  // reachable without a separate entry point. The chooser is the only place the
  // method is decided, and it always shows the label of the selected one.
  const locked = props.fixedMethod === true || Boolean(props.connectionId) || methods.length <= 1;
  const [chosen, setChosen] = useState<AiAuthMethod>(
    props.initialMethod ?? methods[0] ?? "api_key",
  );
  const method = locked ? props.initialMethod ?? chosen : chosen;
  const chooser = locked ? null : (
    <label className="block space-y-2 text-sm">
      <span>Sign-in method</span>
      <Select
        value={method}
        onValueChange={(value) => setChosen(value as AiAuthMethod)}
      >
        <SelectTrigger aria-label="Sign-in method">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {methods.map((option) => (
            <SelectItem key={option} value={option}>
              {aiMethodLabel(props.provider, option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
  // Remount the step when the method changes so a switch never leaves the
  // previous method's inputs (a key, an endpoint, a name) behind.
  const step =
    method === "third_party_api" ? (
      <ThirdPartyApiConnectionStep key={method} {...props} initialMethod={method} />
    ) : props.provider === "openrouter" ? (
      <ApiKeyConnectionStep key={method} {...props} initialMethod={method} />
    ) : (
      <SubscriptionConnectionStep key={method} {...props} initialMethod={method} />
    );
  return (
    <div className="mx-auto w-full min-w-0 max-w-xl space-y-4">
      {chooser}
      {step}
    </div>
  );
}

function SubscriptionConnectionStep({ companyId, provider, initialMethod, fixedMethod, connectionId, name: initialName, hideName, nameForMethod, ownership, agentIds, allAgents, environmentId: suppliedEnvironmentId, onComplete, onCancel }: Props) {
  const [name, setName] = useState(initialName);
  const [chosenEnvironment, setChosenEnvironment] = useState<string>();
  const client = useQueryClient();
  const envs = useQuery({ queryKey: queryKeys.environments.list(companyId), queryFn: () => environmentsApi.list(companyId) });
  const caps = useQuery({ queryKey: queryKeys.environments.capabilities(companyId), queryFn: () => environmentsApi.capabilities(companyId) });
  const settings = useQuery({ queryKey: queryKeys.instance.settings, queryFn: instanceSettingsApi.get });
  const experimental = useQuery({ queryKey: queryKeys.instance.experimentalSettings, queryFn: instanceSettingsApi.getExperimental });
  const general = useQuery({ queryKey: queryKeys.instance.generalSettings, queryFn: instanceSettingsApi.getGeneral });
  const forced = resolveForcedKubernetesEnvironment(general.data?.executionMode, envs.data ?? []);
  let environmentId: string | null = null;
  let environmentError: string | undefined;
  try {
    environmentId = forced.forced ? forced.kubernetesEnvironment?.id ?? null : resolveAdapterTestEnvironmentId({
      agentDefaultEnvironmentId: suppliedEnvironmentId ?? chosenEnvironment,
      instanceDefaultEnvironmentId: settings.data?.defaultEnvironmentId,
      localDefaultEnvironmentId: resolveLocalDefaultEnvironmentId(envs.data),
      managedSandboxOnly: experimental.data?.enableManagedSandboxOnly,
      managedSandboxEnvironmentId: resolveManagedSandboxEnvironmentId(envs.data),
      visibleEnvironmentIds: envs.data?.map((env) => env.id),
    });
  } catch (error) { environmentError = error instanceof Error ? error.message : "Could not resolve the sign-in environment."; }
  const loginEnvironments = (envs.data ?? []).filter((env) =>
    env.status === "active" && (env.driver === "local" || (env.driver === "sandbox" &&
    typeof env.config.provider === "string" &&
    caps.data?.sandboxProviders?.[env.config.provider]?.supportsLoginPty === true)),
  );
  // Signing in may use a different environment from later agent execution.
  // Prefer a supported login environment without changing any agent routing.
  if (!forced.forced && !suppliedEnvironmentId && !chosenEnvironment &&
      !loginEnvironments.some((env) => env.id === environmentId)) {
    environmentId = loginEnvironments[0]?.id ?? null;
  }
  const environment = envs.data?.find((env) => env.id === environmentId);
  const sandboxProvider = typeof environment?.config.provider === "string" ? environment.config.provider : "";
  const canLogin = environment?.driver === "sandbox" && caps.data?.sandboxProviders?.[sandboxProvider]?.supportsLoginPty === true;
  const loading = [envs, caps, settings, experimental, general].some((query) => query.isPending);
  const error = environmentError ?? [envs, caps, settings, experimental, general].find((query) => query.error)?.error?.message;
  const intent: AiConnectionLoginIntent = { provider, method: "subscription", name, ownership, agentIds, allAgents, connectionId };
  return <div className="mx-auto w-full min-w-0 max-w-xl space-y-6">
    {!hideName && <label className="block space-y-2 text-sm">Connection name<Input value={name} onChange={(event) => setName(event.target.value)} disabled={Boolean(connectionId)} /></label>}
    {!suppliedEnvironmentId && !forced.forced && loginEnvironments.length > 1 && <Select value={environmentId ?? ""} onValueChange={setChosenEnvironment}>
      <SelectTrigger aria-label="Sign-in environment"><SelectValue placeholder="Sign-in environment" /></SelectTrigger>
      <SelectContent>{loginEnvironments.map((env) => <SelectItem key={env.id} value={env.id}>{env.name}</SelectItem>)}</SelectContent>
    </Select>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {loading ? <p role="status" className="text-sm text-muted-foreground">Preparing sign-in…</p> : <AgentProviderConnection
      key={environmentId ?? "local"}
      companyId={companyId}
      adapterType={provider === "anthropic" ? "claude_local" : provider === "xai" ? "grok_local" : "codex_local"}
      environmentId={environmentId}
      canLogin={canLogin}
      localEnvironment={environment?.driver === "local"}
      onBack={onCancel}
      onConnected={() => {}}
      testConnection={async () => false}
      managedAccount={{ intent, nameForMethod, initialMethod: initialMethod === "third_party_api" ? undefined : initialMethod, fixedMethod: fixedMethod ?? Boolean(connectionId), disabled: loading || Boolean(error) || !name.trim(), onComplete: (result) => { void client.invalidateQueries({ queryKey: ["ai-connections", companyId] }); onComplete(result); } }}
    />}
  </div>;
}

function ApiKeyConnectionStep({ companyId, provider, connectionId, name: initialName, hideName, nameForMethod, ownership, agentIds, allAgents, onComplete, onCancel }: Props) {
  const [name, setName] = useState(initialName);
  const [apiKey, setApiKey] = useState("");
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: () => aiConnectionsApi.create(companyId, { provider, method: "api_key", name: connectionId ? name : nameForMethod?.("api_key") ?? name, ownership, agentIds, allAgents, connectionId, apiKey }),
    onSuccess: (result) => { void client.invalidateQueries({ queryKey: ["ai-connections", companyId] }); onComplete({ ...result, method: "api_key" }); },
    onSettled: () => setApiKey(""),
  });
  return <div className="mx-auto w-full min-w-0 max-w-xl space-y-4">
    {!hideName && <label className="block space-y-2 text-sm">Connection name<Input value={name} onChange={(event) => setName(event.target.value)} disabled={Boolean(connectionId)} /></label>}
    {save.error && <p role="alert" className="text-sm text-destructive">{save.error.message}</p>}
    <ProviderApiKeyCard providerName="OpenRouter" value={apiKey} onChange={setApiKey} onSubmit={() => save.mutate()} disabled={save.isPending} placeholder="Enter API key here" autoFocus />
    <div className="flex justify-between gap-2"><Button variant="ghost" onClick={onCancel}>Cancel</Button><Button disabled={!name.trim() || !apiKey.trim() || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Connecting…" : "Connect"}</Button></div>
  </div>;
}

/**
 * An OpenAI-compatible endpoint the operator hosts or subscribes to. Unlike the
 * fixed provider API-key path, the endpoint, the model, and the wire protocol
 * are connection-scoped: many gateways serve their own model names and only
 * speak Chat Completions.
 */
function ThirdPartyApiConnectionStep({ companyId, provider, connectionId, name: initialName, ownership, agentIds, allAgents, onComplete, onCancel }: Props) {
  const [name, setName] = useState(initialName);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [wireApi, setWireApi] = useState<ThirdPartyWireApi>(DEFAULT_AI_THIRD_PARTY_WIRE_API);
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);
  const client = useQueryClient();
  const discoverable = Boolean(baseUrl.trim() && apiKey.trim());
  const discover = useMutation({
    mutationFn: () => aiConnectionsApi.thirdPartyModels(companyId, { baseUrl: baseUrl.trim(), apiKey }),
    onSuccess: (result) => setDiscoveredModels(result.models),
  });
  const save = useMutation({
    mutationFn: () => aiConnectionsApi.create(companyId, { provider, method: "third_party_api", name, ownership, agentIds, allAgents, connectionId, apiKey, baseUrl: baseUrl.trim(), model: model.trim(), wireApi }),
    onSuccess: (result) => { void client.invalidateQueries({ queryKey: ["ai-connections", companyId] }); onComplete({ ...result, method: "third_party_api" }); },
    onSettled: () => setApiKey(""),
  });
  const canSave = Boolean(name.trim() && baseUrl.trim() && apiKey.trim() && model.trim()) && !save.isPending;
  return <div className="mx-auto w-full min-w-0 max-w-xl space-y-4">
    <label className="block space-y-2 text-sm">Connection name<Input value={name} onChange={(event) => setName(event.target.value)} disabled={Boolean(connectionId)} /></label>
    <label className="block space-y-2 text-sm">Base URL<Input value={baseUrl} onChange={(event) => { setBaseUrl(event.target.value); setDiscoveredModels([]); }} placeholder="https://gateway.example.com/v1" autoFocus /></label>
    <p className="text-xs text-muted-foreground">OpenAI-compatible endpoint. http and https are both accepted.</p>
    <ProviderApiKeyCard providerName="third-party endpoint" value={apiKey} onChange={(value) => { setApiKey(value); setDiscoveredModels([]); }} onSubmit={() => save.mutate()} disabled={save.isPending} placeholder="Enter API key here" />
    <label className="block space-y-2 text-sm">Model<Input value={model} onChange={(event) => setModel(event.target.value)} placeholder="e.g. deepseek-chat" list="third-party-models" /></label>
    <datalist id="third-party-models">{discoveredModels.map((id) => <option key={id} value={id} />)}</datalist>
    <label className="block space-y-2 text-sm">Wire protocol<Select value={wireApi} onValueChange={(value) => setWireApi(value as ThirdPartyWireApi)}>
      <SelectTrigger aria-label="Wire protocol"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="responses">Responses API</SelectItem>
        <SelectItem value="chat">Chat Completions</SelectItem>
      </SelectContent>
    </Select></label>
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" disabled={!discoverable || discover.isPending} onClick={() => discover.mutate()}>{discover.isPending ? "Fetching…" : "Fetch models"}</Button>
      {discoveredModels.length > 0 && <span className="text-xs text-muted-foreground">{discoveredModels.length} model{discoveredModels.length === 1 ? "" : "s"} found. Pick one above or type any name.</span>}
    </div>
    {discover.error && <p role="alert" className="text-sm text-destructive">{discover.error.message}</p>}
    {save.error && <p role="alert" className="text-sm text-destructive">{save.error.message}</p>}
    <div className="flex justify-between gap-2"><Button variant="ghost" onClick={onCancel}>Cancel</Button><Button disabled={!canSave} onClick={() => save.mutate()}>{save.isPending ? "Connecting…" : "Connect"}</Button></div>
  </div>;
}
