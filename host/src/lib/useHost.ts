import { useSyncExternalStore } from "react";
import { host, type HostState } from "./controller";

export function useHost(): HostState {
  return useSyncExternalStore(host.subscribe, host.getState);
}
