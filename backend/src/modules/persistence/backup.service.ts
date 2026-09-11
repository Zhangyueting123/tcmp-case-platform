/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { join } from 'path';
import * as fs from 'fs';

/**
 * 数据库备份与崩溃恢复服务。
 *
 * 背景：当前使用 sql.js（纯 JS 的 SQLite），autoSave 会在每次写入后把整个数据库
 * 序列化并覆盖写回 data/tcmp.db。该方案无原生依赖、可移植性强，但存在两点风险：
 *   1) 若进程在写文件过程中崩溃 / 断电，单一的 db 文件可能被写坏。
 *   2) 没有历史版本，一旦逻辑误删数据无法回溯。
 *
 * 本服务通过“滚动备份 + 启动自检/自动恢复”补齐这两点：
 *   - 启动时校验主库文件完整性（SQLite 头魔数），损坏则自动从最近的有效备份恢复。
 *   - 定时（每 30 分钟）及优雅退出时，原子地（temp→rename）生成带时间戳的备份。
 *   - 仅保留最近 N 份备份，避免占用过多磁盘。
 */
@Injectable()
export class BackupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('BackupService');

  /** SQLite 文件头魔数：'SQLite format 3\0' */
  private static readonly SQLITE_MAGIC = Buffer.from('SQLite format 3\0', 'latin1');

  /** 最多保留的滚动备份份数（10min × 72 ≈ 12 小时保留窗口） */
  private readonly maxBackups = 72;

  private readonly dbPath: string;
  private readonly backupDir: string;

  constructor() {
    this.dbPath = process.env.DB_PATH || join(process.cwd(), 'data', 'tcmp.db');
    this.backupDir = join(process.cwd(), 'data', 'backups');
  }

  onModuleInit(): void {
    try {
      fs.mkdirSync(this.backupDir, { recursive: true });
    } catch {
      /* ignore */
    }
    this.recoverIfCorrupted();
  }

  onModuleDestroy(): void {
    // 优雅退出前做一次备份（autoSave 已落盘，这里仅快照存档）
    this.backupOnce('shutdown');
  }

  /** 每 10 分钟自动备份一次 */
  @Cron(CronExpression.EVERY_10_MINUTES)
  scheduledBackup(): void {
    this.backupOnce('cron');
  }

  /** 校验文件是否为合法的 SQLite 数据库（头部魔数 + 非空） */
  private isValidSqlite(file: string): boolean {
    try {
      const stat = fs.statSync(file);
      if (!stat.isFile() || stat.size < 100) return false;
      const fd = fs.openSync(file, 'r');
      try {
        const head = Buffer.alloc(16);
        fs.readSync(fd, head, 0, 16, 0);
        return head.equals(BackupService.SQLITE_MAGIC);
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      return false;
    }
  }

  /** 启动自检：主库损坏时尝试从最近的有效备份恢复 */
  private recoverIfCorrupted(): void {
    if (!fs.existsSync(this.dbPath)) {
      // 全新部署，没有库文件，交给 TypeORM synchronize 创建
      return;
    }
    if (this.isValidSqlite(this.dbPath)) {
      return;
    }
    this.logger.error('检测到主数据库文件损坏，尝试从备份恢复…');
    const latest = this.listBackups().find((b) => this.isValidSqlite(b.path));
    if (!latest) {
      this.logger.error('未找到可用备份，无法自动恢复（请人工介入）');
      return;
    }
    try {
      // 先把损坏文件改名留存，便于事后排查
      const corruptName = `${this.dbPath}.corrupt.${Date.now()}`;
      fs.renameSync(this.dbPath, corruptName);
      fs.copyFileSync(latest.path, this.dbPath);
      this.logger.warn(
        `已从备份恢复数据库：${latest.path} → ${this.dbPath}（损坏文件留存于 ${corruptName}）`,
      );
    } catch (e) {
      this.logger.error(`从备份恢复失败：${(e as Error).message}`);
    }
  }

  /** 列出备份，按时间倒序（最新在前） */
  private listBackups(): { path: string; mtime: number }[] {
    try {
      return fs
        .readdirSync(this.backupDir)
        .filter((f) => f.startsWith('tcmp-') && f.endsWith('.db'))
        .map((f) => {
          const p = join(this.backupDir, f);
          return { path: p, mtime: fs.statSync(p).mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime);
    } catch {
      return [];
    }
  }

  /** 生成一次备份（原子写入 + 滚动清理） */
  private backupOnce(reason: string): void {
    try {
      if (!this.isValidSqlite(this.dbPath)) {
        // 主库当前不可用就不要覆盖式存档，避免把坏数据写进备份
        return;
      }
      const ts = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '_')
        .slice(0, 19);
      const target = join(this.backupDir, `tcmp-${ts}.db`);
      const tmp = `${target}.tmp`;
      fs.copyFileSync(this.dbPath, tmp);
      // 校验拷贝结果后再原子重命名
      if (this.isValidSqlite(tmp)) {
        fs.renameSync(tmp, target);
      } else {
        fs.rmSync(tmp, { force: true });
        this.logger.warn('备份拷贝校验失败，已丢弃本次备份');
        return;
      }
      this.pruneOldBackups();
      this.logger.log(`数据库已备份（${reason}）：${target}`);
    } catch (e) {
      this.logger.warn(`备份失败（${reason}）：${(e as Error).message}`);
    }
  }

  /** 仅保留最近 maxBackups 份备份 */
  private pruneOldBackups(): void {
    const all = this.listBackups();
    for (const old of all.slice(this.maxBackups)) {
      try {
        fs.rmSync(old.path, { force: true });
      } catch {
        /* ignore */
      }
    }
  }
}
