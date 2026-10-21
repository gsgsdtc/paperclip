import { normalizeThirdPartyBaseUrl } from "@paperclipai/shared";
import { unprocessable } from "../errors.js";

function thirdPartyModelsUrl(baseUrl: string): string {
  return `${normalizeThirdPartyBaseUrl(baseUrl)}/models`;
}

function parseThirdPartyModelIds(payload: unknown): string[] {
  const data = (payload as { data?: unknown } | null | undefined)?.data;
  if (!Array.isArray(data)) return [];
  const ids = data.flatMap((entry) =>
    entry && typeof entry === "object" && typeof (entry as { id?: unknown }).id === "string"
      ? [(entry as { id: string }).id]
      : [],
  );
  return [...new Set(ids)].sort();
}

/**
 * Best-effort probe of an operator-supplied endpoint at creation time. Unlike
 * the fixed provider endpoints, an unreachable endpoint is allowed here: an
 * internal gateway may only be reachable from the run environment. A definitive
 * auth rejection still fails creation.
 */
export async function validateThirdPartyAiEndpoint(
  baseUrl: string,
  key: string,
  request: typeof fetch = fetch,
) {
  let response: Response;
  try {
    response = await request(thirdPartyModelsUrl(baseUrl), {
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${key}` },
    });
  } catch {
    return;
  }
  await response.body?.cancel();
  if (response.status === 401 || response.status === 403)
    throw unprocessable("The endpoint rejected this API key.");
}

/** Explicit operator action, so failures surface verbatim. */
export async function fetchThirdPartyModels(
  baseUrl: string,
  key: string,
  request: typeof fetch = fetch,
): Promise<string[]> {
  let response: Response;
  try {
    response = await request(thirdPartyModelsUrl(baseUrl), {
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${key}` },
    });
  } catch {
    throw unprocessable("Could not reach the endpoint. Check the base URL.");
  }
  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel();
    throw unprocessable("The endpoint rejected this API key.");
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw unprocessable(
      "The endpoint did not return a model list. Enter the model name manually.",
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw unprocessable(
      "The endpoint did not return a JSON model list. Enter the model name manually.",
    );
  }
  const models = parseThirdPartyModelIds(payload);
  if (!models.length)
    throw unprocessable(
      "The endpoint returned no models. Enter the model name manually.",
    );
  return models;
}
