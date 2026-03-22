import {
  getAllItems,
  getAllConnectors,
  updateItemPosition,
  updateConnector,
  MiroItem,
  MiroConnector,
} from './miroApiService';

interface OptimizationResult {
  success: boolean;
  message: string;
  objectsProcessed: number;
  connectorsOptimized: number;
}

interface OptimizationOptions {
  allowMovement: boolean;
  spacingFactor: number;
  priority: number; // 0-100
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

function calculateOptimalSnapPosition(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  existingConnections: Array<{ snapTo: string }>
): 'top' | 'right' | 'bottom' | 'left' {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;

  let snapTo: 'top' | 'right' | 'bottom' | 'left';

  if (Math.abs(dx) > Math.abs(dy)) {
    snapTo = dx > 0 ? 'right' : 'left';
  } else {
    snapTo = dy > 0 ? 'bottom' : 'top';
  }

  const snapCounts = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const conn of existingConnections) {
    snapCounts[conn.snapTo as keyof typeof snapCounts]++;
  }

  if (snapCounts[snapTo] >= 1) {
    const alternatives = Math.abs(dx) > Math.abs(dy)
      ? ['top', 'bottom']
      : ['left', 'right'];

    const alt1 = alternatives[0] as 'top' | 'right' | 'bottom' | 'left';
    const alt2 = alternatives[1] as 'top' | 'right' | 'bottom' | 'left';

    if (snapCounts[alt1] < snapCounts[snapTo] || snapCounts[alt2] < snapCounts[snapTo]) {
      snapTo = snapCounts[alt1] <= snapCounts[alt2] ? alt1 : alt2;
    }
  }

  return snapTo;
}

