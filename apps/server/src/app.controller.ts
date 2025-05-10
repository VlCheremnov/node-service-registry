import { Controller, Post } from '@nestjs/common'
import { AppService } from './app.service'
import { MessagePattern } from '@nestjs/microservices'
import { TcpTypesEnum } from '@lib/tcp-transport/enums'
import { TcpTransport } from '@lib/tcp-transport'

@Controller()
export class AppController {
	constructor(
		private readonly appService: AppService,
		private readonly tcp: TcpTransport
	) {}

	@MessagePattern(TcpTypesEnum.Ping)
	getHello() {
		return this.appService.ping()
	}

	@MessagePattern(TcpTypesEnum.Default)
	TestTcpEvent() {
		console.log('test true')

		return 'test'
	}

	@Post('/test')
	async test() {
		const test = await this.tcp.broadcast({ type: TcpTypesEnum.Default })
		console.log('test', test)
		return test
	}
}
