import * as process from 'node:process'
import * as os from 'node:os'

export default () => {
	const levelDbPath = process.env.LEVEL_DB_PATH || './level-db/data'
	const tcpPort = Number(process.env.TCP_PORT) || 7070
	const peers = (process.env.PEERS || '').split(',')
	const tcpHost = process.env.TCP_HOST || os.hostname()

	return {
		tcpPort,
		tcpHost,
		peers,
		levelDbPath,
		environment: process.env.ENVIRONMENT,
	}
}
