import { Test, TestingModule } from '@nestjs/testing';
import { GossipController } from './gossip.controller';
import { GossipService } from './gossip.service';

describe('GossipController', () => {
  let controller: GossipController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GossipController],
      providers: [GossipService],
    }).compile();

    controller = module.get<GossipController>(GossipController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
