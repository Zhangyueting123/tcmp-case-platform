/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User, UserProjectRole } from '../../entities';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(UserProjectRole) private readonly uprRepo: Repository<UserProjectRole>,
  ) {}

  async list(q?: string) {
    const qb = this.userRepo.createQueryBuilder('u').orderBy('u.id', 'ASC');
    if (q) {
      qb.where('u.email LIKE :q OR u.name LIKE :q', { q: `%${q}%` });
    }
    const items = await qb.getMany();
    return items.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      phone: u.phone,
      status: u.status,
      systemRoles: (u.systemRoles || '').split(',').filter(Boolean),
      createdAt: u.createdAt,
    }));
  }

  async findByIds(ids: number[]) {
    if (!ids.length) return [];
    return this.userRepo.findBy({ id: In(ids) });
  }

  async getProjectRoles(userId: number) {
    return this.uprRepo.find({ where: { userId } });
  }

  async setSystemRoles(userId: number, roles: string[]) {
    await this.userRepo.update(userId, { systemRoles: roles.join(',') });
  }

  async setStatus(userId: number, status: any) {
    await this.userRepo.update(userId, { status });
  }
}
