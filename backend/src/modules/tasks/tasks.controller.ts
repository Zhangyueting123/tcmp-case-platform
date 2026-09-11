/**
 * @author zhangyueting
 * @date 2026-07-29
 */
import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { CurrentUser } from '../../common/decorators';

@ApiTags('tasks')
@Controller()
export class TasksController {
  constructor(private readonly svc: TasksService) {}

  @Get('me/tasks')
  myTasks(@CurrentUser() u: any) {
    return this.svc.getMyTasks(u.sub);
  }
}
