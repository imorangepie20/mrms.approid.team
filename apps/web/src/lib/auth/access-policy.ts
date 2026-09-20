import type { ConnectionStatus } from "./connection-status";

export type PersonalizationAccess = {
  connectionStatus: ConnectionStatus;
  isAuthenticated: boolean;
};

export function canUsePersonalization(input: PersonalizationAccess) {
  return input.isAuthenticated && input.connectionStatus === "connected";
}
