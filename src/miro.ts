// Miro Web SDK helper functions
/// <reference types="@mirohq/websdk-types" />

// Check if we're running in actual Miro environment (not just SDK loaded)
const isMiroEnvironment = (() => {
  try {
    // Check if miro exists and if we're in an iframe (Miro panel context)
    return typeof window !== 'undefined' && 
           (window as any).miro && 
           window.parent !== window;
  } catch {
    return false;
  }
})();

// Mock Miro API for development outside of Miro
const createMockMiro = () => {
  console.warn('⚠️ Running in development mode without Miro SDK. Using mock data.');
  
  let mockData: any = {};
  
  return {
    board: {
      get: async (options: any) => {
        const tag = options.tags?.[0];
        if (tag && mockData[tag]) {
          return [mockData[tag]];
        }
        return [];
      },
      createShape: async (config: any) => {
        const shape = {
          ...config,
          id: 'mock-shape-' + Date.now(),
          tags: [],
          metadata: {},
          setMetadata: async function(key: string, value: any) {
            this.metadata[key] = value;
          },
          getMetadata: async function(key: string) {
            return this.metadata[key];
          },
          sync: async function() {
            const tag = this.tags[0];
            if (tag) {
              mockData[tag] = this;
            }
          }
        };
        return shape;
      },
      createStickyNote: async (config: any) => {
        return {
          ...config,
          id: 'mock-sticky-' + Date.now(),
          sync: async function() {},
        };
      },
      createFrame: async (config: any) => {
        return {
          ...config,
          id: 'mock-frame-' + Date.now(),
        };
      },
      createText: async (config: any) => {
        return {
          ...config,
          id: 'mock-text-' + Date.now(),
        };
      },
      ui: {
        on: async () => {},
        openPanel: async () => {},
      },
    },
  };
};

// Use mock in development, real SDK in Miro environment
export const miro = isMiroEnvironment ? (window as any).miro : createMockMiro();

export async function initializeMiro() {
  if (!isMiroEnvironment) {
    console.log('📝 Development mode: Miro SDK not available');
    return;
  }
  
  await miro.board.ui.on('icon:click', async () => {
    await miro.board.ui.openPanel({
      url: 'index.html',
      height: 800,
    });
  });
}
