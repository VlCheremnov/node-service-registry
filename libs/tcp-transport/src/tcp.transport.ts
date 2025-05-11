/** todo:
 *    1. Встроить Prometheus-клиент
 *    2. TLS-шифрование и аутентификация
 *    3. RxJS поверх TCP
 *    4. Описание в README и JSDoc
 *    */

import {
	CustomTransportStrategy,
	MessageHandler,
	Server,
} from '@nestjs/microservices'
import { createServer, Socket, Server as NetServer } from 'net'
import { PeerInfo, TcpCommandType, TcpOptions } from '@lib/tcp-transport/types'
import { TcpTypesEnum } from '@lib/tcp-transport/enums'
import { forwardRef, Inject, Injectable } from '@nestjs/common'
import { FrameDecoderService } from '@lib/tcp-transport/components/framing.servcie'
import { PeerManagementService } from '@lib/tcp-transport/components/peer-management.service'
import { DataHandlerService } from '@lib/tcp-transport/components/data-handler.service'

@Injectable()
export class TcpTransport extends Server implements CustomTransportStrategy {
	private server: NetServer
	private drainSocketPromises = new Map<Socket, Promise<void>>()
	/* Список TCP соединений */
	private sockets = new Map<string, Socket>()

	constructor(
		@Inject('TCP_OPTIONS') private readonly opts: TcpOptions,
		// @Inject(forwardRef(() => PeerManagementService))
		private peerManagement: PeerManagementService,
		// @Inject(forwardRef(() => DataHandlerService))
		private dataHandler: DataHandlerService
	) {
		super()
	}

	public get self() {
		return this.peerManagement.self
	}

	public get peers() {
		return this.peerManagement.peers
	}

	getHandler(type: TcpTypesEnum) {
		return this.messageHandlers.get(type)
	}

	/**
	 * Triggered when you run "app.listen()".
	 */
	listen(cb: () => void) {
		/** Ждем пока все соединения пройдут и после вызываем callback */
		this.startListener()
		this.startDialers()
		// setInterval(() => this.pingAll(), 2_000)
		cb()
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

	/** Запускаем сервер */
	private startListener() {
		this.server = createServer((sock) => {
			const decoder = new FrameDecoderService()

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
				this.dataHandler.safeWrite(sock, this.self.id)
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
		decoder = new FrameDecoderService()
	) {
		sock.on('data', async (chunk: Buffer) => {
			for (let chunkCommand of decoder.push(chunk)) {
				const command = chunkCommand as TcpCommandType

				this.dataHandler.acceptRequest({ ...command, fromId }, sock)
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
				this.dataHandler.sendMessage<T>(this.sockets.get(peerId)!, obj, peerId)
			)
		)
	}

	/** Отправить сообщение по id сокета */
	public sendToPeer(peerId: string, obj: TcpCommandType) {
		const sock = this.sockets.get(peerId)

		if (!sock) {
			throw new Error('Socket is not defined')
		}

		return this.dataHandler.sendMessage(sock, obj, peerId)
	}
}
