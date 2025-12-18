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
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  
  let snapTo: 'top' | 'right' | 'bottom' | 'left';
  
  // Strict geometric snapping based on relative position
  if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal relationship
      snapTo = dx > 0 ? 'right' : 'left';
  } else {
      // Vertical relationship
      snapTo = dy > 0 ? 'bottom' : 'top';
  }
  
  // Check usage count to distribute load if overloaded
  const snapCounts = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const conn of existingConnections) {
    snapCounts[conn.snapTo as keyof typeof snapCounts]++;
  }
  
  // Stricter threshold: Try to keep it to 1 per side if possible
  if (snapCounts[snapTo] >= 1) {
      // Try the "next best" side (orthogonal)
      // e.g. if Right is full, try Top or Bottom. Avoid Left (opposite).
      const alternatives = Math.abs(dx) > Math.abs(dy) 
          ? ['top', 'bottom'] 
          : ['left', 'right'];
          
      // Pick the one with fewer connections
      const alt1 = alternatives[0] as 'top'|'right'|'bottom'|'left';
      const alt2 = alternatives[1] as 'top'|'right'|'bottom'|'left';
      
      // Only switch if the alternative is actually better (less crowded)
      if (snapCounts[alt1] < snapCounts[snapTo] || snapCounts[alt2] < snapCounts[snapTo]) {
          if (snapCounts[alt1] <= snapCounts[alt2]) {
              snapTo = alt1;
          } else {
              snapTo = alt2;
          }
      }
  }
  
  return snapTo;
}

