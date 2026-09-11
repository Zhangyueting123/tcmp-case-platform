/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();
    const traceId = req.headers['x-trace-id'] || uuidv4();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'E9999';
    let message = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse() as any;
      if (typeof r === 'string') {
        message = r;
      } else {
        message = r.message || r.error || message;
        code = r.code || `E${status}`;
        if (Array.isArray(message)) message = message.join('; ');
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    this.logger.error(`[${req.method}] ${req.url} -> ${status} ${code}: ${message}`);

    res.status(status).json({ code, message, data: null, traceId });
  }
}
