import { ElMessage } from 'element-plus';
import type { AllowDropType, NodeDropType } from 'element-plus/es/components/tree/src/tree.type';
import { caseSetApi } from '@/api';

function moduleMeta(data: any) {
  const moduleId = data?.id ?? data?.moduleId;
  const level = data?.level;
  const caseSetId = data?.caseSetId;
  const parentModuleId = data?.parentId ?? data?.parentModuleId ?? null;
  return { moduleId, level, caseSetId, parentModuleId };
}

export function useModuleTreeDrag(reload: () => Promise<void>, fallbackCaseSetId?: () => number | undefined) {
  function allowDrag(node: any) {
    const d = node?.data;
    if (!d || d.isLeaf) return false;
    const { moduleId, level } = moduleMeta(d);
    return !!moduleId && level >= 2 && level <= 4;
  }

  function allowDrop(draggingNode: any, dropNode: any, type: AllowDropType) {
    const drag = moduleMeta(draggingNode?.data);
    const drop = moduleMeta(dropNode?.data);
    if (!drag.moduleId || !drop.moduleId) return false;
    const cs =
      drag.caseSetId ??
      drop.caseSetId ??
      fallbackCaseSetId?.();
    if (!cs || (drag.caseSetId && drop.caseSetId && drag.caseSetId !== drop.caseSetId)) return false;

    if (type === 'inner') {
      return drop.level + 1 === drag.level;
    }
    if (type === 'prev' || type === 'next') {
      return (
        drag.level === drop.level &&
        (drag.parentModuleId ?? null) === (drop.parentModuleId ?? null)
      );
    }
    return false;
  }

  async function onNodeDrop(draggingNode: any, dropNode: any, dropType: NodeDropType) {
    const drag = moduleMeta(draggingNode?.data);
    const drop = moduleMeta(dropNode?.data);
    const caseSetId = drag.caseSetId ?? drop.caseSetId ?? fallbackCaseSetId?.();
    if (!caseSetId || !drag.moduleId || !drop.moduleId) return;

    const position: 'before' | 'after' | 'inner' =
      dropType === 'inner' ? 'inner' : dropType === 'before' ? 'before' : 'after';

    try {
      await caseSetApi.repositionModule(caseSetId, drag.moduleId, drop.moduleId, position);
      ElMessage.success('模块位置已更新');
      await reload();
    } catch {
      // 请求失败时 axios 拦截器已提示；仍刷新树以与后端一致
      await reload();
    }
  }

  return { allowDrag, allowDrop, onNodeDrop };
}
