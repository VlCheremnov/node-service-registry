import * as process from 'node:process'
import * as os from 'node:os'

export const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || '').split(',')
export const KAFKA_TOPIC = process.env.KAFKA_TOPIC || 'service-registry'
export const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
export const CLUSTER_INSTANCES = Number(process.env.CLUSTER_INSTANCES) || 0
export const PORT = Number(process.env.PORT) || 4000
export const HEALTH_MS = Number(process.env.HEALTH_MS) || 10_000
export const REPLAY_MS = Number(process.env.REPLAY_MS) || 2_000
export const PRIMARY = process.env.PRIMARY === '1'

export const REDIS_KEY = (name: string) => `sr:${name}`
export const TTL_SEC = Math.ceil(HEALTH_MS / 1000) * 3

export const LEVEL_DB_PATH = process.env.LEVEL_DB_PATH || './level-db/data'
export const TCP_PORT = 7070
export const PEERS = (process.env.PEERS || '').split(',')
export const TCP_HOST = process.env.TCP_HOST || os.hostname()
