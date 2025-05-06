import { TcpTypesEnum } from '../enums'

export interface ServiceInfo {
	name: string
	type: string
	url: string
	healthPath: string
	lastHeartbeat: number
	serviceAvailable: boolean
}

export interface CommandType<T = Record<any, any>> {
	type: TcpTypesEnum
	ts: number
	data?: T
}

export interface EventEmitTcpDataType<T = Record<any, any>>
	extends CommandType<T> {
	fromId: string
}

export interface PeerInfo {
	id: string
	host: string
	port: number
}
