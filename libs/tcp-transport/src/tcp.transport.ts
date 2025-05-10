/** todo:
 *    1. Встроить Prometheus-клиент
 *    2. TLS-шифрование и аутентификация
 *    3. RxJS поверх TCP
 *    4. Описание в README и JSDoc
 *    */

import { CustomTransportStrategy, Server } from '@nestjs/microservices'
import { createServer, Socket, Server as NetServer } from 'net'
import {
	PeerInfo,
	TcpCommandType,
	EventEmitTcpDataType,
	TcpOptions,
	TcpResponse,
} from '@lib/tcp-transport/types'
import { TcpTypesEnum } from '@lib/tcp-transport/enums'
import * as crypto from 'node:crypto'
import { once } from 'node:events'
import { TCP_PORT } from '@lib/tcp-transport/constants'
import { encode, decode } from '@msgpack/msgpack'
import { Injectable } from '@nestjs/common'

@Injectable()
export class TcpTransport extends Server implements CustomTransportStrategy {
	private server: NetServer
	private readonly responseTimeout: number
	private drainSocketPromises = new Map<Socket, Promise<void>>()
	/* Список TCP соединений */
	private sockets = new Map<string, Socket>()
	/* Список TCP агентов */
	public peers: PeerInfo[]
	/* Текущий TCP агент */
	public readonly self: PeerInfo

	constructor({
		host,
		port = TCP_PORT,
		peers,
		responseTimeout = 1_000,
	}: TcpOptions) {
		super()

		const parsedPeers = this.parsePeers([...peers, `${host}:${port}`])

		this.self = parsedPeers.find(
			(peer) => peer.host === host && peer.port == port
		)!
		this.peers = parsedPeers.filter((p) => p.id !== this.self.id) // без себя
		this.responseTimeout = responseTimeout
	}

	/**
	 * Triggered when you run "app.listen()".
	 */
	listen(callback: () => void) {
		this.startListener()
		this.startDialers()
		// setInterval(() => this.pingAll(), 2_000)
		callback()
	}
	/** Пингуем все сокеты */
	private pingAll() {
		return this.broadcast({
			type: TcpTypesEnum.Ping,
			ts: Date.now(),
			data: { test: true, testMessage: 'pong' },
		})
	}

	/**
	 * Triggered on application shutdown.
	 */
	close() {
		/* todo: Добавить пендинг запросов на 2-5 секунды, чтобы все запросы успели получить/отдать ответ */
		for (const s of this.sockets.values()) {
			s.destroy()
			this.cleanupDrainSocket(s)
		}
		this.sockets.clear()
		this.server.close()
	}

	/**
	 * You can ignore this method if you don't want transporter users
	 * to be able to register event listeners. Most custom implementations
	 * will not need this.
	 */
	on(event: string, callback: Function) {
		throw new Error('Method not implemented.')
	}

	/**
	 * You can ignore this method if you don't want transporter users
	 * to be able to retrieve the underlying native server. Most custom implementations
	 * will not need this.
	 */
	unwrap<T = never>(): T {
		throw new Error('Method not implemented.')
	}

	/** Формируем уникальный id для TCP агентов */
	private parsePeers(peers: string[]): PeerInfo[] {
		const parsedPeers: PeerInfo[] = []

		for (const peer of Array.from(new Set(peers))) {
			const [host, portStr] = peer.trim().toLowerCase().split(':')
			const port = Number(portStr) || TCP_PORT

			if (!host) continue

			parsedPeers.push({ id: this.createPeerId(`${host}:${port}`), host, port })
		}
		return parsedPeers.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
	}

	/** Формируем уникальный ключ по имени хоста */
	private createPeerId(name: string) {
		return crypto.createHash('sha1').update(name).digest('hex').toString()
	}

