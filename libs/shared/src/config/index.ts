import * as process from 'node:process'
import * as os from 'node:os'

export default () => {
	const levelDbPath = process.env.LEVEL_DB_PATH || './level-db/data'
	const tcpPort = Number(process.env.TCP_PORT) || 7070
	const peers = (process.env.PEERS || '').split(',')
	const tcpHost = process.env.TCP_HOST || os.hostname()
	const tcpSharedSecret = process.env.TCP_SHARED_SECRET

	const tlsKeyFileName = process.env.TLS_KEY_FILE_NAME || ''
	const tlsCertFileName = process.env.TLS_CERT_FILE_NAME || ''
	const tlsCertPath = process.env.TLS_CERT_PATH || '/etc/ssl/certs/'
	const tlsCaFileName = process.env.CA_FILE_NAME
	const tlsRejectUnauthorized = process.env.REJECT_UNAUTHORIZED === 'true'

	return {
		tcpSharedSecret,
		tlsKeyFileName,
		tlsCertFileName,
		tlsCertPath,
		tlsCaFileName,
		tlsRejectUnauthorized,
		tcpPort,
		tcpHost,
		peers,
		levelDbPath,
		environment: process.env.ENVIRONMENT,
	}
}
