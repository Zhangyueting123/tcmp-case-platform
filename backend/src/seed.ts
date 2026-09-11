/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import {
  CaseSet,
  CaseSetCase,
  ModuleNode,
  Project,
  ProjectCaseRef,
  User,
  UserProjectRole,
  UserStatus,
} from './entities';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  const ds = app.get(DataSource);

  const userRepo = ds.getRepository(User);
  const csRepo = ds.getRepository(CaseSet);
  const modRepo = ds.getRepository(ModuleNode);
  const cRepo = ds.getRepository(CaseSetCase);
  const pRepo = ds.getRepository(Project);
  const refRepo = ds.getRepository(ProjectCaseRef);
  const uprRepo = ds.getRepository(UserProjectRole);

  // Admin
  let admin = await userRepo.findOne({ where: { email: 'admin@mech-mind.net' } });
  if (!admin) {
    admin = await userRepo.save(
      userRepo.create({
        email: 'admin@mech-mind.net',
        name: '系统管理员',
        passwordHash: await bcrypt.hash('Admin@123', 10),
        status: UserStatus.ACTIVE,
        systemRoles: 'SysAdmin',
      }),
    );
    console.log('[seed] admin created: admin@mech-mind.net / Admin@123');
  }
  // Tester
  let tester = await userRepo.findOne({ where: { email: 'tester@mech-mind.net' } });
  if (!tester) {
    tester = await userRepo.save(
      userRepo.create({
        email: 'tester@mech-mind.net',
        name: '测试员甲',
        passwordHash: await bcrypt.hash('Tester@123', 10),
        status: UserStatus.ACTIVE,
      }),
    );
    console.log('[seed] tester created: tester@mech-mind.net / Tester@123');
  }

  // CaseSet
  let cs = await csRepo.findOne({ where: { code: 'DEMO' } });
  if (!cs) {
    cs = await csRepo.save(
      csRepo.create({
        code: 'DEMO',
        name: '示例用例集',
        description: '系统初始化的示例数据',
        ownerUserId: admin.id,
      }),
    );
    // Create modules + cases
    const ensure = async (names: string[]) => {
      let parentId: number = null;
      let path = '';
      let node: ModuleNode = null;
      for (let i = 0; i < names.length; i++) {
        const lvl = i + 1;
        path += '/' + names[i];
        let n = await modRepo.findOne({
          where: { caseSetId: cs.id, parentId: parentId ?? null, name: names[i], level: lvl },
        });
        if (!n) {
          n = await modRepo.save(
            modRepo.create({
              caseSetId: cs.id,
              parentId: parentId ?? null,
              name: names[i],
              level: lvl,
              path,
              code: lvl === 1 ? 'DEMO' : null,
            }),
          );
        }
        parentId = n.id;
        node = n;
      }
      return node;
    };

    const demoCases = [
      {
        modulePath: ['登录模块', '账号密码登录', '正常场景', '正确密码登录'],
        title: '使用正确邮箱+密码登录成功',
        priority: 'P0',
        steps: '1. 打开登录页\n2. 输入有效邮箱\n3. 输入正确密码\n4. 点击登录',
        expectedResult: '1. 跳转到首页\n2. 用户头像显示',
        tags: ['smoke', 'login'],
      },
      {
        modulePath: ['登录模块', '账号密码登录', '异常场景', '密码错误'],
        title: '密码错误时提示错误',
        priority: 'P1',
        steps: '1. 输入邮箱\n2. 输入错误密码\n3. 提交',
        expectedResult: '提示"邮箱或密码错误"',
        tags: ['login'],
      },
      {
        modulePath: ['用例集模块', '用例导入', 'Excel 导入', '正常导入'],
        title: '导入 100 条合法用例',
        priority: 'P1',
        steps: '1. 上传符合模板的 Excel\n2. 等待导入',
        expectedResult: 'imported=100, errors=0',
        tags: ['import'],
      },
    ];

    let idx = 1;
    for (const dc of demoCases) {
      const leaf = await ensure(dc.modulePath);
      await cRepo.save(
        cRepo.create({
          caseSetId: cs.id,
          code: `DEMO_${String(idx++).padStart(4, '0')}`,
          title: dc.title,
          moduleId: leaf.id,
          priority: dc.priority as any,
          steps: dc.steps,
          expectedResult: dc.expectedResult,
          tags: dc.tags,
          createdBy: admin.id,
          updatedBy: admin.id,
        }),
      );
    }
    console.log('[seed] case-set DEMO created with', demoCases.length, 'cases');
  }

  // Project
  let p = await pRepo.findOne({ where: { projectKey: 'DEMO' } });
  if (!p) {
    p = await pRepo.save(
      pRepo.create({
        projectKey: 'DEMO',
        name: '示例项目',
        description: '系统初始化示例项目',
        tbBugSectionUrl:
          'https://www.teambition.com/project/60b75d1971a638c8771a9ab6/bug/section/635bbbc175417100120310a0',
        tbProjectId: '60b75d1971a638c8771a9ab6',
        tbBugSectionId: '635bbbc175417100120310a0',
        createdBy: admin.id,
      }),
    );
    await uprRepo.save([
      uprRepo.create({ userId: admin.id, projectId: p.id, roleCode: 'PM' }),
      uprRepo.create({ userId: tester.id, projectId: p.id, roleCode: 'Tester' }),
    ]);
    // Add all DEMO cases to project pool
    const cases = await cRepo.find({ where: { caseSetId: cs.id } });
    for (const c of cases) {
      await refRepo.save(
        refRepo.create({ projectId: p.id, caseId: c.id, pinnedVersion: c.currentVersion, addedBy: admin.id }),
      );
    }
    console.log('[seed] project DEMO created with', cases.length, 'cases in pool');
  }

  // 内置产品线项目（不允许删除）
  const builtinProjects: { key: string; name: string; description: string }[] = [
    { key: 'VISION', name: 'Vision', description: 'Mech-Vision 测试项目（内置）' },
    { key: 'MSR', name: 'MSR', description: 'Mech-MSR 测试项目（内置）' },
    { key: 'DLK', name: 'DLK', description: 'Mech-DLK 测试项目（内置）' },
    { key: 'VIZ', name: 'Viz', description: 'Mech-Viz 测试项目（内置）' },
    { key: 'CAM2D', name: '2D智能相机', description: '2D 智能相机测试项目（内置）' },
  ];
  for (const bp of builtinProjects) {
    let bpRow = await pRepo.findOne({ where: { projectKey: bp.key } });
    if (!bpRow) {
      // name 唯一约束：如果同名已存在（非内置），跳过创建
      const dupName = await pRepo.findOne({ where: { name: bp.name } });
      if (dupName) {
        // 已有同名，将其升级为内置（幂等修复历史数据）
        if (!dupName.isBuiltin) {
          dupName.isBuiltin = true;
          await pRepo.save(dupName);
          console.log(`[seed] existing project "${bp.name}" marked as builtin`);
        }
        continue;
      }
      bpRow = await pRepo.save(
        pRepo.create({
          projectKey: bp.key,
          name: bp.name,
          description: bp.description,
          isBuiltin: true,
          createdBy: admin.id,
        }),
      );
      await uprRepo.save(uprRepo.create({ userId: admin.id, projectId: bpRow.id, roleCode: 'PM' }));
      console.log(`[seed] builtin project created: ${bp.name} (${bp.key})`);
    } else if (!bpRow.isBuiltin) {
      bpRow.isBuiltin = true;
      await pRepo.save(bpRow);
      console.log(`[seed] project "${bp.name}" marked as builtin`);
    }
  }

  console.log('[seed] done.');
  await app.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
