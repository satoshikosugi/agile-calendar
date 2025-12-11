import { getMiro } from '../miro';

interface OptimizationResult {
  success: boolean;
  message: string;
  objectsProcessed: number;
  connectorsOptimized: number;
}

/**
 * Traverse all connectors from selected objects and get all connected objects
 */
async function traverseConnectedObjects(itemId: string, visited: Set<string>, miro: any): Promise<Set<string>> {
  if (visited.has(itemId)) {
    return visited;
  }
  
  visited.add(itemId);
  
  try {
    // Get the item by ID
    const items = await miro.board.get({ id: itemId });
    if (items.length === 0) {
      return visited;
    }
    
    const item = items[0];
    
    // Check if item has getConnectors method
    if (typeof item.getConnectors === 'function') {
      const connectors = await item.getConnectors();
      
      // For each connector, find the connected item and traverse it
      for (const connector of connectors) {
        // Get the other end of the connector
        const connectorStartId = connector.start?.item;
        const connectorEndId = connector.end?.item;
        
        // Traverse both ends
        if (connectorStartId && !visited.has(connectorStartId)) {
          await traverseConnectedObjects(connectorStartId, visited, miro);
        }
        if (connectorEndId && !visited.has(connectorEndId)) {
          await traverseConnectedObjects(connectorEndId, visited, miro);
        }
      }
    }
  } catch (error) {
    console.warn(`Could not traverse item ${itemId}:`, error);
  }
  
  return visited;
}

/**
 * Calculate optimal snap positions to avoid overlapping connectors
 */
function calculateOptimalSnapPosition(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  existingConnections: Array<{ angle: number; snapTo: string }>
): 'top' | 'right' | 'bottom' | 'left' {
  // Calculate angle from source to target
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  
  // Determine which side of the object the connector should snap to
  // based on the angle and existing connections
  let snapTo: 'top' | 'right' | 'bottom' | 'left';
  
  // Default snap based on angle
  if (angle >= -45 && angle < 45) {
    snapTo = 'right';
  } else if (angle >= 45 && angle < 135) {
    snapTo = 'bottom';
  } else if (angle >= 135 || angle < -135) {
    snapTo = 'left';
  } else {
    snapTo = 'top';
  }
  
  // Check if this snap position is already heavily used
  const snapCounts = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const conn of existingConnections) {
    snapCounts[conn.snapTo as keyof typeof snapCounts]++;
  }
  
  // If the preferred snap position has too many connections, try alternatives
  if (snapCounts[snapTo] >= 3) {
    // Find the least used snap position
    const sortedSnaps = Object.entries(snapCounts).sort((a, b) => a[1] - b[1]);
    snapTo = sortedSnaps[0][0] as 'top' | 'right' | 'bottom' | 'left';
  }
  
  return snapTo;
}

/**
 * Optimize connectors for the selected objects
 */
export async function optimizeConnectors(): Promise<OptimizationResult> {
  try {
    const { instance: miro } = await getMiro();
    
    if (!miro || !miro.board) {
      return {
        success: false,
        message: 'Miro SDKが利用できません。',
        objectsProcessed: 0,
        connectorsOptimized: 0,
      };
    }
    
    // Get selected items
    const selection = await miro.board.getSelection();
    
    if (selection.length === 0) {
      return {
        success: false,
        message: 'オブジェクトを選択してください。',
        objectsProcessed: 0,
        connectorsOptimized: 0,
      };
    }
    
    console.log(`Starting connector optimization for ${selection.length} selected objects...`);
    
    // Traverse all connected objects
    const allConnectedObjects = new Set<string>();
    for (const item of selection) {
      await traverseConnectedObjects(item.id, allConnectedObjects, miro);
    }
    
    console.log(`Found ${allConnectedObjects.size} connected objects`);
    
    // Get all items and their positions
    const allItems = await Promise.all(
      Array.from(allConnectedObjects).map(async (id) => {
        const items = await miro.board.get({ id });
        return items[0];
      })
    );
    
    // Filter out null items
    const validItems = allItems.filter(item => item != null);
    
    // Create a map of item positions
    const itemPositions = new Map<string, { x: number; y: number }>();
    for (const item of validItems) {
      itemPositions.set(item.id, { x: item.x, y: item.y });
    }
    
    // Get all connectors for the connected objects
    let totalConnectors = 0;
    let optimizedConnectors = 0;
    
    // Track existing connections per item to avoid overlapping
    const itemConnections = new Map<string, Array<{ angle: number; snapTo: string }>>();
    
    for (const item of validItems) {
      if (typeof item.getConnectors !== 'function') {
        continue;
      }
      
      try {
        const connectors = await item.getConnectors();
        totalConnectors += connectors.length;
        
        for (const connector of connectors) {
          // Only optimize connectors where both ends are in our set
          const connectorStartId = connector.start?.item;
          const connectorEndId = connector.end?.item;
          
          if (!connectorStartId || !connectorEndId) {
            continue;
          }
          
          if (!allConnectedObjects.has(connectorStartId) || !allConnectedObjects.has(connectorEndId)) {
            continue;
          }
          
          // Get positions
          const startPos = itemPositions.get(connectorStartId);
          const endPos = itemPositions.get(connectorEndId);
          
          if (!startPos || !endPos) {
            continue;
          }
          
          // Calculate optimal snap positions
          const startConnections = itemConnections.get(connectorStartId) || [];
          const endConnections = itemConnections.get(connectorEndId) || [];
          
          const startSnapTo = calculateOptimalSnapPosition(
            startPos.x,
            startPos.y,
            endPos.x,
            endPos.y,
            startConnections
          );
          
          const endSnapTo = calculateOptimalSnapPosition(
            endPos.x,
            endPos.y,
            startPos.x,
            startPos.y,
            endConnections
          );
          
          // Calculate angle for tracking
          const dx = endPos.x - startPos.x;
          const dy = endPos.y - startPos.y;
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);
          
          // Update tracking
          startConnections.push({ angle, snapTo: startSnapTo });
          endConnections.push({ angle: angle + 180, snapTo: endSnapTo });
          itemConnections.set(connectorStartId, startConnections);
          itemConnections.set(connectorEndId, endConnections);
          
          // Update connector if needed
          let needsUpdate = false;
          
          if (connector.start && connector.start.snapTo !== startSnapTo) {
            connector.start.snapTo = startSnapTo;
            needsUpdate = true;
          }
          
          if (connector.end && connector.end.snapTo !== endSnapTo) {
            connector.end.snapTo = endSnapTo;
            needsUpdate = true;
          }
          
          // Prefer elbowed connectors for cleaner diagrams
          if (connector.shape !== 'elbowed') {
            connector.shape = 'elbowed';
            needsUpdate = true;
          }
          
          if (needsUpdate) {
            await connector.sync();
            optimizedConnectors++;
          }
        }
      } catch (error) {
        console.warn(`Could not optimize connectors for item ${item.id}:`, error);
      }
    }
    
    console.log(`Optimized ${optimizedConnectors} out of ${totalConnectors} connectors`);
    
    return {
      success: true,
      message: `${allConnectedObjects.size}個のオブジェクトを処理し、${optimizedConnectors}個のコネクタを最適化しました。`,
      objectsProcessed: allConnectedObjects.size,
      connectorsOptimized: optimizedConnectors,
    };
  } catch (error: any) {
    console.error('Error optimizing connectors:', error);
    return {
      success: false,
      message: `エラーが発生しました: ${error.message}`,
      objectsProcessed: 0,
      connectorsOptimized: 0,
    };
  }
}