function applyGridOptimizationLayout(
  nodes: Node[],
  edges: Edge[],
  options: OptimizationOptions
): Map<string, { x: number; y: number }> {
  if (nodes.length === 0) return new Map();

  let avgWidth = 100;
  let avgHeight = 100;
  if (nodes.length > 0) {
    avgWidth = nodes.reduce((sum, n) => sum + n.width, 0) / nodes.length;
    avgHeight = nodes.reduce((sum, n) => sum + n.height, 0) / nodes.length;
  }

  const GRID_X = avgWidth * options.spacingFactor;
  const GRID_Y = avgHeight * options.spacingFactor;

  const gridNodes = nodes.map((n) => ({
    id: n.id,
    gx: Math.round(n.x / GRID_X),
    gy: Math.round(n.y / GRID_Y),
    origX: n.x,
    origY: n.y,
  }));

  const gridMap = new Map<string, (typeof gridNodes)[0]>();

  gridNodes.forEach((n) => {
    if (!gridMap.has(`${n.gx},${n.gy}`)) {
      gridMap.set(`${n.gx},${n.gy}`, n);
      return;
    }
    let r = 1;
    let placed = false;
    while (!placed) {
      for (let x = -r; x <= r && !placed; x++) {
        for (let y = -r; y <= r && !placed; y++) {
          if (Math.abs(x) !== r && Math.abs(y) !== r) continue;
          const key = `${n.gx + x},${n.gy + y}`;
          if (!gridMap.has(key)) {
            n.gx += x;
            n.gy += y;
            gridMap.set(key, n);
            placed = true;
          }
        }
      }
      r++;
      if (r > 20) { gridMap.set(`${n.gx},${n.gy}`, n); placed = true; }
    }
  });

  const nodeMap = new Map(gridNodes.map((n) => [n.id, n]));

  const getGraphNeighbors = (nodeId: string) => {
    const neighbors: (typeof gridNodes)[0][] = [];
    edges.forEach((e) => {
      if (e.source === nodeId) { const t = nodeMap.get(e.target); if (t) neighbors.push(t); }
      if (e.target === nodeId) { const s = nodeMap.get(e.source); if (s) neighbors.push(s); }
    });
    return neighbors;
  };

  const calculatePenalty = () => {
    let penalty = 0;
    const posCounts = new Map<string, number>();
    gridNodes.forEach((n) => {
      const key = `${n.gx},${n.gy}`;
      posCounts.set(key, (posCounts.get(key) || 0) + 1);
    });
    posCounts.forEach((count) => { if (count > 1) penalty += (count - 1) * 100000; });

    gridNodes.forEach((node) => {
      const neighbors = getGraphNeighbors(node.id);
      const ports = { top: 0, bottom: 0, left: 0, right: 0 };
      neighbors.forEach((nb) => {
        const dx = nb.gx - node.gx;
        const dy = nb.gy - node.gy;
        if (Math.abs(dx) > Math.abs(dy)) { if (dx > 0) ports.right++; else ports.left++; }
        else { if (dy > 0) ports.bottom++; else ports.top++; }
      });
      Object.values(ports).forEach((count) => { if (count > 1) penalty += (count - 1) * 500; });
    });
    return penalty;
  };

  const calculateTotalCost = () => {
    let cost = calculatePenalty();
    edges.forEach((e) => {
      const s = nodeMap.get(e.source);
      const t = nodeMap.get(e.target);
      if (s && t) cost += (Math.abs(s.gx - t.gx) + Math.abs(s.gy - t.gy)) * 10;
    });
    return cost;
  };

  // Simulated Annealing
  let currentCost = calculateTotalCost();
  let temperature = 100;
  const coolingRate = 0.95;

  for (let i = 0; i < 2000; i++) {
    if (Math.random() < 0.5) {
      const idx1 = Math.floor(Math.random() * gridNodes.length);
      const idx2 = Math.floor(Math.random() * gridNodes.length);
      if (idx1 === idx2) continue;

      const n1 = gridNodes[idx1];
      const n2 = gridNodes[idx2];

      gridMap.delete(`${n1.gx},${n1.gy}`);
      gridMap.delete(`${n2.gx},${n2.gy}`);
      const tmpGx = n1.gx; const tmpGy = n1.gy;
      n1.gx = n2.gx; n1.gy = n2.gy;
      n2.gx = tmpGx; n2.gy = tmpGy;
      gridMap.set(`${n1.gx},${n1.gy}`, n1);
      gridMap.set(`${n2.gx},${n2.gy}`, n2);

      const newCost = calculateTotalCost();
      const delta = newCost - currentCost;
      if (delta < 0 || Math.random() < Math.exp(-delta / temperature)) {
        currentCost = newCost;
      } else {
        gridMap.delete(`${n1.gx},${n1.gy}`); gridMap.delete(`${n2.gx},${n2.gy}`);
        n2.gx = n1.gx; n2.gy = n1.gy; n1.gx = tmpGx; n1.gy = tmpGy;
        gridMap.set(`${n1.gx},${n1.gy}`, n1); gridMap.set(`${n2.gx},${n2.gy}`, n2);
      }
    } else {
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

  // Iterative repair
  let penalty = calculatePenalty();
  for (let iter = 0; iter < 500 && penalty > 0; iter++) {
    const shuffled = [...gridNodes].sort(() => Math.random() - 0.5);
    let improved = false;
    for (const node of shuffled) {
      const currentPenalty = calculatePenalty();
      const moves = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
      let bestMove = null;
      let bestPenalty = currentPenalty;

      for (const move of moves) {
        const newGx = node.gx + move.dx;
        const newGy = node.gy + move.dy;
        if (!gridMap.has(`${newGx},${newGy}`)) {
          const oldGx = node.gx; const oldGy = node.gy;
          gridMap.delete(`${oldGx},${oldGy}`);
          node.gx = newGx; node.gy = newGy;
          gridMap.set(`${newGx},${newGy}`, node);
          const np = calculatePenalty();
          if (np < bestPenalty) { bestPenalty = np; bestMove = { gx: newGx, gy: newGy }; }
          gridMap.delete(`${newGx},${newGy}`);
          node.gx = oldGx; node.gy = oldGy;
          gridMap.set(`${oldGx},${oldGy}`, node);
        }
      }

      if (bestMove) {
        gridMap.delete(`${node.gx},${node.gy}`);
        node.gx = bestMove.gx; node.gy = bestMove.gy;
        gridMap.set(`${node.gx},${node.gy}`, node);
        improved = true;
      }
    }
    penalty = calculatePenalty();
    if (!improved) break;
  }

  // Compaction
  const uniqueX = Array.from(new Set(gridNodes.map((n) => n.gx))).sort((a, b) => a - b);
  const mapX = new Map(uniqueX.map((val, i) => [val, i]));
  const uniqueY = Array.from(new Set(gridNodes.map((n) => n.gy))).sort((a, b) => a - b);
  const mapY = new Map(uniqueY.map((val, i) => [val, i]));
  gridNodes.forEach((n) => { n.gx = mapX.get(n.gx)!; n.gy = mapY.get(n.gy)!; });

  // Convert back to coordinates
  let gridCX = 0; let gridCY = 0;
  gridNodes.forEach((n) => { gridCX += n.gx; gridCY += n.gy; });
  if (gridNodes.length > 0) { gridCX /= gridNodes.length; gridCY /= gridNodes.length; }

  let origCX = 0; let origCY = 0;
  nodes.forEach((n) => { origCX += n.x; origCY += n.y; });
  if (nodes.length > 0) { origCX /= nodes.length; origCY /= nodes.length; }

  const result = new Map<string, { x: number; y: number }>();
  gridNodes.forEach((node) => {
    result.set(node.id, {
      x: origCX + (node.gx - gridCX) * GRID_X,
      y: origCY + (node.gy - gridCY) * GRID_Y,
    });
  });

  return result;
}

export async function optimizeConnectors(
  boardId: string,
  token: string,
  options: OptimizationOptions = { allowMovement: true, spacingFactor: 1.5, priority: 50 }
): Promise<OptimizationResult> {
  try {
    // Get all connectors and items from the board
    const allConnectors = await getAllConnectors(boardId, token);

    if (allConnectors.length === 0) {
      return { success: false, message: 'ボード上にコネクタが見つかりません。', objectsProcessed: 0, connectorsOptimized: 0 };
    }

    // Collect all item IDs referenced by connectors
    const connectedItemIds = new Set<string>();
    allConnectors.forEach((c: MiroConnector) => {
      if (c.startItem?.id) connectedItemIds.add(c.startItem.id);
      if (c.endItem?.id) connectedItemIds.add(c.endItem.id);
    });

    if (connectedItemIds.size === 0) {
      return { success: false, message: 'コネクタに接続されたオブジェクトが見つかりません。', objectsProcessed: 0, connectorsOptimized: 0 };
    }

    // Get all items and filter to those referenced by connectors
    const allItems = await getAllItems(boardId, token);
    const connectedItems = allItems.filter(
      (item: MiroItem) => connectedItemIds.has(item.id) && item.type !== 'connector'
    );

    const itemPositions = new Map(
      connectedItems.map((item: MiroItem) => [item.id, { x: item.position.x, y: item.position.y }])
    );

    // Optionally apply grid layout optimization
    if (options.allowMovement && connectedItems.length > 0) {
      const nodes: Node[] = connectedItems.map((item: MiroItem) => ({
        id: item.id,
        x: item.position.x,
        y: item.position.y,
        width: item.geometry?.width || 100,
        height: item.geometry?.height || 100,
      }));

      const edges: Edge[] = allConnectors
        .filter((c: MiroConnector) => c.startItem?.id && c.endItem?.id &&
          connectedItemIds.has(c.startItem.id) && connectedItemIds.has(c.endItem.id))
        .map((c: MiroConnector) => ({ source: c.startItem.id, target: c.endItem.id }));

      const newPositions = applyGridOptimizationLayout(nodes, edges, options);

      for (const item of connectedItems) {
        const newPos = newPositions.get(item.id);
        if (newPos) {
          await updateItemPosition(boardId, token, item.id, item.type, newPos.x, newPos.y);
          itemPositions.set(item.id, { x: newPos.x, y: newPos.y });
        }
      }
    }

    // Optimize connector snap positions
    const itemConnections = new Map<string, Array<{ snapTo: string }>>();
    let optimizedConnectors = 0;

    for (const connector of allConnectors) {
      const startId = connector.startItem?.id;
      const endId = connector.endItem?.id;
      if (!startId || !endId) continue;

      const startPos = itemPositions.get(startId);
      const endPos = itemPositions.get(endId);
      if (!startPos || !endPos) continue;

      const startConns = itemConnections.get(startId) || [];
      const endConns = itemConnections.get(endId) || [];

      const startSnapTo = calculateOptimalSnapPosition(startPos.x, startPos.y, endPos.x, endPos.y, startConns);
      const endSnapTo = calculateOptimalSnapPosition(endPos.x, endPos.y, startPos.x, startPos.y, endConns);

      startConns.push({ snapTo: startSnapTo });
      endConns.push({ snapTo: endSnapTo });
      itemConnections.set(startId, startConns);
      itemConnections.set(endId, endConns);

      const needsUpdate =
        connector.startItem?.snapTo !== startSnapTo ||
        connector.endItem?.snapTo !== endSnapTo;

      if (needsUpdate) {
        await updateConnector(boardId, token, connector.id, startId, startSnapTo, endId, endSnapTo);
        optimizedConnectors++;
      }
    }

    return {
      success: true,
      message: `${connectedItems.length}個のオブジェクトを処理し、${optimizedConnectors}個のコネクタを最適化しました。`,
      objectsProcessed: connectedItems.length,
      connectorsOptimized: optimizedConnectors,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, message: `エラーが発生しました: ${msg}`, objectsProcessed: 0, connectorsOptimized: 0 };
  }
}
