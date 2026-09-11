/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('attachments')
export class Attachment {
  @PrimaryGeneratedColumn() id: number;
  @Column({ length: 200 }) originalName: string;
  @Column({ length: 500 }) path: string;
  @Column({ length: 64 }) mime: string;
  @Column('int') size: number;
  @Column() uploadedBy: number;
  @CreateDateColumn() createdAt: Date;
}
