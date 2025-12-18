// LLM Configuration Types

export type LLMProvider = 'ollama' | 'openai';

export interface LLMConfig {
  provider: LLMProvider;
  endpoint: string; // e.g., http://localhost:11434/api/generate
  model: string; // e.g., llama3, qwen2.5, deepseek-r1
  temperature: number;
  maxTokens: number;
}

// Diagram JSON Schema Types

export type DiagramType = 'ER' | 'FLOW' | 'GENERIC';
export type NodeType = 'shape' | 'text';
export type ShapeStyle = 'rectangle' | 'round_rectangle' | 'note';
export type LineStyle = 'solid' | 'dashed';
export type ArrowStyle = 'none' | 'end';

export interface DiagramMeta {
  title: string;
  diagramType: DiagramType;
  version: string;
}

export interface NodeStyle {
  shape: ShapeStyle;
  fontSize: number;
}

export interface DiagramNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  style: NodeStyle;
}

export interface EdgeStyle {
  line: LineStyle;
  arrow: ArrowStyle;
}

export interface DiagramEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  style: EdgeStyle;
}

export interface DiagramJSON {
  meta: DiagramMeta;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

// Validation Types

export interface ValidationError {
  type: 'schema' | 'reference' | 'overlap' | 'field';
  message: string;
  details?: any;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// LLM Response Types

export interface LLMResponse {
  success: boolean;
  data?: DiagramJSON;
  error?: string;
  rawResponse?: string;
}
