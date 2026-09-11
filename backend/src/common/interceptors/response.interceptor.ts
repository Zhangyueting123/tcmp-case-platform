/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, any> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const traceId = req.headers['x-trace-id'] || uuidv4();
    return next.handle().pipe(
      map((data) => {
        // skip wrapping for binary/stream responses
        if (data && (data as any).__raw) return (data as any).payload;
        return { code: 0, message: 'OK', data: data ?? null, traceId };
      }),
    );
  }
}
