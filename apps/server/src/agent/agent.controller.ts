import { Body, Controller, Logger, Post } from '@nestjs/common'
import { AgentService } from './agent.service'
import { TcpTypesEnum } from '@lib/tcp-transport/enums'
import { TcpTransport } from '@lib/tcp-transport'
import { Data, FromId, TcpEvent } from '@lib/tcp-transport/decorators'
import { TransportType } from '../enums'
import { GossipService } from '../gossip/gossip.service'
import { ServiceIdType, ServiceRecordType } from '../types'

@Controller()
export class AgentController {
	private readonly logger = new Logger(AgentController.name)

	constructor(
		private readonly agentService: AgentService,
		private readonly tcp: TcpTransport,
		private readonly gossip: GossipService
	) {}

	@TcpEvent(TcpTypesEnum.Ping)
	getHello() {
		return this.agentService.ping()
	}

	@TcpEvent(TransportType.GossipDigest)
	GossipDigest(@Data() data: any, @FromId() fromId: string) {
		this.logger.debug('GossipDigest', data)
		return this.gossip.processDigest(data, fromId)
	}
	@TcpEvent(TransportType.GossipRecord)
	GossipRecord(@Data() data: any, @FromId() fromId: string) {
		this.logger.debug('GossipRecord', data)
		data.records.forEach((service: ServiceRecordType) => {
			const prevService = this.gossip.getService(service.id)

			if (prevService) {
			}

			this.gossip.upsertLocalService(service)
		})
	}
	@TcpEvent(TransportType.GossipFetchServices)
	GossipFetchServices(@Data() data: any, @FromId() fromId: string) {
		this.logger.debug('GossipFetchServices', data)
		return data.recordIds.map((id: ServiceIdType) => this.gossip.getService(id))
	}

	@Post('/add-service')
	async addService(@Body() data: { id: string; name: string; host: string }) {
		this.gossip.upsertLocalService(data)
		return this.gossip.getAllServices()
	}

	@Post('/get-services')
	async getServices() {
		return this.gossip.getAllServices()
	}
}
