import { Controller, Post } from '@nestjs/common'
import { AppService } from './app.service'
import { TcpTypesEnum } from '@lib/tcp-transport/enums'
import { TcpTransport } from '@lib/tcp-transport'
import { Data, FromId, TcpEvent } from '@lib/tcp-transport/decorators'
import { TransportType } from './enums'

@Controller()
export class AppController {
	constructor(
		private readonly appService: AppService,
		private readonly tcp: TcpTransport
	) {}

	@TcpEvent(TcpTypesEnum.Ping)
	getHello() {
		return this.appService.ping()
	}

	@TcpEvent(TransportType.Default)
	TestTcpEvent(@Data() data: any, @FromId() fromId: string) {
		console.log('test true', data)
		console.log('fromId', fromId)

		return 'test'
	}

	@Post('/test')
	async test() {
		const test = await this.tcp.broadcast({
			type: TransportType.Default,
			data: { test: 'test command' },
		})
		console.log('test', test)
		return test
	}
}
