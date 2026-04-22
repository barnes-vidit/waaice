import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'data');

export function loadJSON<T>(filename: string, defaultValue: T): T {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) return defaultValue;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return defaultValue;
  }
}

export function saveJSON(filename: string, data: unknown): void {
  const filePath = path.join(DATA_DIR, filename);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}
