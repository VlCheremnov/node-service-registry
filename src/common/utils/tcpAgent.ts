import { createServer, Socket } from 'net'
import { PEERS, TCP_HOST, TCP_PORT } from '../constants'
import * as crypto from 'node:crypto'
import split2 from 'split2'
import { once, EventEmitter } from 'node:events'
import { TcpTypesEnum } from '../enums'
import { CommandType, EventEmitTcpDataType } from '../types'

type PeerInfo = { id: string; host: string; port: number }

export class TcpAgent extends EventEmitter {
	/* Список TCP агентов */
	private peers: PeerInfo[]
	/* Список TCP соединений */
	private sockets = new Map<string, Socket>()
	/* Текущий TCP агент */
	public readonly current: PeerInfo

	constructor(tcpHost: string, peers: string[]) {
		super()

		const parsedPeers = this.parsePeers([...peers, `${tcpHost}:${TCP_PORT}`])

		this.current = parsedPeers.find(({ host }) => host === tcpHost)!
		this.peers = parsedPeers.filter((p) => p.id !== this.current.id) // без себя
	}

	/** Формируем уникальный id для TCP агентов */
	private parsePeers(peers: string[]): PeerInfo[] {
		const parsedPeers: PeerInfo[] = []

		for (const peer of Array.from(new Set(peers))) {
			const [host, portStr] = peer.trim().toLowerCase().split(':')
			const port = Number(portStr) || TCP_PORT

			if (!host) continue

			parsedPeers.push({ id: this.createPeerId(peer), host, port })
		}
		return parsedPeers.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
	}

	/** Формируем уникальный ключ по имени хоста */
	private createPeerId(name: string) {
		return crypto.createHash('sha1').update(name).digest('hex').toString()
	}

	/** Запуск TCP-listener + исходящих коннектов */
	public start() {
		this.listen()
		this.dialOut() // исходящие
		setInterval(() => this.pingAll(), 10_000)
	}

	/** Создаем TCP сокет */
	private listen() {
		const srv = createServer((sock) => this.acceptInbound(sock))
		srv.listen(this.current.port, () => {
			console.log(`[${this.current.id}] TCP listen ${this.current.port}`)
		})
	}

	private acceptInbound(sock: Socket) {
		sock.setEncoding('utf8')
		sock.once('data', (id: string) => {
			const peerId = id.trim()
			if (!/^[0-9a-f]{40}$/i.test(peerId)) {
				sock.destroy(new Error('Bad peerId'))
				return
			}
			this.registerSocket(peerId, sock)
			this.attachDataHandler(peerId, sock)
		})
	}

	private dialOut() {
		for (const peer of this.peers) {
			if (peer.id > this.current.id) continue // чтобы не было дубликатов
			this.connectPeer(peer)
		}
	}

	private connectPeer(peer: PeerInfo) {
		const dial = () => {
			const sock = new Socket()

			sock.connect(peer.port, peer.host, () => {
				console.log(`[${this.current.id}] → dial ${peer.id}`)
				sock.write(this.current.id + '\n')
				this.registerSocket(peer.id, sock)
			})

			sock.setEncoding('utf8')
			this.attachDataHandler(peer.id, sock)
			sock.on('error', (err) => console.error(err))
			sock.on('close', () => {
				console.log('close')
				this.sockets.delete(peer.id)
				setTimeout(dial, 2_000)
			})
		}

		dial()
	}

	private registerSocket(id: string, sock: Socket) {
		const prev = this.sockets.get(id)
		if (prev && prev !== sock) prev.destroy() // убиваем дубликат
		this.sockets.set(id, sock)
		sock.on('close', () => this.sockets.delete(id))
	}

	private attachDataHandler(id: string, sock: Socket) {
		sock.pipe(split2()).on('data', (line) => this.onData(id, line))
	}

	private onData(fromId: string, line: string) {
		try {
			const obj: CommandType = JSON.parse(line)

			const eventData: EventEmitTcpDataType = { ...obj, fromId }

			this.emit(obj.type || TcpTypesEnum.Default, eventData)
		} catch (err) {
			/* bad frame — игнорируем или логируем */
			console.error('tcp onData err', err)
		}
	}

	private pingAll() {
		return this.broadcast({ type: TcpTypesEnum.Ping, ts: Date.now() })
	}

	public async broadcast(obj: CommandType) {
		const msg = this.getTcpMessage(obj)
		for (const sock of this.sockets.values()) await this.safeWrite(sock, msg)
	}

	public sendToPeer(peerId: string, obj: CommandType) {
		const sock = this.sockets.get(peerId)

		if (!sock) {
			throw new Error('Socket is not defined')
		}

		return this.safeWrite(sock, this.getTcpMessage(obj))
	}

	private getTcpMessage(obj: unknown): string {
		return JSON.stringify(obj) + '\n'
	}

	private async safeWrite(sock: Socket, msg: string) {
		/**
		 * Если send-буфер забит, то ждем "drain".
		 * "drain" гарантирует, что ОС освободила место для следующих пакетов. Тот пакет, ради которого вернулся false, уже в буфере ядра и отправится сам.
		 * */
		if (!sock.write(msg)) await once(sock, 'drain')
	}
}
