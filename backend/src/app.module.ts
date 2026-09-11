/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { join } from 'path';

import { entities } from './entities';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CaseSetsModule } from './modules/case-sets/case-sets.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { RoundsModule } from './modules/rounds/rounds.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { ExecutionsModule } from './modules/executions/executions.module';
import { DefectsModule } from './modules/defects/defects.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AdminModule } from './modules/admin/admin.module';
import { TbFillerModule } from './modules/tb-filler/tb-filler.module';
import { CollabModule } from './modules/collab/collab.module';
import { PersistenceModule } from './modules/persistence/persistence.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    ScheduleModule.forRoot(),
    // 持久化：使用 sql.js（纯 JS SQLite，无原生依赖，便于在受限环境部署）。
    // 数据安全性由 PersistenceModule 的滚动备份 + 启动自检/自动恢复补强。
    TypeOrmModule.forRoot({
      type: 'sqljs',
      autoSave: true,
      location: process.env.DB_PATH || join(process.cwd(), 'data', 'tcmp.db'),
      entities,
      synchronize: true,
      logging: false,
    }),
    PersistenceModule,
    IntegrationsModule,
    AuthModule,
    UsersModule,
    CaseSetsModule,
    ProjectsModule,
    RoundsModule,
    ReviewsModule,
    TasksModule,
    ExecutionsModule,
    DefectsModule,
    ReportsModule,
    AdminModule,
    TbFillerModule,
    CollabModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
