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
    
    if (selection.length < 2) {
      return {
        success: false,
        message: '2つ以上のオブジェクトを選択してください。',
        objectsProcessed: 0,
      };
    }
    
    // Calculate bounding box
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    for (const item of selection) {
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
      
      for (const item of selection) {
        item.y = centerY;
        await item.sync();
      }
      
      return {
        success: true,
        message: `${selection.length}個のオブジェクトを垂直方向に整列しました。`,
        objectsProcessed: selection.length,
      };
    } else {
      // Align to horizontal center
      const centerX = (minX + maxX) / 2;
      
      for (const item of selection) {
        item.x = centerX;
        await item.sync();
      }
      
      return {
        success: true,
        message: `${selection.length}個のオブジェクトを水平方向に整列しました。`,
        objectsProcessed: selection.length,
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
export async function distributeObjectsEvenly(): Promise<LayoutResult> {
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
    
    if (selection.length < 3) {
      return {
        success: false,
        message: '3つ以上のオブジェクトを選択してください。',
        objectsProcessed: 0,
      };
    }
    
    // Calculate bounding box
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    for (const item of selection) {
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
      const sortedItems = [...selection].sort((a, b) => a.x - b.x);
      
      // Calculate spacing
      const spacing = rangeX / (sortedItems.length - 1);
      
      // Distribute evenly
      for (let i = 0; i < sortedItems.length; i++) {
        sortedItems[i].x = minX + (i * spacing);
        await sortedItems[i].sync();
      }
      
      return {
        success: true,
        message: `${selection.length}個のオブジェクトを水平方向に均等配置しました。`,
        objectsProcessed: selection.length,
      };
    } else {
      // Sort by Y position
      const sortedItems = [...selection].sort((a, b) => a.y - b.y);
      
      // Calculate spacing
      const spacing = rangeY / (sortedItems.length - 1);
      
      // Distribute evenly
      for (let i = 0; i < sortedItems.length; i++) {
        sortedItems[i].y = minY + (i * spacing);
        await sortedItems[i].sync();
      }
      
      return {
        success: true,
        message: `${selection.length}個のオブジェクトを垂直方向に均等配置しました。`,
        objectsProcessed: selection.length,
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
