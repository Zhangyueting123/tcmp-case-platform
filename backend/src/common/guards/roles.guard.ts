/**
 * @author zhangyueting
 * @date 2026-09-14
 */
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../decorators';
import { BizException } from '../exceptions/biz.exception';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const req = context.switchToHttp().getRequest();
    const userRoles: string[] = req.user?.systemRoles || [];
    const ok = required.some((r) => userRoles.includes(r));
    if (!ok) {
      throw new BizException('E3001', '无权限执行此操作', 403 as any);
    }
    return true;
  }
}
