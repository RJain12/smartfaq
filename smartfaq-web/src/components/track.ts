import type { ClientEvent } from "@/lib/types";

export async function trackClient(
  partial: Omit<ClientEvent, "at"> & { at?: string }
) {
  try {
    await fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...partial,
        at: partial.at ?? new Date().toISOString(),
      }),
    });
  } catch {
    /* offline */
  }
}
