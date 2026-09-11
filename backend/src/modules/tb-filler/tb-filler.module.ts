/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TbFillerService } from './tb-filler.service';
import { TbFillerController } from './tb-filler.controller';
import { DefectLink } from '../../entities/defect-link.entity';
import { Project } from '../../entities/project.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DefectLink, Project])],
  controllers: [TbFillerController],
  providers: [TbFillerService],
})
export class TbFillerModule {}
