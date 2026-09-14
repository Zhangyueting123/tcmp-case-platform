/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SysAdminOnly } from '../../common/decorators';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly svc: UsersService) {}

  @Get()
  list(@Query('q') q?: string) {
    return this.svc.list(q);
  }

  @SysAdminOnly()
  @Patch(':id/system-roles')
  setSystemRoles(@Param('id', ParseIntPipe) id: number, @Body() body: { roles: string[] }) {
    return this.svc.setSystemRoles(id, body.roles || []);
  }

  @SysAdminOnly()
  @Patch(':id/status')
  setStatus(@Param('id', ParseIntPipe) id: number, @Body() body: { status: string }) {
    return this.svc.setStatus(id, body.status);
  }
}
