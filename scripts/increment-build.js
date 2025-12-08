import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const buildInfoPath = path.join(__dirname, '../src/build-info.json');

let buildInfo = { buildNumber: 0 };

if (fs.existsSync(buildInfoPath)) {
  try {
    const data = fs.readFileSync(buildInfoPath, 'utf8');
    buildInfo = JSON.parse(data);
  } catch (e) {
    console.error('Error reading build-info.json', e);
  }
}

buildInfo.buildNumber += 1;
buildInfo.buildDate = new Date().toISOString();

fs.writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2));

console.log(`Build number incremented to ${buildInfo.buildNumber}`);
