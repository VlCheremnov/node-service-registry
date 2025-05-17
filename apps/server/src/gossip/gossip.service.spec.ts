import { Test, TestingModule } from '@nestjs/testing';
import { GossipService } from './gossip.service';

describe('GossipService', () => {
  let service: GossipService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GossipService],
    }).compile();

    service = module.get<GossipService>(GossipService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
