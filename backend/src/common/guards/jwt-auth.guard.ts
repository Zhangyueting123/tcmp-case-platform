/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private reflector: Reflector, private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const auth = req.headers['authorization'] as string;
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new UnauthorizedException({ code: 'E2001', message: '未登录或令牌无效' });
    }
    const token = auth.slice(7);
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET || 'tcmp-dev-secret-change-me',
      });
      req.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException({ code: 'E2002', message: '令牌已过期或无效' });
    }
  }
}
