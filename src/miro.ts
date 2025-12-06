// Miro Web SDK helper functions
/// <reference types="@mirohq/websdk-types" />

// Initialize Miro SDK
let miroInstance: any = null;
let initializationPromise: Promise<void> | null = null;

const initializeMiro = async () => {
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = new Promise<void>(async (resolve) => {
    // Check if we're in Miro environment
    if (typeof window === 'undefined') {
      console.warn('⚠️ Running in development mode without Miro SDK. Using mock data.');
      miroInstance = createMockMiro();
      resolve();
      return;
    }

    const windowMiro = (window as any).miro;
    
    if (!windowMiro) {
      console.warn('⚠️ Miro SDK not found. Using mock data.');
      miroInstance = createMockMiro();
      resolve();
      return;
    }

    // Try to initialize SDK by calling board.getInfo() as a health check
    try {
      console.log('✅ Miro SDK detected, attempting to connect...');
      // Avoid logging proxy objects directly as it can cause issues with SDK
      // console.log('SDK object:', windowMiro);
      // console.log('SDK board:', windowMiro?.board);
      
      // Test if SDK is actually connected with a longer timeout (10 seconds)
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('SDK connection timeout after 10s')), 10000)
      );
      
      const boardInfo = await Promise.race([
        windowMiro.board.getInfo(),
        timeoutPromise
      ]);
      
      console.log('✅ Miro SDK connected successfully');
      console.log('Board info:', boardInfo);
      miroInstance = windowMiro;
      resolve();
    } catch (error) {
      console.error('❌ Miro SDK connection failed:', error);
      console.error('Error details:', {
        name: (error as Error).name,
        message: (error as Error).message,
        stack: (error as Error).stack
      });
      console.warn('⚠️ Falling back to mock mode - app will work with local storage');
      console.warn('⚠️ Note: In mock mode, calendar will NOT be drawn on the actual Miro board');
      miroInstance = createMockMiro();
      resolve();
    }
  });

  return initializationPromise;
};

