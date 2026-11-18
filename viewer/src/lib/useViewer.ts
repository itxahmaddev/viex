import { useSyncExternalStore } from "react";
import { viewer, type ViewerState } from "./controller";

export function useViewer(): ViewerState {
  return useSyncExternalStore(viewer.subscribe, viewer.getState);
}
