import { useQuery } from "@tanstack/react-query";
import { aiConnectionsApi } from "@/api/ai-connections";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Model choice for the third-party connector that is currently selected.
 * The connection keeps a default; this override is what the agent runs.
 */
export function ConnectorModelSelect({
  companyId,
  connectionId,
  value,
  fallback,
  disabled,
  onChange,
}: {
  companyId: string;
  connectionId: string;
  /** Empty means the connection default. */
  value: string;
  fallback?: string;
  disabled?: boolean;
  onChange: (model: string) => void;
}) {
  const models = useQuery({
    queryKey: ["ai-connection-models", companyId, connectionId],
    queryFn: () => aiConnectionsApi.connectionModels(companyId, connectionId),
  });
  const current = value.trim() || fallback || models.data?.model || "";
  const options = [...new Set([...(current ? [current] : []), ...(models.data?.models ?? [])])];
  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-4">
      <label className="block space-y-2 text-sm">
        Model
        {options.length > 0 ? (
          <Select value={current} onValueChange={onChange} disabled={disabled || models.isPending}>
            <SelectTrigger aria-label="Connector model">
              <SelectValue placeholder="Select a model" />
            </SelectTrigger>
            <SelectContent>
              {options.map((id) => (
                <SelectItem key={id} value={id}>{id}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            aria-label="Connector model"
            value={value}
            disabled={disabled || models.isPending}
            placeholder={fallback || "e.g. deepseek-chat"}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
      </label>
      <p className="text-xs text-muted-foreground">
        {models.isPending
          ? "Loading models from this connector…"
          : models.isError
            ? (models.error instanceof Error ? models.error.message : "Could not load models.")
            : "Choose the model this connector uses. Leave the typed name empty to keep the connector default."}
      </p>
      {options.length > 0 && (
        <Input
          aria-label="Custom connector model"
          value={value}
          disabled={disabled}
          placeholder={fallback ? `Default: ${fallback}` : "Or type a model name"}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}