// Mock Miro API for development outside of Miro
const createMockMiro = () => {
  console.warn('⚠️ Running in mock mode. Data will be stored in browser localStorage.');
  
  // Use localStorage for persistence
  const STORAGE_KEY = 'agile-calendar-mock-data';
  
  const loadMockData = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  };
  
  const saveMockData = (data: any) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save mock data:', error);
    }
  };
  
  let mockData: any = loadMockData();
  
  return {
    board: {
      get: async (options: any) => {
        // Filter by type and tags if specified
        const items = Object.values(mockData).filter((item: any) => {
          if (options?.type && item.type !== options.type) {
            return false;
          }
          // Filter by tags if specified
          if (options?.tags && Array.isArray(options.tags)) {
            const itemTags = item.tags || [];
            // Check if item has any of the requested tags
            const hasTag = options.tags.some((tag: string) => itemTags.includes(tag));
            if (!hasTag) {
              return false;
            }
          }
          return true;
        });
        
        // Add methods to retrieved items
        return items.map((item: any) => {
          const obj = { ...item };
          Object.defineProperties(obj, {
            setMetadata: {
              value: async function(key: string, value: any) {
                this.metadata = this.metadata || {};
                this.metadata[key] = value;
                mockData[this.id] = { ...this };
                saveMockData(mockData);
              },
              enumerable: false,
              writable: true
            },
            getMetadata: {
              value: async function(key: string) {
                return this.metadata?.[key];
              },
              enumerable: false,
              writable: true
            },
            sync: {
              value: async function() {
                mockData[this.id] = {
                  id: this.id,
                  type: this.type,
                  tags: this.tags,
                  metadata: this.metadata,
                  content: this.content,
                  x: this.x,
                  y: this.y,
                  width: this.width,
                  height: this.height,
                  style: this.style
                };
                saveMockData(mockData);
                return this;
              },
              enumerable: false,
              writable: true
            },
            remove: {
              value: async function() {
                delete mockData[this.id];
                saveMockData(mockData);
                return;
              },
              enumerable: false,
              writable: true
            }
          });
          return obj;
        });
      },
      createShape: async (config: any) => {
        const shapeId = 'mock-shape-' + Date.now();
        const shape = {
          ...config,
          type: 'shape',
          id: shapeId,
          tags: config.tags || [],
          metadata: {},
        };
        
        // Add methods as non-enumerable properties to avoid serialization issues
        Object.defineProperties(shape, {
          setMetadata: {
            value: async function(key: string, value: any) {
              this.metadata[key] = value;
              mockData[shapeId] = { ...this };
              saveMockData(mockData);
            },
            enumerable: false,
            writable: true
          },
          getMetadata: {
            value: async function(key: string) {
              return this.metadata[key];
            },
            enumerable: false,
            writable: true
          },
          sync: {
            value: async function() {
              mockData[shapeId] = { 
                ...this,
                // Store serializable data only
                id: this.id,
                type: this.type,
                tags: this.tags,
                metadata: this.metadata,
                x: this.x,
                y: this.y,
                width: this.width,
                height: this.height,
                style: this.style
              };
              saveMockData(mockData);
              return this;
            },
            enumerable: false,
            writable: true
          },
          remove: {
            value: async function() {
              delete mockData[shapeId];
              saveMockData(mockData);
              return;
            },
            enumerable: false,
            writable: true
          }
        });
        
        mockData[shapeId] = {
          id: shape.id,
          type: shape.type,
          tags: shape.tags,
          metadata: shape.metadata,
          x: config.x,
          y: config.y,
          width: config.width,
          height: config.height,
          style: config.style
        };
        saveMockData(mockData);
        return shape;
      },
      createStickyNote: async (config: any) => {
        const stickyId = 'mock-sticky-' + Date.now();
        const sticky = {
          ...config,
          type: 'sticky_note',
          id: stickyId,
          tags: config.tags || [],
          metadata: {},
        };
        
        Object.defineProperties(sticky, {
          setMetadata: {
            value: async function(key: string, value: any) {
              this.metadata[key] = value;
              mockData[stickyId] = { ...this };
              saveMockData(mockData);
            },
            enumerable: false,
            writable: true
          },
          getMetadata: {
            value: async function(key: string) {
              return this.metadata[key];
            },
            enumerable: false,
            writable: true
          },
          sync: {
            value: async function() {
              mockData[stickyId] = {
                id: this.id,
                type: this.type,
                tags: this.tags,
                metadata: this.metadata,
                content: this.content,
                x: this.x,
                y: this.y,
                width: this.width
              };
              saveMockData(mockData);
              return this;
            },
            enumerable: false,
            writable: true
          },
          remove: {
            value: async function() {
              delete mockData[stickyId];
              saveMockData(mockData);
              return;
            },
            enumerable: false,
            writable: true
          }
        });
        
        mockData[stickyId] = {
          id: stickyId,
          type: 'sticky_note',
          tags: sticky.tags,
          metadata: sticky.metadata,
          content: config.content,
          x: config.x,
          y: config.y,
          width: config.width
        };
        saveMockData(mockData);
        return sticky;
      },
      createFrame: async (config: any) => {
        const frameId = 'mock-frame-' + Date.now();
        const frame = {
          ...config,
          type: 'frame',
          id: frameId,
        };
        
        Object.defineProperties(frame, {
          setMetadata: {
            value: async function(key: string, value: any) {
              this.metadata = this.metadata || {};
              this.metadata[key] = value;
              mockData[frameId] = { ...this };
              saveMockData(mockData);
            },
            enumerable: false,
            writable: true
          },
          getMetadata: {
            value: async function(key: string) {
              return this.metadata?.[key];
            },
            enumerable: false,
            writable: true
          },
          sync: {
            value: async function() {
              mockData[frameId] = { ...this };
              saveMockData(mockData);
              return this;
            },
            enumerable: false,
            writable: true
          }
        });
        
        mockData[frameId] = { ...config, id: frameId, type: 'frame' };
        saveMockData(mockData);
        return frame;
      },
      createText: async (config: any) => {
        const textId = 'mock-text-' + Date.now();
        const text = {
          ...config,
          type: 'text',
          id: textId,
        };
        
        Object.defineProperties(text, {
          setMetadata: {
            value: async function(key: string, value: any) {
              this.metadata = this.metadata || {};
              this.metadata[key] = value;
              mockData[textId] = { ...this };
              saveMockData(mockData);
            },
            enumerable: false,
            writable: true
          },
          getMetadata: {
            value: async function(key: string) {
              return this.metadata?.[key];
            },
            enumerable: false,
            writable: true
          },
          sync: {
            value: async function() {
              mockData[textId] = { ...this };
              saveMockData(mockData);
              return this;
            },
            enumerable: false,
            writable: true
          }
        });
        
        mockData[textId] = { ...config, id: textId, type: 'text' };
        saveMockData(mockData);
        return text;
      },
      remove: async (item: any) => {
        if (item && item.id) {
          delete mockData[item.id];
          saveMockData(mockData);
        }
      },
      ui: {
        on: async () => {},
        openPanel: async () => {},
      },
      viewport: {
        zoomTo: async (target: any) => {
          console.log('Mock: Viewport zoom to', target.id || target);
          // In mock mode, we just log the action
          return Promise.resolve();
        },
        get: async () => {
          return {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080
          };
        },
        set: async (viewport: any) => {
          console.log('Mock: Viewport set to', viewport);
          return Promise.resolve();
        }
      },
    },
  };
};

// Use mock in development, real SDK in Miro environment
export const getMiro = async () => {
  if (!miroInstance) {
    await initializeMiro();
  }
  // Return a wrapper object to avoid "thenable" check on the Proxy object
  // which causes SdkMethodExecutionError in Miro environment when returned from async function
  return { instance: miroInstance };
};

// Legacy export for backward compatibility (will use mock if not initialized)
export const miro = new Proxy({} as any, {
  get: (_target, prop) => {
    if (!miroInstance) {
      console.warn('⚠️ Miro not initialized yet. Call getMiro() first or use mock.');
      const mock = createMockMiro();
      return (mock as any)[prop];
    }
    return miroInstance[prop];
  }
});
