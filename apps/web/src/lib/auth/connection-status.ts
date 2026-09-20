export const connectionStatuses = [
  "not_connected",
  "authorization_pending",
  "connected",
  "reauthentication_required",
  "disconnected",
] as const;

export type ConnectionStatus = (typeof connectionStatuses)[number];
