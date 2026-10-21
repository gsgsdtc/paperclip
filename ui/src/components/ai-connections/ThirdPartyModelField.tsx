import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { aiConnectionsApi } from "@/api/ai-connections";
import { OnboardingCardField } from "@/components/AdapterLoginChrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Model for a Codex third-party (OpenAI-compatible) endpoint.
 *
 * The endpoint's own names are not in the Codex catalog, so the operator can
 * fetch `/models` and pick one. A typed name still works when the gateway has
 * no model list.
 */
export function ThirdPartyModelField({
  companyId,
  baseUrl,
  apiKey,
  value,
  onChange,
  onSubmit,
  disabled = false,
  variant = "form",
}: {
  companyId: string | null;
  baseUrl: string;
  apiKey: string;
  value: string;
  onChange: (model: string) => void;
  onSubmit?: () => void;
  disabled?: boolean;
  variant?: "form" | "onboarding";
}) {
  const endpointKey = `${baseUrl.trim()}\0${apiKey}`;
  const [models, setModels] = useState<string[]>([]);
  const [listedFor, setListedFor] = useState(endpointKey);
  if (listedFor !== endpointKey) {
    setListedFor(endpointKey);
    setModels([]);
  }
  const discover = useMutation({
    mutationFn: () => {
      if (!companyId) throw new Error("Create the company before fetching models.");
      return aiConnectionsApi.thirdPartyModels(companyId, {
        baseUrl: baseUrl.trim(),
        apiKey,
      });
    },
    onSuccess: (result) => setModels(result.models),
  });
  const canFetch = Boolean(companyId && baseUrl.trim() && apiKey.trim()) && !disabled;
  const input = variant === "onboarding" ? (
    <OnboardingCardField
      label="Model"
      placeholder="e.g. deepseek-chat"
      value={value}
      onChange={onChange}
      onSubmit={() => onSubmit?.()}
      disabled={disabled}
    />
  ) : (
    <label className="block space-y-2 text-sm">
      Model
      <Input
        aria-label="Model"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="e.g. deepseek-chat"
        disabled={disabled}
        onKeyDown={(event) => {
          if (event.key === "Enter" && onSubmit) {
            event.preventDefault();
            onSubmit();
          }
        }}
      />
    </label>
  );
  return (
    <div className="space-y-2">
      {input}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={!canFetch || discover.isPending}
          onClick={() => discover.mutate()}
        >
          {discover.isPending ? "Fetching…" : "Fetch models"}
        </Button>
        {models.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {models.length} model{models.length === 1 ? "" : "s"}. Select one, or type a name.
          </span>
        )}
      </div>
      {models.length > 0 && (
        <div
          role="listbox"
          aria-label="Endpoint models"
          className="max-h-40 overflow-y-auto rounded-md border border-border"
        >
          {models.map((id) => {
            const selected = value.trim() === id;
            return (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={disabled}
                onClick={() => onChange(id)}
                className={cn(
                  "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50",
                  selected && "bg-accent",
                )}
              >
                <span className="min-w-0 flex-1 truncate font-mono">{id}</span>
                {selected ? <Check className="size-4 shrink-0" aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      )}
      {discover.isError && (
        <p role="alert" className="text-sm text-destructive">
          {discover.error instanceof Error ? discover.error.message : "Could not fetch models."}
        </p>
      )}
    </div>
  );
}
