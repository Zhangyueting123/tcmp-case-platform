/**
 * 与用例集详情列表一致：后端 cases.list 为 ORDER BY code ASC（SQLite 字典序）
 */
export function compareCaseSetListOrder(codeA?: string, codeB?: string): number {
  const a = String(codeA ?? '');
  const b = String(codeB ?? '');
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function compareCaseRowsBySetListOrder(
  a: { code?: string },
  b: { code?: string },
): number {
  return compareCaseSetListOrder(a.code, b.code);
}

/**
 * 执行页左侧树：模块节点与用例集详情模块树一致（同级 orderNo）；
 * 同一模块下的用例行与用例集表格一致（code 升序）。
 */
export function sortExecTreeBranches(nodes: any[]) {
  nodes.sort((a, b) => {
    if (!!a.isLeaf !== !!b.isLeaf) return a.isLeaf ? 1 : -1;
    if (!a.isLeaf && !b.isLeaf) {
      const d = (a.orderNo ?? 0) - (b.orderNo ?? 0);
      if (d !== 0) return d;
      return (a.moduleId ?? 0) - (b.moduleId ?? 0);
    }
    return compareCaseSetListOrder(a.code, b.code);
  });
  for (const n of nodes) {
    if (n.children?.length) sortExecTreeBranches(n.children);
  }
}
