import { Injectable } from '@nestjs/common'

@Injectable()
export class AppService {
	constructor() {}

	ping() {
		// console.log('ping!')
		// await this.tcp.broadcast({ type: 'test' })
		return 'ping!'
	}
}
