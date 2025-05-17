import { PartialType } from '@nestjs/mapped-types';
import { CreateGossipDto } from './create-gossip.dto';

export class UpdateGossipDto extends PartialType(CreateGossipDto) {
  id: number;
}