	/** Запускаем сервер */
	private startListener() {
		this.server = createServer((sock) => {
			const decoder = new FrameDecoder()

			/* Создаем первое подключение между сокетами на регистрацию сокета в текущем кластере */
			sock.once('data', (chunk: Buffer) => {
				const [peerId] = decoder.push(chunk) as string[]
				console.log('once', peerId)
				if (!/^[0-9a-f]{40}$/i.test(peerId)) {
					sock.destroy(new Error('Bad peerId'))
					return
				}
				this.registerSocket(peerId, sock)
				this.attachDataHandler(peerId, sock, decoder)
			})
		})
		this.server.listen(this.self.port, () => {
			console.log(`[${this.self.id}] TCP listen ${this.self.port}`)
		})
	}

	/** Подключаем исходящие пиры */
	private startDialers() {
		for (const peer of this.peers) {
			if (peer.id > this.self.id) continue // чтобы не было дубликатов
			this.connectPeer(peer)
		}
	}

	/** Подключаемся к исходящему пиру */
	private connectPeer(peer: PeerInfo) {
		const dial = () => {
			const sock = new Socket()

			sock.connect(peer.port, peer.host, () => {
				console.log(`[${this.self.id}] → dial ${peer.id}`)
				this.safeWrite(sock, this.self.id)
				this.registerSocket(peer.id, sock)
			})

			this.attachDataHandler(peer.id, sock)
			sock.on('error', (err) => console.error(err))
			sock.on('close', () => {
				console.log(`sock close: [${this.self.id}] ←→ [${peer.id}]`)
				this.sockets.delete(peer.id)
				this.cleanupDrainSocket(sock)
				setTimeout(dial, 2_000)
			})
		}

		dial()
	}

	/** Регистрируем сокет */
	private registerSocket(id: string, sock: Socket) {
		const prev = this.sockets.get(id)
		if (prev && prev !== sock) prev.destroy() // убиваем дубликат

		this.sockets.set(id, sock)
		sock
			.once('close', this.cleanupDrainSocket.bind(this, sock))
			.once('error', this.cleanupDrainSocket.bind(this, sock))
	}

	private cleanupDrainSocket(sock: Socket) {
		this.drainSocketPromises.delete(sock)
	}

	/** Парсим и читаем сообщение */
	private attachDataHandler(
		fromId: string,
		sock: Socket,
		decoder = new FrameDecoder()
	) {
		sock.on('data', async (chunk: Buffer) => {
			for (let chunkCommand of decoder.push(chunk)) {
				try {
					const command = chunkCommand as TcpCommandType

					if (command.isResponse) {
						console.log('Получаем ответ')
						sock.emit(`response:${command.id}`, command.data)
						return
					}

					const handler = this.messageHandlers.get(command.type)
					if (!handler) return

					const eventData: EventEmitTcpDataType = { ...command, fromId }

					// Nest ждёт Observable/Promise/значение
					const resp$ = this.transformToObservable(await handler(eventData))
					// если есть ответ — отправляем обратно
					resp$.subscribe(async (data) => {
						if (data && command.id) {
							/* Отправляем ответ обратно */
							console.log('Отправляем ответ: ', data)
							return this.safeWrite(sock, {
								isResponse: true,
								type: command.type,
								id: command.id,
								data,
							})
						}
					})
				} catch (err) {
					/* bad frame — игнорируем или логируем */
					console.error('tcp onData err', err)
				}
			}
		})
	}

	/** Отправить сообщение на все сокеты */
	public async broadcast<T = any>(obj: TcpCommandType) {
		console.log(
			'Array.from(this.sockets.keys())',
			Array.from(this.sockets.keys())
		)
		return await Promise.allSettled(
			Array.from(this.sockets.keys()).map((peerId) =>
				this.sendMessage<T>(this.sockets.get(peerId)!, obj, peerId)
			)
		)
	}

	/** Отправить сообщение по id сокета */
	public sendToPeer(peerId: string, obj: TcpCommandType) {
		const sock = this.sockets.get(peerId)

		if (!sock) {
			throw new Error('Socket is not defined')
		}

		return this.sendMessage(sock, obj, peerId)
	}

