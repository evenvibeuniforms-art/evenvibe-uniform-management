const SUPABASE_TIMEOUT_MS = 5000;

/**
 * Custom fetch wrapper for Supabase requests that enforces a strict timeout.
 * Prevents requests from hanging for 25+ seconds during network drops or unreachable endpoints.
 */
export async function supabaseFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`Supabase request timed out after ${SUPABASE_TIMEOUT_MS}ms`));
  }, SUPABASE_TIMEOUT_MS);

  let signal: AbortSignal = controller.signal;
  if (init?.signal) {
    if (typeof AbortSignal.any === 'function') {
      signal = AbortSignal.any([init.signal, controller.signal]);
    } else {
      init.signal.addEventListener('abort', () => controller.abort(init.signal?.reason));
      signal = controller.signal;
    }
  }

  try {
    return await fetch(input, {
      ...init,
      signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
