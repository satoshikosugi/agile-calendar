import { Settings } from '../models/types';
import { miro } from '../miro';

const SETTINGS_TAG = 'agile-calendar-settings';
const SETTINGS_KEY = 'settings';

// Default settings
const getDefaultSettings = (): Settings => ({
  baseMonth: new Date().toISOString().substring(0, 7), // YYYY-MM
  viewSpanMonths: 3,
  devs: [],
  tracks: [],
  externalTeams: [],
  personalSchedules: {},
  dailyTrackAssignments: {},
});

// Find or create the settings shape (invisible shape to store settings)
async function getSettingsShape() {
  const shapes = await miro.board.get({ type: 'shape', tags: [SETTINGS_TAG] });
  
  if (shapes.length > 0) {
    return shapes[0];
  }
  
  // Create a new invisible shape to store settings
  const shape = await miro.board.createShape({
    shape: 'rectangle',
    x: -10000, // Position it far off-screen
    y: -10000,
    width: 10,
    height: 10,
    style: {
      fillOpacity: 0,
      borderOpacity: 0,
    },
  });
  
  await shape.setMetadata(SETTINGS_KEY, getDefaultSettings());
  await shape.sync();
  
  // Tag it for easy finding
  const currentTags = shape.tags || [];
  shape.tags = [...currentTags, SETTINGS_TAG];
  await shape.sync();
  
  return shape;
}

// Load settings from Miro board
export async function loadSettings(): Promise<Settings> {
  try {
    const shape = await getSettingsShape();
    
    // Handle mock environment where getMetadata might not exist
    const metadata = shape.getMetadata 
      ? await shape.getMetadata(SETTINGS_KEY)
      : shape.metadata?.[SETTINGS_KEY];
    
    if (metadata) {
      return metadata as Settings;
    }
    
    return getDefaultSettings();
  } catch (error) {
    console.error('Error loading settings:', error);
    return getDefaultSettings();
  }
}

// Save settings to Miro board
export async function saveSettings(settings: Settings): Promise<void> {
  try {
    const shape = await getSettingsShape();
    await shape.setMetadata(SETTINGS_KEY, settings);
    await shape.sync();
  } catch (error) {
    console.error('Error saving settings:', error);
    throw error;
  }
}
