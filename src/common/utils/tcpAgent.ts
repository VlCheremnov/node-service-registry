import { createServer, Socket } from 'net'
import { PEERS, TCP_HOST, TCP_PORT } from '../constants'
import * as crypto from 'node:crypto'

type PeerInfo = { id: string; host: string }

export class TcpAgent {
	/* Список TCP агентов */
	private peers: PeerInfo[]
	/* Список TCP соединений */
	private sockets = new Map<string, Socket>()
	/* Текущий TCP агент */
	private readonly currentPeer: PeerInfo
	/* Порт на котором запускается TCP */
	private readonly tcpPort = TCP_PORT

	constructor(tcpHost: string = TCP_HOST, peers: string[] = PEERS) {
		const parsedPeers = this.parsePeers([...peers, tcpHost])

		this.currentPeer = parsedPeers.find(({ host }) => host === tcpHost)!

		this.peers = parsedPeers.filter((p) => p.id !== this.currentPeerId) // без себя
	}

	get currentPeerId() {
		return this.currentPeer.id
	}

	/** Формируем уникальный id для TCP агентов */
	private parsePeers(peers: string[]): PeerInfo[] {
		return peers
			.map((s) => s.split(':')[0])
			.map((s) => s.trim())
			.filter(Boolean)
			.map((host) => ({
				host,
				id: this.createCryptoId(host),
			}))
			.sort((a, b) => Number(a.id) - Number(b.id))
	}

	/** Формируем уникальный ключ по имени хоста */
	createCryptoId(name: string) {
		return crypto
			.createHash('sha1')
			.update(name)
			.digest()
			.readUInt32BE(0)
			.toString()
	}

	/** Запуск TCP-listener + исходящих коннектов */
	start() {
		this.createListener()
		this.dialOut() // исходящие
	}

	/** Создаем TCP сокет */
	private createListener() {
		createServer((sock) => {
			/* sock - входящее TCP-соединение «удалённый узел ←→ текущий узел» */

			sock.setEncoding('utf8')
			sock.once('data', (id: string) => {
				// Первое сообщение от клиента должен быть его peerId
				const remoteId = id.trim()

				// Проверяем, что нам точно пришел id
				if (!isNaN(Number(remoteId))) {
					this.sockets.set(remoteId, sock)

					sock.on('data', (chunk) => {
						this.onData(remoteId, chunk)
					})
				} else {
					/* todo: Вместо исключения можно делать реконект */
					// Если первым не пришел id - выдаем исключение
					throw Error('Received an unexpected answer')
				}
			})
		}).listen(this.tcpPort, () =>
			console.log(`[${this.currentPeerId}] TCP listening ${this.tcpPort}`)
		)
	}

	/** Отправить JSON-объект всем peer’ам */
	/* todo: доработать на промисы */
	broadcast(obj: unknown) {
		const msg = JSON.stringify(obj) + '\n'

		for (const sock of this.sockets.values())
			sock.write(msg, (err?: Error) => {
				console.log('err', err)
			})
	}

	/** Подключаем исходящие пиры */
	private dialOut() {
		for (const peer of this.peers) {
			if (peer.id > this.currentPeerId) continue // правило, чтобы не было двойных каналов
			this.connectToPeer(peer)
		}

		// setInterval(() => this.pingAll(), 1_000) // heartbeat
	}

	private connectToPeer(peer: PeerInfo) {
		const sock = new Socket()
		const connect = () => {
			sock.connect(this.tcpPort, peer.host, () => {
				console.log(`[${this.currentPeerId}] ↔ connected ${peer.id}`)

				sock.write(this.currentPeerId + '\n')

				this.sockets.set(peer.id, sock)
			})
		}

		sock.setEncoding('utf8')

		sock.on('data', (chunk: string) => {
			this.onData(peer.id, chunk)
		})
		sock.on('error', (err) => console.error(err))
		sock.on('close', () => setTimeout(connect, 2000))

		connect()
	}

	private onData(from: string, chunk: string) {
		try {
			/* Обработка */
		} catch {
			/* ignore partial frames */
		}
	}
}
