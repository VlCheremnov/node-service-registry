import { TcpTypesEnum } from '@lib/tcp-transport/enums'
import { ModuleMetadata } from '@nestjs/common'

export interface PeerInfo {
	id: string
	host: string
	port: number
}

export interface TcpCommandType<Payload = Record<any, any>> {
	isResponse?: boolean
	id?: string
	type: TcpTypesEnum
	ts?: number
	data?: Payload
}

export interface EventEmitTcpDataType<T = Record<any, any>>
	extends TcpCommandType<T> {
	fromId: string
}

export interface TcpOptions {
	host: string
	port?: number
	responseTimeout?: number
	peers: string[]
}
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
