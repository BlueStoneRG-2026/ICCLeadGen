export class ExternalTimeoutError extends Error {
  statusCode = 504;

  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms.`);
    this.name = "ExternalTimeoutError";
  }
}

export function externalTimeoutMs(name = "EXTERNAL_CALL_TIMEOUT_MS", fallback = 8000) {
  const value = Number(process.env[name] || String(fallback));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export async function withExternalTimeout<T>(label: string, operation: Promise<T>, ms = externalTimeoutMs()) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new ExternalTimeoutError(label, ms)), ms);
      })
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}) {
  const ms = externalTimeoutMs("SUPABASE_CALL_TIMEOUT_MS");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new ExternalTimeoutError("Supabase API", ms)), ms);
  try {
    return await fetch(input, {
      ...init,
      signal: init.signal || controller.signal
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      throw new ExternalTimeoutError("Supabase API", ms);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
