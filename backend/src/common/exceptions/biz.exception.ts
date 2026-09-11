/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { HttpException, HttpStatus } from '@nestjs/common';

export class BizException extends HttpException {
  constructor(code: string, message: string, status: HttpStatus = HttpStatus.BAD_REQUEST) {
    super({ code, message }, status);
  }
}
