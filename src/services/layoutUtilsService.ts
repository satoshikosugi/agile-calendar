import { getMiro } from '../miro';

interface LayoutResult {
  success: boolean;
  message: string;
  objectsProcessed: number;
}

/**
 * Auto-align selected objects horizontally or vertically
 */
export async function autoAlignObjects(): Promise<LayoutResult> {
  try {
    const { instance: miro } = await getMiro();
    
    if (!miro || !miro.board) {
      return {
        success: false,
        message: 'Miro SDKが利用できません。',
        objectsProcessed: 0,
      };
    }
    
    // Get selected items
    const selection = await miro.board.getSelection();
    
    // Filter out connectors
    const itemsToAlign = selection.filter((item: any) => item.type !== 'connector');
    
    if (itemsToAlign.length < 2) {
      return {
        success: false,
        message: '2つ以上のオブジェクト（コネクタ以外）を選択してください。',
        objectsProcessed: 0,
      };
    }
    
    // Calculate bounding box
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    for (const item of itemsToAlign) {
      minX = Math.min(minX, item.x);
      maxX = Math.max(maxX, item.x);
      minY = Math.min(minY, item.y);
      maxY = Math.max(maxY, item.y);
    }
    
    const rangeX = maxX - minX;
    const rangeY = maxY - minY;
    
    // Determine alignment direction based on layout
    // If objects are more spread horizontally, align vertically (same Y)
    // If objects are more spread vertically, align horizontally (same X)
    const alignVertically = rangeX > rangeY;
    
    if (alignVertically) {
      // Align to vertical center
      const centerY = (minY + maxY) / 2;
      
      for (const item of itemsToAlign) {
        item.y = centerY;
        await item.sync();
      }
      
      return {
        success: true,
        message: `${itemsToAlign.length}個のオブジェクトを垂直方向に整列しました。`,
        objectsProcessed: itemsToAlign.length,
      };
    } else {
      // Align to horizontal center
      const centerX = (minX + maxX) / 2;
      
      for (const item of itemsToAlign) {
        item.x = centerX;
        await item.sync();
      }
      
      return {
        success: true,
        message: `${itemsToAlign.length}個のオブジェクトを水平方向に整列しました。`,
        objectsProcessed: itemsToAlign.length,
      };
    }
  } catch (error: any) {
    console.error('Error aligning objects:', error);
    return {
      success: false,
      message: `エラーが発生しました: ${error.message}`,
      objectsProcessed: 0,
    };
  }
}

/**
 * Distribute selected objects evenly with equal spacing
 */
export async function distributeObjectsEvenly(spacingFactor: number = 1.5): Promise<LayoutResult> {
  try {
    const { instance: miro } = await getMiro();
    
    if (!miro || !miro.board) {
      return {
        success: false,
        message: 'Miro SDKが利用できません。',
        objectsProcessed: 0,
      };
    }
    
    // Get selected items
    const selection = await miro.board.getSelection();
    
    // Filter out connectors
    const itemsToDistribute = selection.filter((item: any) => item.type !== 'connector');
    
    if (itemsToDistribute.length < 3) {
      return {
        success: false,
        message: '3つ以上のオブジェクト（コネクタ以外）を選択してください。',
        objectsProcessed: 0,
      };
    }
    
    // Calculate bounding box
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    for (const item of itemsToDistribute) {
      minX = Math.min(minX, item.x);
      maxX = Math.max(maxX, item.x);
      minY = Math.min(minY, item.y);
      maxY = Math.max(maxY, item.y);
    }
    
    const rangeX = maxX - minX;
    const rangeY = maxY - minY;
    
    // Determine distribution direction based on layout
    const distributeHorizontally = rangeX > rangeY;
    
    if (distributeHorizontally) {
      // Sort by X position
      const sortedItems = [...itemsToDistribute].sort((a, b) => a.x - b.x);
      
      // Calculate average width
      const avgWidth = sortedItems.reduce((sum, item) => sum + item.width, 0) / sortedItems.length;
      
      // Calculate spacing based on factor (center-to-center distance)
      // If factor is 1.0, they touch (distance = width)
      // If factor is 1.5, gap is 0.5 * width
      const distance = avgWidth * spacingFactor;
      
      // Start from the leftmost item's position (or center the whole group?)
      // Let's keep the leftmost item where it is
      const startX = sortedItems[0].x;
      
      // Distribute evenly
      for (let i = 0; i < sortedItems.length; i++) {
        sortedItems[i].x = startX + (i * distance);
        await sortedItems[i].sync();
      }
      
      return {
        success: true,
        message: `${itemsToDistribute.length}個のオブジェクトを水平方向に均等配置しました（間隔: ${spacingFactor}倍）。`,
        objectsProcessed: itemsToDistribute.length,
      };
    } else {
      // Sort by Y position
      const sortedItems = [...itemsToDistribute].sort((a, b) => a.y - b.y);
      
      // Calculate average height
      const avgHeight = sortedItems.reduce((sum, item) => sum + item.height, 0) / sortedItems.length;
      
      // Calculate spacing based on factor
      const distance = avgHeight * spacingFactor;
      
      // Start from the topmost item's position
      const startY = sortedItems[0].y;
      
      // Distribute evenly
      for (let i = 0; i < sortedItems.length; i++) {
        sortedItems[i].y = startY + (i * distance);
        await sortedItems[i].sync();
      }
      
      return {
        success: true,
        message: `${itemsToDistribute.length}個のオブジェクトを垂直方向に均等配置しました（間隔: ${spacingFactor}倍）。`,
        objectsProcessed: itemsToDistribute.length,
      };
    }
  } catch (error: any) {
    console.error('Error distributing objects:', error);
    return {
      success: false,
      message: `エラーが発生しました: ${error.message}`,
      objectsProcessed: 0,
    };
  }
}
