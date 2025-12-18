// Diagram Rendering Service - Renders validated JSON to Miro board

import { DiagramJSON, DiagramNode, DiagramEdge } from '../models/llmTypes';
import { getMiro } from '../miro';

export interface RenderResult {
  success: boolean;
  message: string;
  itemsCreated?: number;
}

/**
 * Render diagram JSON to Miro board
 */
export async function renderDiagramToMiro(diagramData: DiagramJSON): Promise<RenderResult> {
  try {
    const { instance: miro } = await getMiro();
    
    if (!miro || !miro.board) {
      throw new Error('Miro SDK not initialized');
    }

    console.log('🎨 Rendering diagram to Miro:', diagramData.meta.title);

    const nodeMap = new Map<string, any>(); // Map node IDs to Miro item IDs
    let createdCount = 0;

    // 1. Render nodes
    for (const node of diagramData.nodes) {
      const miroItem = await renderNode(miro, node);
      if (miroItem) {
        nodeMap.set(node.id, miroItem.id);
        createdCount++;
      }
    }

    // 2. Render edges (connectors)
    for (const edge of diagramData.edges) {
      const fromItemId = nodeMap.get(edge.from);
      const toItemId = nodeMap.get(edge.to);

      if (fromItemId && toItemId) {
        await renderEdge(miro, edge, fromItemId, toItemId);
        createdCount++;
      } else {
        console.warn(`⚠️ Skipping edge ${edge.id}: node reference not found`);
      }
    }

    return {
      success: true,
      message: `✅ 図を生成しました: ${diagramData.meta.title} (${createdCount}個のオブジェクト)`,
      itemsCreated: createdCount,
    };
  } catch (error: any) {
    console.error('❌ Render error:', error);
    return {
      success: false,
      message: `描画エラー: ${error.message}`,
      itemsCreated: 0,
    };
  }
}

/**
 * Render a single node to Miro
 */
async function renderNode(miro: any, node: DiagramNode): Promise<any> {
  try {
    if (node.type === 'shape') {
      // Map style.shape to Miro shape type
      let shapeType: 'rectangle' | 'round_rectangle' = 'rectangle';
      if (node.style.shape === 'round_rectangle') {
        shapeType = 'round_rectangle';
      }

      const shape = await miro.board.createShape({
        shape: shapeType,
        x: node.x,
        y: node.y,
        width: node.w,
        height: node.h,
        content: node.text,
        style: {
          fontSize: node.style.fontSize,
          textAlign: 'center',
          textAlignVertical: 'middle',
          fillColor: '#ffffff',
          borderColor: '#1a1a1a',
          borderWidth: 2,
        },
      });

      return shape;
    } else if (node.type === 'text') {
      const text = await miro.board.createText({
        content: node.text,
        x: node.x,
        y: node.y,
        width: node.w,
        style: {
          fontSize: node.style.fontSize,
          textAlign: 'center',
        },
      });

      return text;
    }
  } catch (error) {
    console.error(`Error rendering node ${node.id}:`, error);
    throw error;
  }
}

/**
 * Render a single edge (connector) to Miro
 */
async function renderEdge(
  miro: any,
  edge: DiagramEdge,
  fromItemId: string,
  toItemId: string
): Promise<any> {
  try {
    // Map style to Miro connector style
    const strokeStyle = edge.style.line === 'dashed' ? 'dashed' : 'normal';
    const endStrokeCap = edge.style.arrow === 'end' ? 'arrow' : 'none';

    const connector = await miro.board.createConnector({
      start: {
        item: fromItemId,
      },
      end: {
        item: toItemId,
      },
      style: {
        strokeStyle: strokeStyle,
        endStrokeCap: endStrokeCap,
        strokeColor: '#1a1a1a',
        strokeWidth: 2,
      },
      captions: edge.label
        ? [
            {
              content: edge.label,
              position: 0.5, // Middle of the connector
            },
          ]
        : [],
    });

    return connector;
  } catch (error) {
    console.error(`Error rendering edge ${edge.id}:`, error);
    throw error;
  }
}