interface Node {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Edge {
  source: string;
  target: string;
}

interface OptimizationOptions {
  allowMovement: boolean;
  spacingFactor: number;
  priority: number; // 0-100
}

/**
 * Apply Grid-based Discrete Optimization with Simulated Annealing and Iterative Repair
 */
function applyGridOptimizationLayout(
  nodes: Node[], 
  edges: Edge[], 
  options: OptimizationOptions
): Map<string, { x: number; y: number }> {
  // 1. Determine Grid Size
  let avgWidth = 100;
  let avgHeight = 100;
  if (nodes.length > 0) {
    avgWidth = nodes.reduce((sum, n) => sum + n.width, 0) / nodes.length;
    avgHeight = nodes.reduce((sum, n) => sum + n.height, 0) / nodes.length;
  }
  
  const GRID_X = avgWidth * options.spacingFactor;
  const GRID_Y = avgHeight * options.spacingFactor;
  
  // Initial Grid Mapping
  const gridNodes = nodes.map(n => ({
      id: n.id,
      gx: Math.round(n.x / GRID_X),
      gy: Math.round(n.y / GRID_Y),
      origX: n.x,
      origY: n.y
  }));
  
  // Map for fast lookup
  const gridMap = new Map<string, any>();
  
  // Resolve initial collisions (Spiral Search)
  gridNodes.forEach(n => {
      // Check if current spot is taken
      if (!gridMap.has(`${n.gx},${n.gy}`)) {
          gridMap.set(`${n.gx},${n.gy}`, n);
          return;
      }

      // Find nearest empty spot
      let r = 1;
      let placed = false;
      while (!placed) {
          for (let x = -r; x <= r; x++) {
              for (let y = -r; y <= r; y++) {
                  if (Math.abs(x) !== r && Math.abs(y) !== r) continue; // Only check perimeter
                  
                  const candidateGx = n.gx + x;
                  const candidateGy = n.gy + y;
                  const key = `${candidateGx},${candidateGy}`;
                  
                  if (!gridMap.has(key)) {
                      n.gx = candidateGx;
                      n.gy = candidateGy;
                      gridMap.set(key, n);
                      placed = true;
                      break;
                  }
              }
              if (placed) break;
          }
          r++;
          if (r > 20) { // Safety break
              // Force placement (will be penalized later)
              gridMap.set(`${n.gx},${n.gy}`, n); 
              placed = true;
          }
      }
  });

  const nodeMap = new Map(gridNodes.map(n => [n.id, n]));

  // Helper: Get neighbors in graph
  const getGraphNeighbors = (nodeId: string) => {
      const neighbors: {gx: number, gy: number, id: string}[] = [];
      edges.forEach(e => {
         if (e.source === nodeId) neighbors.push(nodeMap.get(e.target)!);
         if (e.target === nodeId) neighbors.push(nodeMap.get(e.source)!);
      });
      return neighbors;
  };

  // 2. Cost Functions
  
  // Penalty Cost: Hard constraints (Overlaps, Congestion)
  const calculatePenalty = () => {
      let penalty = 0;
      
      // Node Overlap (Absolute Prohibition)
      // Check if multiple nodes share the same grid cell
      const posCounts = new Map<string, number>();
      gridNodes.forEach(n => {
          const key = `${n.gx},${n.gy}`;
          posCounts.set(key, (posCounts.get(key) || 0) + 1);
      });
      
      posCounts.forEach(count => {
          if (count > 1) penalty += (count - 1) * 100000; // Extreme penalty
      });
      
      // Node Intersection (Overlap)
      // Check if edges pass through nodes
      edges.forEach(e => {
          const s = nodeMap.get(e.source);
          const t = nodeMap.get(e.target);
          if (!s || !t) return;
          
          const minGx = Math.min(s.gx, t.gx);
          const maxGx = Math.max(s.gx, t.gx);
          const minGy = Math.min(s.gy, t.gy);
          const maxGy = Math.max(s.gy, t.gy);
          
          gridNodes.forEach(n => {
              if (n.id === s.id || n.id === t.id) return;
              // Simple bounding box check for edge passing through node
              // If node is strictly between source and target
              if (n.gx > minGx && n.gx < maxGx && n.gy === s.gy && s.gy === t.gy) penalty += 1000; // Horizontal pass-through
              if (n.gy > minGy && n.gy < maxGy && n.gx === s.gx && s.gx === t.gx) penalty += 1000; // Vertical pass-through
          });
      });

      // Port Congestion
      gridNodes.forEach(node => {
          const neighbors = getGraphNeighbors(node.id);
          const ports = { top: 0, bottom: 0, left: 0, right: 0 };
          
          neighbors.forEach(nb => {
              if (!nb) return;
              const dx = nb.gx - node.gx;
              const dy = nb.gy - node.gy;
              
              if (Math.abs(dx) > Math.abs(dy)) {
                  if (dx > 0) ports.right++; else ports.left++;
              } else {
                  if (dy > 0) ports.bottom++; else ports.top++;
              }
          });

          Object.values(ports).forEach(count => {
              if (count > 1) penalty += (count - 1) * 500;
          });
      });
      
      return penalty;
  };

  // Total Cost: Penalty + Distance
  const calculateTotalCost = () => {
      let cost = calculatePenalty();
      
      // Distance Cost (Manhattan)
      edges.forEach(e => {
          const s = nodeMap.get(e.source);
          const t = nodeMap.get(e.target);
          if (s && t) {
              cost += (Math.abs(s.gx - t.gx) + Math.abs(s.gy - t.gy)) * 10;
          }
      });
      
      return cost;
  };

  // 3. Phase 1: Simulated Annealing (Global Optimization)
  let currentCost = calculateTotalCost();
  let temperature = 100;
  const coolingRate = 0.95;
  const saIterations = 2000; 
  
  for (let i = 0; i < saIterations; i++) {
      const mutationType = Math.random();
      
      if (mutationType < 0.5) {
          // Swap
          const idx1 = Math.floor(Math.random() * gridNodes.length);
          const idx2 = Math.floor(Math.random() * gridNodes.length);
          if (idx1 === idx2) continue;
          
          const n1 = gridNodes[idx1];
          const n2 = gridNodes[idx2];
          
          gridMap.delete(`${n1.gx},${n1.gy}`);
          gridMap.delete(`${n2.gx},${n2.gy}`);
          
          const tempGx = n1.gx; const tempGy = n1.gy;
          n1.gx = n2.gx; n1.gy = n2.gy;
          n2.gx = tempGx; n2.gy = tempGy;
          
          gridMap.set(`${n1.gx},${n1.gy}`, n1);
          gridMap.set(`${n2.gx},${n2.gy}`, n2);
          
          const newCost = calculateTotalCost();
          const delta = newCost - currentCost;
          
          if (delta < 0 || Math.random() < Math.exp(-delta / temperature)) {
              currentCost = newCost;
          } else {
              // Revert
              gridMap.delete(`${n1.gx},${n1.gy}`);
              gridMap.delete(`${n2.gx},${n2.gy}`);
              n2.gx = n1.gx; n2.gy = n1.gy;
              n1.gx = tempGx; n1.gy = tempGy;
              gridMap.set(`${n1.gx},${n1.gy}`, n1);
              gridMap.set(`${n2.gx},${n2.gy}`, n2);
          }
      } else {
          // Move to empty
          const idx = Math.floor(Math.random() * gridNodes.length);
          const node = gridNodes[idx];
          const dx = Math.floor(Math.random() * 3) - 1;
          const dy = Math.floor(Math.random() * 3) - 1;
          if (dx === 0 && dy === 0) continue;
          
          const newGx = node.gx + dx;
          const newGy = node.gy + dy;
          
          if (!gridMap.has(`${newGx},${newGy}`)) {
              const oldGx = node.gx; const oldGy = node.gy;
              gridMap.delete(`${oldGx},${oldGy}`);
              node.gx = newGx; node.gy = newGy;
              gridMap.set(`${newGx},${newGy}`, node);
              
              const newCost = calculateTotalCost();
              const delta = newCost - currentCost;
              
              if (delta < 0 || Math.random() < Math.exp(-delta / temperature)) {
                  currentCost = newCost;
              } else {
                  gridMap.delete(`${newGx},${newGy}`);
                  node.gx = oldGx; node.gy = oldGy;
                  gridMap.set(`${oldGx},${oldGy}`, node);
              }
          }
      }
      temperature *= coolingRate;
  }

  // 4. Phase 2: Iterative Repair (Constraint Solving)
  // "Evaluate, Improve, Repeat until negative points are gone"
  let penalty = calculatePenalty();
  let repairIterations = 0;
  const maxRepairIterations = 500; // Prevent infinite loops
  
  while (penalty > 0 && repairIterations < maxRepairIterations) {
      repairIterations++;
      let improved = false;
      
      // Identify problematic nodes (those contributing to penalty)
      // We iterate all nodes and try to move them to reduce penalty
      // Sort nodes by "congestion score" could be better, but random order is fine for now
      
      // Shuffle gridNodes to avoid bias
      const shuffledNodes = [...gridNodes].sort(() => Math.random() - 0.5);
      
      for (const node of shuffledNodes) {
          const currentPenalty = calculatePenalty(); // Global penalty
          
          // Try moving to all 4 adjacent empty spots
          const moves = [
              { dx: 0, dy: -1 }, // Top
              { dx: 0, dy: 1 },  // Bottom
              { dx: -1, dy: 0 }, // Left
              { dx: 1, dy: 0 }   // Right
          ];
          
          let bestMove = null;
          let bestPenalty = currentPenalty;
          
          for (const move of moves) {
              const newGx = node.gx + move.dx;
              const newGy = node.gy + move.dy;
              
              if (!gridMap.has(`${newGx},${newGy}`)) {
                  // Try move
                  const oldGx = node.gx; const oldGy = node.gy;
                  gridMap.delete(`${oldGx},${oldGy}`);
                  node.gx = newGx; node.gy = newGy;
                  gridMap.set(`${newGx},${newGy}`, node);
                  
                  const newPenalty = calculatePenalty();
                  
                  if (newPenalty < bestPenalty) {
                      bestPenalty = newPenalty;
                      bestMove = { gx: newGx, gy: newGy };
                  }
                  
                  // Revert for now
                  gridMap.delete(`${newGx},${newGy}`);
                  node.gx = oldGx; node.gy = oldGy;
                  gridMap.set(`${oldGx},${oldGy}`, node);
              }
          }
          
          if (bestMove) {
              // Apply best move
              gridMap.delete(`${node.gx},${node.gy}`);
              node.gx = bestMove.gx;
              node.gy = bestMove.gy;
              gridMap.set(`${node.gx},${node.gy}`, node);
              improved = true;
              // Break inner loop to re-evaluate global state? 
              // Or continue? Continuing is faster.
          }
      }
      
      penalty = calculatePenalty();
      if (!improved) break; // Local minimum reached
  }

  // 5. Compaction (Remove empty rows/cols)
  const uniqueX = Array.from(new Set(gridNodes.map(n => n.gx))).sort((a, b) => a - b);
  const mapX = new Map<number, number>();
  uniqueX.forEach((val, index) => mapX.set(val, index));
  
  const uniqueY = Array.from(new Set(gridNodes.map(n => n.gy))).sort((a, b) => a - b);
  const mapY = new Map<number, number>();
  uniqueY.forEach((val, index) => mapY.set(val, index));
  
  gridNodes.forEach(n => {
      n.gx = mapX.get(n.gx)!;
      n.gy = mapY.get(n.gy)!;
  });

  // 6. Convert back to coordinates
  const result = new Map<string, { x: number; y: number }>();
  
  // Calculate center of mass of the new grid layout
  let gridCenterX = 0;
  let gridCenterY = 0;
  if (gridNodes.length > 0) {
      gridNodes.forEach(n => { gridCenterX += n.gx; gridCenterY += n.gy; });
      gridCenterX /= gridNodes.length;
      gridCenterY /= gridNodes.length;
  }
  
  // Calculate center of mass of original layout
  let origCenterX = 0;
  let origCenterY = 0;
  if (nodes.length > 0) {
      nodes.forEach(n => { origCenterX += n.x; origCenterY += n.y; });
      origCenterX /= nodes.length;
      origCenterY /= nodes.length;
  }
  
  gridNodes.forEach(node => {
      const relX = node.gx - gridCenterX;
      const relY = node.gy - gridCenterY;
      
      result.set(node.id, {
          x: origCenterX + (relX * GRID_X),
          y: origCenterY + (relY * GRID_Y)
      });
  });

  return result;
}

/**
 * Optimize connectors for the selected objects
 */
export async function optimizeConnectors(options: OptimizationOptions = { allowMovement: true, spacingFactor: 1.5, priority: 50 }): Promise<OptimizationResult> {
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
    
    // Filter out null items and connectors (we only want to move nodes)
    const validItems = allItems.filter(item => item != null && item.type !== 'connector');

    // Collect all connectors (again if movement was skipped, or reuse if possible)
    // Since uniqueConnectors was scoped inside the if block, we need to recreate it or move it out.
    // Let's just recreate it to be safe and simple, as getting connectors is cheap if we already have items.
    // Actually, we can just move the collection logic outside the if block.
    
    const allConnectors: any[] = [];
    for (const item of validItems) {
      if (typeof item.getConnectors === 'function') {
        const connectors = await item.getConnectors();
        allConnectors.push(...connectors);
      }
    }
    const uniqueConnectors = new Map();
    allConnectors.forEach(c => uniqueConnectors.set(c.id, c));

    // --- Force Directed Layout Start ---
    
    if (options.allowMovement) {
        // Build graph for layout
        const nodes: Node[] = validItems.map(item => ({
          id: item.id,
          x: item.x,
          y: item.y,
          width: item.width || 100,
          height: item.height || 100
        }));
        
        const edges: Edge[] = [];
        
        for (const connector of uniqueConnectors.values()) {
          if (connector.start?.item && connector.end?.item) {
            if (allConnectedObjects.has(connector.start.item) && allConnectedObjects.has(connector.end.item)) {
              edges.push({ source: connector.start.item, target: connector.end.item });
            }
          }
        }
    
        // Run layout
        const newPositions = applyGridOptimizationLayout(nodes, edges, options);
        
        // Update Miro items with new positions
        for (const item of validItems) {
          const newPos = newPositions.get(item.id);
          if (newPos) {
            item.x = newPos.x;
            item.y = newPos.y;
            try {
              await item.sync();
            } catch (e) {
              console.warn(`Failed to sync item ${item.id}`, e);
            }
          }
        }
    }

    // --- Force Directed Layout End ---
    
    // Create a map of item positions (updated)
    const itemPositions = new Map<string, { x: number; y: number }>();
    for (const item of validItems) {
      itemPositions.set(item.id, { x: item.x, y: item.y });
    }
    
    // Get all connectors for the connected objects
    let totalConnectors = 0;
    let optimizedConnectors = 0;
    
    // Track existing connections per item to avoid overlapping
    const itemConnections = new Map<string, Array<{ angle: number; snapTo: string }>>();
    
    // Use the unique connectors we already collected
    totalConnectors = uniqueConnectors.size;

    for (const connector of uniqueConnectors.values()) {
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
    
    console.log(`Optimized ${optimizedConnectors} out of ${totalConnectors} connectors`);
    
    return {
      success: true,
      message: `${allConnectedObjects.size}個のオブジェクトを再配置し、${optimizedConnectors}個のコネクタを最適化しました。`,
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
