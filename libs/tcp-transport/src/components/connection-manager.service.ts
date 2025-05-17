import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common'
import { PeerManagementService } from '@lib/tcp-transport/components/peer-management.service'
import { DataHandlerService } from '@lib/tcp-transport/components/data-handler.service'
import * as net from 'net'
import * as tls from 'tls'
import * as fs from 'fs'
import * as path from 'path'
import { FrameDecoderService } from '@lib/tcp-transport/components/framing.servcie'
import { PeerInfo, TcpCommandType, TcpOptions } from '@lib/tcp-transport/types'
import {
	DEFAULT_RECONNECT_DELAY,
	MAX_DELAY,
	PEER_ID_RE,
	PENDING_BEFORE_CLOSING_DELAY,
} from '@lib/tcp-transport/constants'
import { TcpTypesEnum } from '@lib/tcp-transport/enums'

type Socket = net.Socket
type TlsServer = tls.Server
type NetServer = net.Server

@Injectable()
export class ConnectionManagerService {
	private readonly logger = new Logger(ConnectionManagerService.name)

	private isCloseServer: boolean = false
	private server: NetServer | TlsServer
	/* Список декодеров на каждый сокет */
	private decoders = new Map<Socket, FrameDecoderService>()
	/* Список TCP соединений */
	public sockets = new Map<string, Socket>()

	constructor(
		@Inject(forwardRef(() => PeerManagementService))
		private peerManagement: PeerManagementService,
		@Inject(forwardRef(() => DataHandlerService))
		private dataHandler: DataHandlerService,
		@Inject('TCP_OPTIONS') private readonly tcpOptions: TcpOptions
	) {}

	/** Закрытие приложения/транспорта */
	public async close() {
		this.isCloseServer = true

		await new Promise((resolve) =>
			setTimeout(resolve, PENDING_BEFORE_CLOSING_DELAY)
		)

		for (const s of this.sockets.values()) {
			s.destroy()
		}
		for (const d of this.decoders.values()) {
			d.reset()
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
		this.server = this.getTcpServer((sock) => {
			/* Создаем первое подключение между сокетами на регистрацию сокета в текущем кластере */
			const onData = (chunk: Buffer) => {
				if (this.handleRegisterFrame(sock, chunk)) {
					sock.off('data', onData)
				}
			}

			sock.on('data', onData)
		})
		this.server.listen(this.self.port, () => {
			this.logger.log(`[${this.self.id}] TCP listen ${this.self.port}`)
		})
	}

	private handleRegisterFrame(sock: Socket, chunk: Buffer) {
		const decoder = this.getDecoder(sock)

		for (const frame of decoder.push(chunk)) {
			const command = frame as TcpCommandType<{
				peerId: string
				ts: number
				sign: string
			}>

			const { peerId, sign, ts } = command?.data || {}

			/* Проверяем первый входящий запрос по сокету */
			/* Если получаем невалидный запрос - вызываем ошибку и возвращаем false */
			if (command.type !== TcpTypesEnum.RegisteredSocket)
				return sock.destroy(new Error('Socket not registered')), false
			if (!peerId) return sock.destroy(new Error('Not found "peerId"')), false
			if (!PEER_ID_RE.test(peerId))
				return sock.destroy(new Error('Bad peerId')), false
			if (!ts) return sock.destroy(new Error('Not found "ts"')), false
			if (!sign) return sock.destroy(new Error('Not found "sign"')), false
			if (!this.dataHandler.verifyRegisterFrame({ peerId, sign, ts }))
				return sock.destroy(new Error('Bad HMAC signature')), false

			this.logger.log('once', peerId)
			this.registerSocket(peerId, sock)

			return true
		}
	}

	/** Получаем нужный сервер в зависимости от enableTLS */
	private getTcpServer(
		callback: (sock: Socket) => void
	): NetServer | TlsServer {
		if (this.tcpOptions.enableTLS) {
			const {
				tls: {
					certPath = '/etc/ssl/certs/',
					keyFileName,
					certFileName,
					caFileName,
					rejectUnauthorized = false,
				} = {},
			} = this.tcpOptions

			this.logger.log('this.tcpOptions', this.tcpOptions)
			if (!keyFileName) {
				throw new Error('Not filled "keyFileName"')
			}

			if (!certFileName) {
				throw new Error('Not filled "certFileName"')
			}

			return tls.createServer(
				{
					key: fs.readFileSync(path.join(certPath, keyFileName)),
					cert: fs.readFileSync(path.join(certPath, certFileName)),
					ca: caFileName
						? fs.readFileSync(path.join(certPath, caFileName))
						: undefined,
					requestCert: true,
					rejectUnauthorized,
				},
				callback
			)
		} else {
			return net.createServer(callback)
		}
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
		let reconnectDelay = DEFAULT_RECONNECT_DELAY
		const dial = () => {
			/* reconnection storm */
			const delay =
				Math.min(MAX_DELAY, (reconnectDelay *= 2)) +
				Math.random() * 0.3 * reconnectDelay

			const sock = this.connectionSocket(peer)

			sock.once('connect', () => {
				const selfPeerId = this.peerManagement.self.id
				this.logger.log(`[${selfPeerId}] → dial ${peer.id}`)
				this.dataHandler.safeWrite(sock, {
					type: TcpTypesEnum.RegisteredSocket,
					data: this.dataHandler.buildRegisterFrame(selfPeerId),
				})
			})

			this.registerSocket(peer.id, sock)

			sock.once('close', () => {
				setTimeout(dial, delay)
			})
		}

		dial()
	}

	private connectionSocket(peer: PeerInfo): Socket {
		if (this.tcpOptions.enableTLS) {
			const {
				tls: { certPath = '/etc/ssl/certs/', caFileName, rejectUnauthorized },
			} = this.tcpOptions

			return tls.connect({
				host: peer.host,
				port: peer.port,
				ca: caFileName
					? fs.readFileSync(path.join(certPath, caFileName))
					: undefined,
				rejectUnauthorized,
			})
		} else {
			return new net.Socket().connect(peer.port, peer.host)
		}
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
