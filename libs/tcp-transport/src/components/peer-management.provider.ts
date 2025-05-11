import { Inject, Injectable } from '@nestjs/common'
import { PeerInfo, TcpOptions } from '@lib/tcp-transport/types'
import { TCP_PORT } from '@lib/tcp-transport/constants'
import * as crypto from 'node:crypto'

@Injectable()
export class PeerManagementProvider {
	/* Список TCP агентов */
	public peers: PeerInfo[]
	/* Текущий TCP агент */
	public self: PeerInfo

	constructor(@Inject('TCP_OPTIONS') private readonly cfg: TcpOptions) {
		const {
			peers: otherPeers,
			host: selfPeerHost,
			port: selfPeerPort = TCP_PORT,
		} = this.cfg

		const formatedPeers = this.formatPeerInfo([
			...otherPeers,
			`${selfPeerHost}:${selfPeerPort}`,
		])

		this.self = formatedPeers.find(
			(peer) => peer.host === selfPeerHost && peer.port == selfPeerPort
		)!
		this.peers = formatedPeers.filter((p) => p.id !== this.self.id)
	}

	/** Формируем объект { id, host, port } */
	private formatPeerInfo(peers: string[]): PeerInfo[] {
		const parsedPeers: PeerInfo[] = []

		for (const peer of Array.from(new Set(peers))) {
			const [host, portStr] = peer.trim().toLowerCase().split(':')
			const port = Number(portStr) || TCP_PORT

			if (!host) continue

			const id = this.createPeerId(host, port)

			parsedPeers.push({ id, host, port })
		}

		return parsedPeers.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
	}

	/** Формируем уникальный ключ по имени хоста и порту */
	private createPeerId(host: string, port: number) {
		return crypto
			.createHash('sha1')
			.update(`${host}:${port}`)
			.digest('hex')
			.toString()
	}
}
