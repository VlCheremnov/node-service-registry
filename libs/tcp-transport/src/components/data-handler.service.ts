import { forwardRef, Inject, Injectable } from '@nestjs/common'
import {
	EventEmitTcpDataType,
	TcpCommandType,
	TcpOptions,
	TcpResponse,
} from '@lib/tcp-transport/types'
import { Socket } from 'net'
import { MessageHandler } from '@nestjs/microservices'
import { Observable } from 'rxjs'
import { encodeFrame } from '@lib/tcp-transport/components/framing.servcie'
import { once } from 'node:events'
import * as crypto from 'node:crypto'
import { TcpTransport } from '@lib/tcp-transport'

@Injectable()
export class DataHandlerService {
	private drainSocketPromises = new Map<Socket, Promise<void>>()
	private responseTimeout: number

	constructor(
		@Inject(forwardRef(() => TcpTransport))
		private readonly transport: TcpTransport,
		@Inject('TCP_OPTIONS') private readonly cfg: TcpOptions
	) {
		this.responseTimeout = this.cfg.responseTimeout ?? 1_000
	}

	/** Формируем наименование ивента для ответа */
	private getResponseEventName(id: string) {
		return `response:${id}`
	}

	/** Обрабатываем ответ и отправляем ответ, если он есть */
	async acceptRequest(command: EventEmitTcpDataType, sock: Socket) {
		try {
			if (command.isResponse && command.id) {
				console.log('Получаем ответ')
				sock.emit(this.getResponseEventName(command.id), command.data)
				return
			}

			const handler = this.transport.getHandler(command.type)
			if (!handler) return

			// Nest ждёт Observable/Promise/значение
			const resp$ = this.transport.transformToObservable(await handler(command))
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

	/** Вызываем safeWrite и ждем обратного ответа */
	async sendMessage<T = any>(
		sock: Socket,
		payload: TcpCommandType,
		peerId: string
	): Promise<TcpResponse<T>> {
		/* Формируем уникальный id запроса */
		const id = crypto.randomUUID().replace(/-/g, '')

		await this.safeWrite(sock, { ...payload, id } as TcpCommandType)

		return new Promise(async (resolve, reject) => {
			const event = this.getResponseEventName(id)
			const ac = new AbortController()

			setTimeout(
				() => ac.abort(new Error(`TIMEOUT ${this.responseTimeout / 1000} s.`)),
				this.responseTimeout
			)

			try {
				const [payload] = await once(sock, event, {
					signal: ac.signal,
				})

				resolve({ peerId, payload } as TcpResponse<T>)
			} catch (err) {
				if (err.code === 'ABORT_ERR') {
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
	public async safeWrite(
		sock: Socket,
		data: string | number | Record<any, any>
	) {
		/**
		 * Если send-буфер забит, то ждем "drain".
		 * "drain" гарантирует, что ОС освободила место для следующих пакетов
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
		/* todo: Продумать реконект или очищать все состояние */
		if (!sock.write(frame)) {
			sock.destroy(new Error('Persistent back-pressure'))
		}
	}

	/** Получаем промис для очистки памяти если сообщение не отправилось */
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

	/** Подчищаем неиспользуемые промисы */
	private cleanupDrainSocket(sock: Socket) {
		this.drainSocketPromises.delete(sock)
	}
}