	async sendMessage<T = any>(
		sock: Socket,
		payload: TcpCommandType,
		peerId: string
	): Promise<TcpResponse<T>> {
		const id = crypto.randomUUID()

		await this.safeWrite(sock, { ...payload, id } as TcpCommandType)

		return new Promise(async (resolve, reject) => {
			const event = `response:${id}`
			const ac = new AbortController()

			setTimeout(
				() => ac.abort(new Error('TIMEOUT 10 с')),
				this.responseTimeout
			)

			try {
				const [payload] = await once(sock, event, {
					signal: ac.signal,
				})

				resolve({ peerId, payload } as TcpResponse<T>)
			} catch (err) {
				if (err.code === 'ABORT_ERR') {
					err = new Error('Timeout')
					resolve({
						peerId,
						err: {
							name: 'Timeout',
							message: `Request timed out after ${this.responseTimeout}ms`,
							code: 'TIMEOUT',
						},
					} as TcpResponse<T>)
				} else {
					reject(err)
				}
			}
		})
	}

	/** Отправляем сообщение */
	private async safeWrite(
		sock: Socket,
		data: string | number | Record<any, any>
	) {
		/**
		 * Если send-буфер забит, то ждем "drain".
		 * "drain" гарантирует, что ОС освободила место для следующих пакетов. Тот пакет, ради которого вернулся false, уже в буфере ядра и отправится сам.
		 * */
		const frame = encodeFrame(data)

		if (sock.write(frame)) return

		// Ждем пока освободится буфер или 5 секунд
		await Promise.race([
			this.getDrainPromise(sock),
			/*todo: вынести таймаут в переменные*/
			new Promise((resolve, reject) =>
				setTimeout(() => reject(new Error('DRain timeout >5s')), 5_000)
			),
		])

		// Если повторный запрос не ушел - считаем его "тяжелым" и закрываем сокет
		/* todo: Продумать реконект или что-нибудь еше */
		if (!sock.write(frame)) {
			sock.destroy(new Error('Persistent back-pressure'))
		}
	}

	private getDrainPromise(sock: Socket): Promise<void> {
		let promise = this.drainSocketPromises.get(sock)
		if (!promise) {
			promise = once(sock, 'drain').then(() => {
				this.cleanupDrainSocket(sock)
			})
			this.drainSocketPromises.set(sock, promise)
		}
		return promise
	}
}

/** Версия протокола, в случае изменения сетевого протокола или формата сообщений поднять версию */
/** Можно добавить совместимость со старыми версиями */
export const PROTOCOL_VERSION = 1

export function encodeFrame(obj: unknown): Buffer {
	const body = Buffer.from(encode(obj)) // ⬅️  оборачиваем
	const frame = Buffer.allocUnsafe(4 + 1 + body.length)

	frame.writeUInt32BE(1 + body.length, 0) // length
	frame.writeUInt8(PROTOCOL_VERSION, 4) // version
	body.copy(frame, 5) // теперь copy работает

	return frame
}

export class FrameDecoder {
	private buffer = Buffer.alloc(0)
	private maxBuffer = 4 * 1024 * 1024 // 4 МБ

	/** feed raw chunk, get array of decoded payloads */
	push(chunk: Buffer): unknown[] {
		this.buffer = Buffer.concat([this.buffer, chunk])

		if (this.buffer.length > this.maxBuffer) {
			throw new Error('Inbound buffer overflow')
		}

		const messages: unknown[] = []

		while (this.buffer.length >= 4) {
			const len = this.buffer.readUInt32BE(0)
			if (this.buffer.length < 4 + len) break
			const version = this.buffer.readUInt8(4)
			if (version !== PROTOCOL_VERSION) throw new Error('Bad protocol version')

			const payload = this.buffer.subarray(5, 4 + len)
			messages.push(decode(payload))

			this.buffer = this.buffer.subarray(4 + len)
		}
		return messages
	}
}
