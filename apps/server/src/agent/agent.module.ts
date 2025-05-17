import { Module } from '@nestjs/common'
import { AgentService } from './agent.service'
import { AgentController } from './agent.controller'
import { GossipService } from '../gossip/gossip.service'

@Module({
	controllers: [AgentController],
	providers: [AgentService, GossipService],
})
export class AgentModule {}
