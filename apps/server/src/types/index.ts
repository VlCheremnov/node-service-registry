export type ServiceIdType = string

export interface ServiceRecordType {
	id: ServiceIdType // уникальный id сервиса (например, UUID)
	name: string // “orders-api”, “auth-service” и т.д.
	version: number // монотонно растущая версия записи
	host: string // host:port
	ownerId: string
	meta?: Record<string, any> // любые дополнительные поля
}

export type DigestType = Record<string, number>

/** Оболочка Gossip-сообщения */
export interface GossipReqDigestType {
	isDigest: true
	/** карта serviceId -> версия */
	digest: DigestType
}

export interface GossipReqRecordsType {
	isDigest: false
	/** полный массив изменённых/новых записей */
	records: ServiceRecordType[]
}

export interface GossipReqFetchRecordsType {
	isDigest: false
	/** полный массив изменённых/новых записей */
	recordIds: ServiceIdType[]
}

/** Делаем поля опциональными */
export type MakeOptional<T, K extends keyof T> = Omit<T, K> &
	Partial<Pick<T, K>>
