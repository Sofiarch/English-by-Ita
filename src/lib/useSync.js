import { useSyncExternalStore } from "react";
import { getStatus, subscribe } from "./sync.js";

/** Live sync status: { online, syncing, pending, lastSyncedAt, error, version } */
export function useSyncStatus() {
  return useSyncExternalStore(subscribe, getStatus, getStatus);
}

/** Changes every time a sync pulls new data — use as an effect dependency to refresh. */
export function useSyncVersion() {
  return useSyncExternalStore(subscribe, () => getStatus().version, () => 0);
}
