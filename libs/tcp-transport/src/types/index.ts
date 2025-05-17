import { ModuleMetadata } from '@nestjs/common'

export interface PeerInfo {
	id: string
	host: string
	port: number
}

export interface TcpCommandType<Payload = Record<any, any>> {
	/* Ответ/запрос */
	isResponse?: boolean
	/* Трассировка запроса */
	id?: string
	/* Тип команды */
	type: string
	/* Временная метка */
	ts?: number
	/* Тело запроса */
	data?: Payload
}

export interface EventEmitTcpDataType<T = Record<any, any>>
	extends TcpCommandType<T> {
	fromId: string
}

export interface TcpBaseOptions {
	host: string
	port?: number
	responseTimeout?: number
	peers: string[]
	sharedSecret: string // секретная фраза для HMAC
}

interface TcpDevOptions extends TcpBaseOptions {
	enableTLS?: false
}

export interface TcpSecurityOptions extends TcpBaseOptions {
	enableTLS: true
	tls: {
		keyFileName: string // PEM-файлы
		certFileName: string
		certPath?: string // по умолчанию /etc/ssl/certs/
		caFileName?: string // доверенные ЦС
		rejectUnauthorized?: boolean // off в dev для self-signed
	}
}

export type TcpOptions = TcpDevOptions | TcpSecurityOptions

export interface TcpModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
	inject?: any[]
	useFactory: (...args: any[]) => TcpOptions
}

export interface TcpResponse<T> {
	peerId: string
	data?: T
	error?: {
		name: string
		message: string
		code?: string
		stack?: string
	}
}
