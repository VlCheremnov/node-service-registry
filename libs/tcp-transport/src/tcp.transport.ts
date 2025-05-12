/** todo:
 *    1. Встроить Prometheus-клиент
 *    2. TLS-шифрование и аутентификация
 *    3. RxJS поверх TCP
 *    4. Описание в README и JSDoc
 *    5. Метрики
 *    6. Тесты
 *      - Юнит-тесты
 *      - E2E-тест
 *      - Contract-тесты
 *      - Нагрузочный тест
 *    */

import { CustomTransportStrategy, Server } from '@nestjs/microservices'
import { TcpCommandType, TcpOptions } from '@lib/tcp-transport/types'
import { TcpTypesEnum } from '@lib/tcp-transport/enums'
import { forwardRef, Inject, Injectable } from '@nestjs/common'
import { PeerManagementService } from '@lib/tcp-transport/components/peer-management.service'
import { DataHandlerService } from '@lib/tcp-transport/components/data-handler.service'
import { ConnectionManagerService } from '@lib/tcp-transport/components/connection-manager.service'

@Injectable()
export class TcpTransport extends Server implements CustomTransportStrategy {
	constructor(
		@Inject(forwardRef(() => PeerManagementService))
		private peerManagement: PeerManagementService,
		@Inject(forwardRef(() => DataHandlerService))
		private dataHandler: DataHandlerService,
		@Inject(forwardRef(() => ConnectionManagerService))
		private connectionManager: ConnectionManagerService
	) {
		super()
	}

	public getHandler(type: TcpTypesEnum) {
		return this.messageHandlers.get(type)
	}

	/**
	 * Triggered when you run "app.listen()".
	 */
	listen(cb: () => void) {
		this.connectionManager.start()
		cb()
	}

	/**
	 * Triggered on application shutdown.
	 */
	async close() {
		this.dataHandler.close()
		this.peerManagement.close()
		await this.connectionManager.close()
	}

	on(event: string, callback: Function) {
		throw new Error('Method not implemented.')
	}
	unwrap<T = never>(): T {
		throw new Error('Method not implemented.')
	}

	/** Пингуем все сокеты (Оставим для тестов) */
	private pingAll() {
		return this.broadcast({
			type: TcpTypesEnum.Ping,
			ts: Date.now(),
			data: { test: true, testMessage: 'pong' },
		})
	}

	/** Отправить сообщение на все сокеты */
	public async broadcast<T = any>(obj: TcpCommandType) {
		return await Promise.allSettled(
			Array.from(this.connectionManager.sockets.keys()).map((peerId) =>
				this.dataHandler.sendMessage<T>(
					this.connectionManager.getSocket(peerId)!,
					obj,
					peerId
				)
			)
		)
	}

	/** Отправить сообщение по id сокета */
	public sendToPeer(peerId: string, obj: TcpCommandType) {
		const sock = this.connectionManager.getSocket(peerId)

		if (!sock) {
			throw new Error('Socket is not defined')
		}

		return this.dataHandler.sendMessage(sock, obj, peerId)
	}
}
