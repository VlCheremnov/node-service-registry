import { Injectable } from '@nestjs/common'
import { PeerInfo } from '@lib/tcp-transport/types'
import { TCP_PORT } from '@lib/tcp-transport/constants'
import * as crypto from 'node:crypto'

@Injectable()
export class PeerManagementProvider {
	constructor() {}

	public buildPeerList(
		selfPeerHost: string,
		selfPeerPort: number = TCP_PORT,
		otherPeers: string[]
	) {
		const formatedPeers = this.formatPeerInfo([
			...otherPeers,
			`${selfPeerHost}:${selfPeerPort}`,
		])

		const self = formatedPeers.find(
			(peer) => peer.host === selfPeerHost && peer.port == selfPeerPort
		)!
		const filteredPeers = formatedPeers.filter((p) => p.id !== self.id)

		return { filteredPeers, self }
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
