/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  // 安全：生产环境必须显式配置 JWT_SECRET，禁止使用内置弱默认值
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    Logger.error('JWT_SECRET 未设置，生产环境拒绝启动（请配置强随机密钥）', 'Bootstrap');
    process.exit(1);
  }
  if (!process.env.JWT_SECRET) {
    Logger.warn('JWT_SECRET 未设置，正在使用开发默认密钥，请勿用于生产环境', 'Bootstrap');
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  app.enableCors({ origin: true, credentials: true });
  app.setGlobalPrefix('api/v1');
  // 放开请求体大小限制：支持一次提交上万条用例的批量接口（默认仅 100KB）
  app.useBodyParser('json', { limit: '50mb' });
  app.useBodyParser('urlencoded', { limit: '50mb', extended: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });

  // 启用优雅关闭钩子：保证退出时执行 onModuleDestroy（数据库快照备份、清理定时器等）
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('TCMP API')
    .setDescription('Test Case Management & Execution Platform - REST API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const doc = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, doc);

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  Logger.log(`TCMP backend listening on http://localhost:${port}`, 'Bootstrap');
  Logger.log(`Swagger docs: http://localhost:${port}/api/docs`, 'Bootstrap');
}

bootstrap();
