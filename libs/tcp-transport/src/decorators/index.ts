import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { MessagePattern } from '@nestjs/microservices'
import { TcpTypesEnum } from '@lib/tcp-transport/enums'
import { EventEmitTcpDataType } from '@lib/tcp-transport/types'

/**
 * Проксирует Nest-декоратор MessagePattern
 * и одновременно ограничивает аргумент типом enum.
 */
export function TcpEvent(event: TcpTypesEnum): MethodDecorator {
	return MessagePattern(event)
}

export const Data = () => {
	createParamDecorator((_: unknown, ctx: ExecutionContext) => {
		const { data }: EventEmitTcpDataType<any> = ctx.switchToRpc().getData() // то, что транспорт передал
		return data
	})()
}

export const FromId = () => {
	createParamDecorator((_: unknown, ctx: ExecutionContext) => {
		const { fromId }: EventEmitTcpDataType<any> = ctx.switchToRpc().getData() // то, что транспорт передал
		return fromId
	})()
}

export const Type = () => {
	createParamDecorator((_: unknown, ctx: ExecutionContext) => {
		const { type }: EventEmitTcpDataType<any> = ctx.switchToRpc().getData() // то, что транспорт передал
		return type
	})()
}
