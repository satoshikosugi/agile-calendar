import { getAllItems, updateItemPosition, MiroItem } from './miroApiService';

interface LayoutResult {
  success: boolean;
  message: string;
  objectsProcessed: number;
}

// Auto-align items: aligns all non-connector items in the board (or filtered by type)
export async function autoAlignObjects(
  boardId: string,
  token: string
): Promise<LayoutResult> {
  try {
    const allItems = await getAllItems(boardId, token);
    const itemsToAlign = allItems.filter(
      (item: MiroItem) => item.type !== 'connector' && item.type !== 'frame' && item.geometry
    );

    if (itemsToAlign.length < 2) {
      return { success: false, message: '整列するオブジェクトが2つ以上必要です。', objectsProcessed: 0 };
    }

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const item of itemsToAlign) {
      minX = Math.min(minX, item.position.x);
      maxX = Math.max(maxX, item.position.x);
      minY = Math.min(minY, item.position.y);
      maxY = Math.max(maxY, item.position.y);
    }

    const rangeX = maxX - minX;
    const rangeY = maxY - minY;
    const alignVertically = rangeX > rangeY;

    if (alignVertically) {
      const centerY = (minY + maxY) / 2;
      for (const item of itemsToAlign) {
        if (item.position.y !== centerY) {
          await updateItemPosition(boardId, token, item.id, item.type, item.position.x, centerY);
        }
      }
      return { success: true, message: `${itemsToAlign.length}個のオブジェクトを垂直方向に整列しました。`, objectsProcessed: itemsToAlign.length };
    } else {
      const centerX = (minX + maxX) / 2;
      for (const item of itemsToAlign) {
        if (item.position.x !== centerX) {
          await updateItemPosition(boardId, token, item.id, item.type, centerX, item.position.y);
        }
      }
      return { success: true, message: `${itemsToAlign.length}個のオブジェクトを水平方向に整列しました。`, objectsProcessed: itemsToAlign.length };
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, message: `エラーが発生しました: ${msg}`, objectsProcessed: 0 };
  }
}

// Distribute items evenly with equal spacing
export async function distributeObjectsEvenly(
  boardId: string,
  token: string,
  spacingFactor: number = 1.5
): Promise<LayoutResult> {
  try {
    const allItems = await getAllItems(boardId, token);
    const itemsToDistribute = allItems.filter(
      (item: MiroItem) => item.type !== 'connector' && item.type !== 'frame' && item.geometry
    );

    if (itemsToDistribute.length < 3) {
      return { success: false, message: '均等配置するオブジェクトが3つ以上必要です。', objectsProcessed: 0 };
    }

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const item of itemsToDistribute) {
      minX = Math.min(minX, item.position.x);
      maxX = Math.max(maxX, item.position.x);
      minY = Math.min(minY, item.position.y);
      maxY = Math.max(maxY, item.position.y);
    }

    const rangeX = maxX - minX;
    const rangeY = maxY - minY;
    const distributeHorizontally = rangeX > rangeY;

    if (distributeHorizontally) {
      const sorted = [...itemsToDistribute].sort((a, b) => a.position.x - b.position.x);
      const avgWidth = sorted.reduce((sum, item) => sum + (item.geometry?.width || 100), 0) / sorted.length;
      const distance = avgWidth * spacingFactor;
      const startX = sorted[0].position.x;

      for (let i = 0; i < sorted.length; i++) {
        const newX = startX + i * distance;
        if (Math.abs(sorted[i].position.x - newX) > 1) {
          await updateItemPosition(boardId, token, sorted[i].id, sorted[i].type, newX, sorted[i].position.y);
        }
      }
      return { success: true, message: `${itemsToDistribute.length}個のオブジェクトを水平方向に均等配置しました（間隔: ${spacingFactor}倍）。`, objectsProcessed: itemsToDistribute.length };
    } else {
      const sorted = [...itemsToDistribute].sort((a, b) => a.position.y - b.position.y);
      const avgHeight = sorted.reduce((sum, item) => sum + (item.geometry?.height || 100), 0) / sorted.length;
      const distance = avgHeight * spacingFactor;
      const startY = sorted[0].position.y;

      for (let i = 0; i < sorted.length; i++) {
        const newY = startY + i * distance;
        if (Math.abs(sorted[i].position.y - newY) > 1) {
          await updateItemPosition(boardId, token, sorted[i].id, sorted[i].type, sorted[i].position.x, newY);
        }
      }
      return { success: true, message: `${itemsToDistribute.length}個のオブジェクトを垂直方向に均等配置しました（間隔: ${spacingFactor}倍）。`, objectsProcessed: itemsToDistribute.length };
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, message: `エラーが発生しました: ${msg}`, objectsProcessed: 0 };
  }
}
