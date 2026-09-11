/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn() id: number;
  @Index() @Column({ nullable: true }) userId: number;
  @Column({ length: 64 }) action: string;
  @Column({ length: 64, nullable: true }) targetType: string;
  @Column({ nullable: true }) targetId: number;
  @Column({ type: 'simple-json', nullable: true }) before: any;
  @Column({ type: 'simple-json', nullable: true }) after: any;
  @Column({ length: 64, nullable: true }) ip: string;
  @CreateDateColumn() createdAt: Date;
}
