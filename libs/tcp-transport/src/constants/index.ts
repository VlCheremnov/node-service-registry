export const TCP_PORT = Number(process.env.TCP_PORT) || 7070
export const RESPONSE_PREFIX = 'response:'
export const MAX_BUFFER = 4 * 1024 * 1024

export const DRAIN_DELAY = 3_000
export const DEFAULT_RESPONSE_TIMEOUT = 1_000
export const DEFAULT_RECONNECT_DELAY = 2_000
export const PENDING_BEFORE_CLOSING_DELAY = 3_000
export const MAX_DELAY = 30_000
export const PEER_ID_RE = /^[0-9a-f]{40}$/i
export const ALLOWED_DRIFT = 60_000
