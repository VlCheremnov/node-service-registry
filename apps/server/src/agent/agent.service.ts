import { Injectable } from '@nestjs/common'

@Injectable()
export class AgentService {
	ping() {
		// console.log('ping!')
		// await this.tcp.broadcast({ type: 'test' })
		return 'ping!'
	}
}
