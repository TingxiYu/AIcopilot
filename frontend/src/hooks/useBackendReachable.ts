import { useCallback, useEffect, useState } from "react";

/**
 * Whether the configured backend answers at all (spec §5.4).
 *
 * Why this exists rather than a check on `stream.error`: the classic transport
 * only opens a connection when a run is submitted, so on a cold load against a
 * dead backend the app has NOTHING to report — `stream.error` is null, no run
 * exists, and the user is left looking at an empty column with no explanation.
 * That is the "white screen" the spec forbids. `GET /ok` is the health route
 * langgraph-api serves, so this is the cheapest honest probe available; it
 * answers "is the address reachable" without starting a run or costing a model
 * call.
 *
 * `null` while the probe is in flight, so the caller can distinguish
 * "not checked yet" from "checked, unreachable". Once reachable, the probe stops
 * for the life of the mount — a dropped connection mid-run is reported by
 * `stream.error`, which is the more precise signal at that point.
 *
 * `retry` re-runs the probe. It exists because the verdict gates controls (the
 * new-thread button and the composer's send), and a one-shot probe would leave a
 * user who started their backend a moment later with a permanently disabled UI
 * and no way out but a page reload.
 */
export function useBackendReachable(url: string): {
  reachable: boolean | null;
  retry: () => void;
} {
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    // Back to "unknown" while re-checking, so the banner shows the in-flight
    // state rather than continuing to assert the previous verdict.
    setReachable(null);

    fetch(`${url.replace(/\/$/, "")}/ok`, { signal: controller.signal })
      .then((response) => {
        if (!cancelled) setReachable(response.ok);
      })
      .catch(() => {
        // A network refusal, a DNS failure and an abort all land here. Only the
        // first two mean "unreachable"; the abort happens on unmount or on a
        // superseding probe, where `cancelled` has already been set.
        if (!cancelled) setReachable(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [url, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { reachable, retry };
}
