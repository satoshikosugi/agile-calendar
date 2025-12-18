// Diagram JSON Validation Service

import { ValidationResult, ValidationError } from '../models/llmTypes';

/**
 * Validate diagram JSON against schema and business rules
 */
export function validateDiagramJSON(data: any): ValidationResult {
  const errors: ValidationError[] = [];

  // 1. Basic schema validation
  if (!data || typeof data !== 'object') {
    errors.push({
      type: 'schema',
      message: 'Invalid data: not an object',
    });
    return { valid: false, errors };
  }

  // Validate meta
  if (!data.meta) {
    errors.push({
      type: 'field',
      message: 'Missing required field: meta',
    });
  } else {
    if (!data.meta.title || typeof data.meta.title !== 'string') {
      errors.push({
        type: 'field',
        message: 'meta.title is required and must be a string',
      });
    }
    if (!data.meta.diagramType || !['ER', 'FLOW', 'GENERIC'].includes(data.meta.diagramType)) {
      errors.push({
        type: 'field',
        message: 'meta.diagramType must be one of: ER, FLOW, GENERIC',
      });
    }
    if (!data.meta.version || typeof data.meta.version !== 'string') {
      errors.push({
        type: 'field',
        message: 'meta.version is required and must be a string',
      });
    }
  }

  // Validate nodes
  if (!Array.isArray(data.nodes)) {
    errors.push({
      type: 'field',
      message: 'nodes must be an array',
    });
    return { valid: false, errors };
  }

  const nodeIds = new Set<string>();
  for (let i = 0; i < data.nodes.length; i++) {
    const node = data.nodes[i];
    
    // Check required fields
    if (!node.id || typeof node.id !== 'string') {
      errors.push({
        type: 'field',
        message: `nodes[${i}]: id is required and must be a string`,
        details: { index: i, node },
      });
    } else {
      // Check ID uniqueness
      if (nodeIds.has(node.id)) {
        errors.push({
          type: 'field',
          message: `Duplicate node ID: ${node.id}`,
          details: { id: node.id },
        });
      }
      nodeIds.add(node.id);
    }

    if (!node.type || !['shape', 'text'].includes(node.type)) {
      errors.push({
        type: 'field',
        message: `nodes[${i}]: type must be 'shape' or 'text'`,
        details: { index: i, type: node.type },
      });
    }

    if (typeof node.x !== 'number' || typeof node.y !== 'number') {
      errors.push({
        type: 'field',
        message: `nodes[${i}]: x and y must be numbers`,
        details: { index: i, x: node.x, y: node.y },
      });
    }

    if (typeof node.w !== 'number' || typeof node.h !== 'number') {
      errors.push({
        type: 'field',
        message: `nodes[${i}]: w and h must be numbers`,
        details: { index: i, w: node.w, h: node.h },
      });
    }

    // Check minimum size
    if (node.w < 260 || node.h < 120) {
      errors.push({
        type: 'field',
        message: `nodes[${i}]: minimum size is w >= 260, h >= 120`,
        details: { index: i, w: node.w, h: node.h },
      });
    }

    if (!node.text || typeof node.text !== 'string') {
      errors.push({
        type: 'field',
        message: `nodes[${i}]: text is required and must be a string`,
        details: { index: i },
      });
    }

    if (!node.style || typeof node.style !== 'object') {
      errors.push({
        type: 'field',
        message: `nodes[${i}]: style is required and must be an object`,
        details: { index: i },
      });
    } else {
      if (!['rectangle', 'round_rectangle', 'note'].includes(node.style.shape)) {
        errors.push({
          type: 'field',
          message: `nodes[${i}]: style.shape must be 'rectangle', 'round_rectangle', or 'note'`,
          details: { index: i, shape: node.style.shape },
        });
      }
      if (typeof node.style.fontSize !== 'number') {
        errors.push({
          type: 'field',
          message: `nodes[${i}]: style.fontSize must be a number`,
          details: { index: i, fontSize: node.style.fontSize },
        });
      }
    }
  }

  // Validate edges
  if (!Array.isArray(data.edges)) {
    errors.push({
      type: 'field',
      message: 'edges must be an array',
    });
  } else {
    const edgeIds = new Set<string>();
    for (let i = 0; i < data.edges.length; i++) {
      const edge = data.edges[i];

      if (!edge.id || typeof edge.id !== 'string') {
        errors.push({
          type: 'field',
          message: `edges[${i}]: id is required and must be a string`,
          details: { index: i, edge },
        });
      } else {
        // Check ID uniqueness
        if (edgeIds.has(edge.id)) {
          errors.push({
            type: 'field',
            message: `Duplicate edge ID: ${edge.id}`,
            details: { id: edge.id },
          });
        }
        edgeIds.add(edge.id);
      }

      // Check reference integrity
      if (!edge.from || typeof edge.from !== 'string') {
        errors.push({
          type: 'field',
          message: `edges[${i}]: from is required and must be a string`,
          details: { index: i },
        });
      } else if (!nodeIds.has(edge.from)) {
        errors.push({
          type: 'reference',
          message: `edges[${i}]: from references non-existent node '${edge.from}'`,
          details: { index: i, from: edge.from },
        });
      }

      if (!edge.to || typeof edge.to !== 'string') {
        errors.push({
          type: 'field',
          message: `edges[${i}]: to is required and must be a string`,
          details: { index: i },
        });
      } else if (!nodeIds.has(edge.to)) {
        errors.push({
          type: 'reference',
          message: `edges[${i}]: to references non-existent node '${edge.to}'`,
          details: { index: i, to: edge.to },
        });
      }

      if (typeof edge.label !== 'string') {
        errors.push({
          type: 'field',
          message: `edges[${i}]: label must be a string`,
          details: { index: i },
        });
      }

      if (!edge.style || typeof edge.style !== 'object') {
        errors.push({
          type: 'field',
          message: `edges[${i}]: style is required and must be an object`,
          details: { index: i },
        });
      } else {
        if (!['solid', 'dashed'].includes(edge.style.line)) {
          errors.push({
            type: 'field',
            message: `edges[${i}]: style.line must be 'solid' or 'dashed'`,
            details: { index: i, line: edge.style.line },
          });
        }
        if (!['none', 'end'].includes(edge.style.arrow)) {
          errors.push({
            type: 'field',
            message: `edges[${i}]: style.arrow must be 'none' or 'end'`,
            details: { index: i, arrow: edge.style.arrow },
          });
        }
      }
    }
  }

  // 2. Check for overlapping nodes (simplified check)
  if (data.nodes && Array.isArray(data.nodes)) {
    for (let i = 0; i < data.nodes.length; i++) {
      for (let j = i + 1; j < data.nodes.length; j++) {
        const node1 = data.nodes[i];
        const node2 = data.nodes[j];
        
        if (checkOverlap(node1, node2)) {
          errors.push({
            type: 'overlap',
            message: `Nodes overlap: ${node1.id} and ${node2.id}`,
            details: { node1: node1.id, node2: node2.id },
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if two nodes overlap
 */
function checkOverlap(node1: any, node2: any): boolean {
  // Add minimum margin of 40px
  const margin = 40;
  
  const x1 = node1.x - margin;
  const y1 = node1.y - margin;
  const w1 = node1.w + margin * 2;
  const h1 = node1.h + margin * 2;
  
  const x2 = node2.x - margin;
  const y2 = node2.y - margin;
  const w2 = node2.w + margin * 2;
  const h2 = node2.h + margin * 2;
  
  // Check if rectangles intersect
  return !(
    x1 + w1 <= x2 || // node1 is to the left of node2
    x2 + w2 <= x1 || // node2 is to the left of node1
    y1 + h1 <= y2 || // node1 is above node2
    y2 + h2 <= y1    // node2 is above node1
  );
}
