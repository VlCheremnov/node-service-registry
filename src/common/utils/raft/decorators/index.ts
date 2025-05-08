import 'reflect-metadata'
import { TcpTypesEnum } from '../enums'

// куда будем складывать сведения о декорированных методах
const RAFT_EVENTS_KEY = Symbol('raft:events')

/**
 * Метод-декоратор: @RaftEvent(TcpTypesEnum.AppendEntries)
 */
export function RaftEvent(type: TcpTypesEnum) {
	return function (
		target: any,
		propertyKey: string,
		_descriptor: PropertyDescriptor
	) {
		const events: { type: TcpTypesEnum; handler: string }[] =
			Reflect.getOwnMetadata(RAFT_EVENTS_KEY, target) ?? []

		events.push({ type, handler: propertyKey })
		Reflect.defineMetadata(RAFT_EVENTS_KEY, events, target)

		console.log('events', events)
	}
}

/**
 * Класс-декоратор, который «подключает» все методы,
 * помеченные @RaftEvent, к tcpAgent.
 *
 * @example
 *   @AutowireRaftEvents
 *   class RaftAgent { … }
 */
export function AutowireRaftEvents<T extends { new (...a: any[]): any }>(
	Base: T
) {
	return class extends Base {
		// переопределяем конструктор
		constructor(...args: any[]) {
			super(...args)

			const proto = Object.getPrototypeOf(this)
			const events: { type: TcpTypesEnum; handler: string }[] =
				Reflect.getOwnMetadata(RAFT_EVENTS_KEY, Base.prototype) ?? []

			console.log('*'.repeat(20))
			console.log('AutowireRaftEvents events', events)
			console.log('*'.repeat(20))

			for (const { type, handler } of events) {
				this.tcpAgent.on(type, (this as any)[handler].bind(this))
			}
		}
	}
}
