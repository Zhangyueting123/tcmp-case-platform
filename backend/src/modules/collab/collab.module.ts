/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CollabGateway } from './collab.gateway';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'tcmp-dev-secret-change-me',
    }),
  ],
  providers: [CollabGateway],
})
export class CollabModule {}
