/**
 * 1. Госсип сервис - это аллгоритм, который не принимает данные
 * 2. Транспорт общается между всеми агентами
 * 3. Конроллер принимает и обрабатывает сообщения tcp и выполняет бизнес логику, включая методы госсип
 * */

/** todo: Отправку сообщений можно оставить в данном сервисе, обработку бизнес логики надо перенести в контроллер  */

import {
	Injectable,
	OnModuleInit,
	OnModuleDestroy,
	Logger,
} from '@nestjs/common'
import {
	DigestType,
	GossipReqDigestType,
	GossipReqFetchRecordsType,
	GossipReqRecordsType,
	MakeOptional,
	ServiceIdType,
	ServiceRecordType,
} from '../types'
import { TcpTransport } from '@lib/tcp-transport'
import { TransportType } from '../enums'

@Injectable()
export class GossipService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(GossipService.name)

	/** todo: Добавить ownerId (peerId) чтобы данные мог изменять только родитель */
	/** todo: Решить кейс, что owner может упасть */
	/** Локальный кэш */
	private readonly state = new Map<ServiceIdType, ServiceRecordType>()

	/** Период рассылки госсипа */
	private readonly interval = 10_000
	/** Таймер для рассылки */
	private timer: NodeJS.Timeout | null = null

	constructor(private readonly tcp: TcpTransport) {}

	/** Получить актуальный список сервисов */
	public getAllServices(): ServiceRecordType[] {
		return Array.from(this.state.values())
	}

	/** Получить сервис по id */
	public getService(id: ServiceIdType) {
		return this.state.get(id)
	}

	/** Получаем рандомный узел */
	private getRandomPeer() {
		const peerLength = this.tcp.getOtherPeers.length

		if (!peerLength) return

		const randomIndex = Math.floor(Math.random() * peerLength)

		return this.tcp.getOtherPeers[randomIndex]
	}

	/** ID текущего узла */
	private get getSelfId() {
		return this.tcp.getSelfPeer.id
	}

	/** карта serviceId -> версия */
	private getMapVersions(): DigestType {
		const digest: DigestType = {}
		Array.from(this.state.values()).forEach(
			(rec) => (digest[rec.id] = rec.version)
		)

		return digest
	}

	onModuleInit() {
		// Стартуем периодический цикл рассылки
		this.timer = setInterval(this.gossipCycle.bind(this), this.interval)
	}
	onModuleDestroy() {
		// Удаляем таймер
		if (this.timer) clearInterval(this.timer)
	}

	/**
	 * Регистрируем / обновляем собственный сервис в локальном состоянии
	 * (вызывается, например, при запуске приложения или изменении health-статуса)
	 */
	public upsertLocalService(
		record: MakeOptional<ServiceRecordType, 'ownerId' | 'version'>
	) {
		const service = this.state.get(record.id)

		if (record.version && service && record.version < service.version) {
			return
		}

		/** Если версия пришли извне, то обновляем запись и сохраняем, иначе обновляем текущую или сохраняем 1 по дефолту */
		const version = record.version || (service ? service.version + 1 : 1)

		/** Обновленная запись */
		const next = {
			...record,
			version,
			ownerId: record.ownerId ?? this.getSelfId,
		}

		this.state.set(record.id, next)

		this.logger.debug(
			`Local service "${service}" updated → version ${next.version}`
		)
	}
	public upsertManyLocalService(
		records: MakeOptional<ServiceRecordType, 'ownerId' | 'version'>[]
	) {
		records.forEach((service) => this.upsertLocalService(service))
	}

	/** Выбираем случайного соседа и рассылаем digest */
	private async gossipCycle() {
		const peer = this.getRandomPeer()
		if (!peer) return

		const digest = this.getMapVersions()

		await this.sendDigest(digest, peer.id)
	}

	private async sendDigest(digest: DigestType, peerId: string) {
		const msg: GossipReqDigestType = { isDigest: true, digest }

		try {
			const res = await this.tcp.sendToPeer(peerId, {
				type: TransportType.GossipDigest,
				data: msg,
			})
			this.logger.debug(`→ digest отправлен peer=${peerId}.`)

			return res
		} catch (e) {
			this.logger.warn(`Не удалось отправить digest peer=${peerId}: ${e}`)
		}
	}

	private async sendRecords(records: ServiceRecordType[], peerId: string) {
		const msg: GossipReqRecordsType = { isDigest: false, records }

		try {
			const res = await this.tcp.sendToPeer(peerId, {
				type: TransportType.GossipRecord,
				data: msg,
			})
			this.logger.debug(`→ records отправлены peer=${peerId}.`)

			return res
		} catch (e) {
			this.logger.warn(`Не удалось отправить digest peer=${peerId}: ${e}`)
		}
	}

	private async fetchServicesFromPeer(
		recordIds: ServiceIdType[],
		peerId: string
	) {
		const msg: GossipReqFetchRecordsType = { isDigest: false, recordIds }

		try {
			const res = await this.tcp.sendToPeer<ServiceRecordType[]>(peerId, {
				type: TransportType.GossipFetchServices,
				data: msg,
			})
			this.logger.debug(`→ records отправлены peer=${peerId}.`)

			return res
		} catch (e) {
			this.logger.warn(`Не удалось отправить digest peer=${peerId}: ${e}`)
		}
	}

	/**
	 * Получаем digest соседа и отвечаем данными, если у нас есть более новая версия
	 *
	 * (Вызываем через контроллер)
	 * */
	public async processDigest(data: GossipReqDigestType, fromId: string) {
		const digest = data.digest

		const delta: ServiceRecordType[] = []
		const digestIds: ServiceIdType[] = []

		// Сравниваем версии: собираем то, что у нас свежее
		this.getAllServices().forEach((service) => {
			const peerVer = digest[service.id] ?? 0

			if (service.version > peerVer) {
				delta.push(service)
			}
		})

		// Сравниваем версии: собираем то, что у нас устарело
		for (const [serviceId, digestVersion] of Object.entries(data.digest)) {
			const service = this.getService(serviceId)

			const serviceVersion = service?.version ?? 0

			if (digestVersion > serviceVersion) {
				/* Если есть несвежая версия или отсутствует сервис */
				digestIds.push(serviceId)
			}
		}

		console.log('delta', delta)
		console.log('digestIds', digestIds)

		/* Если у агента есть версии свежее отправляем обратно */
		if (delta.length) {
			await this.sendRecords(delta, fromId)
		}

		if (digestIds.length) {
			const res = await this.fetchServicesFromPeer(digestIds, fromId)

			console.log('digestIds.length res', res)

			const fetchServices = res?.data || []

			if (!fetchServices.length) {
				this.logger.error('Services not found')
				return
			}

			fetchServices.forEach((service) => {
				const prevVersion = this.getService(service.id)?.version ?? 0

				/* Убедимся что за время сессии сервис по прежнему устаревший */
				if (prevVersion >= service.version) {
					return
				}

				this.state.set(service.id, service)
			})
		}
	}

	/** Мержим новые или обновленные записи */
	public mergeRecords(data: GossipReqRecordsType, fromId: string) {}

	/** Сливаем полученные записи в локальный кэш */
}
