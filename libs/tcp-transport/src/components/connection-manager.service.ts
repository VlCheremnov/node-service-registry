import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common'
import { PeerManagementService } from '@lib/tcp-transport/components/peer-management.service'
import { DataHandlerService } from '@lib/tcp-transport/components/data-handler.service'
import { createServer, Server as NetServer, Socket } from 'net'
import { FrameDecoderService } from '@lib/tcp-transport/components/framing.servcie'
import { PeerInfo, TcpCommandType } from '@lib/tcp-transport/types'

@Injectable()
export class ConnectionManagerService {
	private readonly logger = new Logger(ConnectionManagerService.name)

	private isCloseServer: boolean = false
	private server: NetServer
	/* Список декодеров на каждый сокет */
	private decoders = new Map<Socket, FrameDecoderService>()
	/* Список TCP соединений */
	public sockets = new Map<string, Socket>()

	private reconnectDelay = 2_000

	constructor(
		@Inject(forwardRef(() => PeerManagementService))
		private peerManagement: PeerManagementService,
		@Inject(forwardRef(() => DataHandlerService))
		private dataHandler: DataHandlerService
	) {}

	/** Закрытие приложения/транспорта */
	public async close() {
		this.isCloseServer = true
		/* todo: Добавить пендинг запросов на 2-5 секунды, чтобы все запросы успели получить/отдать ответ */
		await new Promise((resolve) => setTimeout(resolve, 3_000))

		for (const s of this.sockets.values()) {
			s.destroy()
		}
		this.sockets.clear()
		this.decoders.clear()
		this.server.close()
	}

	private get self() {
		return this.peerManagement.self
	}
	private get peers() {
		return this.peerManagement.peers
	}

	/** Запускает сервер */
	public start() {
		this.isCloseServer = false
		this.createServer()
		this.connectDialers()
	}

	/** Создаем сервер */
	private createServer() {
		this.server = createServer((sock) => {
			const decoder = this.getDecoder(sock)

			/* Создаем первое подключение между сокетами на регистрацию сокета в текущем кластере */
			sock.once('data', (chunk: Buffer) => {
				const [peerId] = decoder.push(chunk) as string[]
				this.logger.log('once', peerId)
				if (!/^[0-9a-f]{40}$/i.test(peerId)) {
					sock.destroy(new Error('Bad peerId'))
					return
				}
				this.registerSocket(peerId, sock)
			})
		})
		this.server.listen(this.self.port, () => {
			this.logger.log(`[${this.self.id}] TCP listen ${this.self.port}`)
		})
	}
	/** Подключаем исходящие пиры */
	private connectDialers() {
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
				this.logger.log(`[${this.peerManagement.self.id}] → dial ${peer.id}`)
				this.dataHandler.safeWrite(sock, this.peerManagement.self.id)
			})

			this.registerSocket(peer.id, sock)

			sock.once('close', () => {
				setTimeout(dial, this.reconnectDelay)
			})
		}

		dial()
	}

	/** Регистрируем сокет */
	private registerSocket(peerId: string, sock: Socket) {
		const prev = this.sockets.get(peerId)
		if (prev && prev !== sock) prev.destroy() // убиваем дубликат

		this.sockets.set(peerId, sock)

		sock
			.once('error', (err) => this.logger.error('error socker: ', err))
			.once('close', () => {
				this.logger.log(
					`sock close: [${this.peerManagement.self.id}] ←→ [${peerId}]`
				)
				this.deleteSocket(peerId)
			})

		this.attachDataHandler(peerId, sock)
	}

	/** Удаляем сокет */
	private deleteSocket(
		peerId: string,
		sock: Socket | undefined = this.getSocket(peerId)
	) {
		if (!sock) {
			return
		}

		this.deleteDecoder(sock)
		this.dataHandler.cleanupDrainSocket(sock)
		this.sockets.delete(peerId)
	}

	/** Удаляем декодер */
	private deleteDecoder(sock: Socket) {
		const decoder = this.getDecoder(sock)
		decoder.reset()
		this.decoders.delete(sock)
	}

	/** Вернет декодер или создаст новый */
	public getDecoder(sock: Socket): FrameDecoderService {
		return this.decoders.get(sock) ?? this.createAndRegisterDecoder(sock)
	}

	/** Получаем сокет по id */
	public getSocket(peerId: string) {
		return this.sockets.get(peerId)
	}

	/** Создаем декодер */
	private createAndRegisterDecoder(sock: Socket): FrameDecoderService {
		const decoder = new FrameDecoderService()
		this.decoders.set(sock, decoder)
		return decoder
	}

	/** Парсим и читаем сообщение */
	private attachDataHandler(fromId: string, sock: Socket) {
		const decoder = this.getDecoder(sock)

		sock.on('data', async (chunk: Buffer) => {
			if (this.isCloseServer) throw new Error('Server is closed!')

			for (let chunkCommand of decoder.push(chunk)) {
				const command = chunkCommand as TcpCommandType

				this.dataHandler.acceptRequest({ ...command, fromId }, sock)
			}
		})
	}
}
