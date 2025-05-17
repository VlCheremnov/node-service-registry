import { Module } from '@nestjs/common';
import { GossipService } from './gossip.service';
import { GossipController } from './gossip.controller';

@Module({
  controllers: [GossipController],
  providers: [GossipService],
})
export class GossipModule {}
