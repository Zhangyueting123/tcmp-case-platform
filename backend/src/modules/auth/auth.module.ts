/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../entities';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TbOauthService } from './tb-oauth.service';
import { TbOauthController } from './tb-oauth.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'tcmp-dev-secret-change-me',
      signOptions: { expiresIn: process.env.JWT_ACCESS_EXPIRES || '2h' },
    }),
  ],
  controllers: [AuthController, TbOauthController],
  providers: [AuthService, TbOauthService],
  exports: [AuthService],
})
export class AuthModule {}
