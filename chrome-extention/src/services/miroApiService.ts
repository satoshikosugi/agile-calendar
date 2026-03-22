// Miro REST API v2 service for Chrome Extension
// Uses personal access tokens for authentication

const MIRO_API_BASE = 'https://api.miro.com/v2';

export interface MiroFrame {
  id: string;
  type: 'frame';
  data: { title: string; format?: string; type?: string };
  position: { x: number; y: number; origin?: string };
  geometry: { width: number; height: number };
}

export interface MiroItem {
  id: string;
  type: string;
  position: { x: number; y: number };
  geometry?: { width: number; height: number };
  data?: Record<string, unknown>;
}

export interface MiroConnector {
  id: string;
  startItem: { id: string; snapTo?: string };
  endItem: { id: string; snapTo?: string };
  shape?: string;
}

async function apiCall<T>(
  token: string,
  method: string,
  url: string,
  body?: unknown
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Miro API error ${response.status}: ${errorText}`);
  }

  if (response.status === 204) return null as T;
  return response.json() as Promise<T>;
}

function boardUrl(boardId: string, path: string): string {
  return `${MIRO_API_BASE}/boards/${encodeURIComponent(boardId)}${path}`;
}

interface PageResult<T> {
  data: T[];
  links?: { next?: string };
  total?: number;
  size?: number;
}

async function paginatedGet<T>(token: string, initialUrl: string): Promise<T[]> {
  const items: T[] = [];
  let url: string | null = initialUrl;

  while (url) {
    const result: PageResult<T> = await apiCall<PageResult<T>>(token, 'GET', url);
    items.push(...(result.data || []));
    url = result.links?.next || null;
  }

  return items;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Extract board ID from a Miro board URL or return as-is
export function extractBoardId(input: string): string {
  const match = input.match(/\/board\/([^/?#]+)/);
  if (match) return decodeURIComponent(match[1]);
  return input.trim();
}

// Validate API token and board access; returns board name
export async function validateConnection(boardId: string, token: string): Promise<string> {
  const result = await apiCall<{ id: string; name: string }>(
    token,
    'GET',
    boardUrl(boardId, '')
  );
  return result.name;
}

// Get all frames on a board
export async function getFrames(boardId: string, token: string): Promise<MiroFrame[]> {
  return paginatedGet<MiroFrame>(token, boardUrl(boardId, '/frames?limit=50'));
}

// Create a frame
export async function createFrame(
  boardId: string,
  token: string,
  params: { title: string; x: number; y: number; width: number; height: number }
): Promise<MiroFrame> {
  return apiCall<MiroFrame>(token, 'POST', boardUrl(boardId, '/frames'), {
    data: { title: params.title, format: 'custom', type: 'freeform' },
    position: { x: params.x, y: params.y, origin: 'center' },
    geometry: { width: params.width, height: params.height },
  });
}

// Create a text item
export async function createText(
  boardId: string,
  token: string,
  params: {
    content: string;
    x: number;
    y: number;
    width: number;
    style?: Record<string, unknown>;
    parentId?: string;
  }
): Promise<{ id: string }> {
  await sleep(50);
  const body: Record<string, unknown> = {
    data: { content: params.content },
    position: { x: params.x, y: params.y, origin: 'center' },
    geometry: { width: params.width },
  };
  if (params.style) body.style = params.style;
  if (params.parentId) body.parent = { id: params.parentId };
  return apiCall(token, 'POST', boardUrl(boardId, '/texts'), body);
}

// Create a shape item
export async function createShape(
  boardId: string,
  token: string,
  params: {
    shape: string;
    content?: string;
    x: number;
    y: number;
    width: number;
    height: number;
    style?: Record<string, unknown>;
    parentId?: string;
  }
): Promise<{ id: string }> {
  await sleep(50);
  const body: Record<string, unknown> = {
    data: { shape: params.shape, content: params.content ?? '' },
    position: { x: params.x, y: params.y, origin: 'center' },
    geometry: { width: params.width, height: params.height },
  };
  if (params.style) body.style = params.style;
  if (params.parentId) body.parent = { id: params.parentId };
  return apiCall(token, 'POST', boardUrl(boardId, '/shapes'), body);
}

// Get all items on a board
export async function getAllItems(boardId: string, token: string): Promise<MiroItem[]> {
  return paginatedGet<MiroItem>(token, boardUrl(boardId, '/items?limit=50'));
}

// Get all connectors on a board
export async function getAllConnectors(boardId: string, token: string): Promise<MiroConnector[]> {
  return paginatedGet<MiroConnector>(token, boardUrl(boardId, '/connectors?limit=50'));
}

function getTypeEndpoint(type: string): string | null {
  const map: Record<string, string> = {
    shape: 'shapes',
    text: 'texts',
    sticky_note: 'sticky_notes',
    frame: 'frames',
    card: 'cards',
    image: 'images',
    app_card: 'app_cards',
  };
  return map[type] ?? null;
}

// Update item position
export async function updateItemPosition(
  boardId: string,
  token: string,
  itemId: string,
  itemType: string,
  x: number,
  y: number
): Promise<void> {
  const endpoint = getTypeEndpoint(itemType);
  if (!endpoint) return;
  await sleep(30);
  await apiCall(token, 'PATCH', boardUrl(boardId, `/${endpoint}/${itemId}`), {
    position: { x, y, origin: 'center' },
  });
}

// Update connector snap positions
export async function updateConnector(
  boardId: string,
  token: string,
  connectorId: string,
  startItemId: string,
  startSnapTo: string,
  endItemId: string,
  endSnapTo: string
): Promise<void> {
  await sleep(30);
  await apiCall(token, 'PATCH', boardUrl(boardId, `/connectors/${connectorId}`), {
    startItem: { id: startItemId, snapTo: startSnapTo },
    endItem: { id: endItemId, snapTo: endSnapTo },
  });
}

export interface MiroStickyNote {
  id: string;
  type: 'sticky_note';
  data: { content: string };
  position: { x: number; y: number };
  geometry?: { width: number; height: number };
  style?: Record<string, unknown>;
  parent?: { id: string };
}

// Get all sticky notes on a board (paginated)
export async function getStickyNotes(boardId: string, token: string): Promise<MiroStickyNote[]> {
  return paginatedGet<MiroStickyNote>(token, boardUrl(boardId, '/sticky_notes?limit=50'));
}

// Create a sticky note
export async function createStickyNote(
  boardId: string,
  token: string,
  params: {
    content: string;
    x: number;
    y: number;
    width?: number;
    fillColor?: string;
    parentId?: string;
  }
): Promise<MiroStickyNote> {
  await sleep(50);
  const body: Record<string, unknown> = {
    data: { content: params.content },
    position: { x: params.x, y: params.y, origin: 'center' },
  };
  if (params.width) body.geometry = { width: params.width };
  if (params.fillColor) body.style = { fillColor: params.fillColor };
  if (params.parentId) body.parent = { id: params.parentId };
  return apiCall<MiroStickyNote>(token, 'POST', boardUrl(boardId, '/sticky_notes'), body);
}

// Update a sticky note
export async function updateStickyNote(
  boardId: string,
  token: string,
  noteId: string,
  params: {
    content?: string;
    x?: number;
    y?: number;
    fillColor?: string;
    parentId?: string;
  }
): Promise<void> {
  await sleep(50);
  const body: Record<string, unknown> = {};
  if (params.content !== undefined) body.data = { content: params.content };
  if (params.x !== undefined || params.y !== undefined) {
    body.position = { x: params.x, y: params.y, origin: 'center' };
  }
  if (params.fillColor !== undefined) body.style = { fillColor: params.fillColor };
  if (params.parentId !== undefined) body.parent = { id: params.parentId };
  await apiCall(token, 'PATCH', boardUrl(boardId, `/sticky_notes/${noteId}`), body);
}

// Delete an item by type and id
export async function deleteItem(
  boardId: string,
  token: string,
  itemType: string,
  itemId: string
): Promise<void> {
  const endpoint = getTypeEndpoint(itemType);
  if (!endpoint) return;
  await apiCall(token, 'DELETE', boardUrl(boardId, `/${endpoint}/${itemId}`), undefined);
}
