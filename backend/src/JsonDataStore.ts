import { DataStore } from 'yt-cast-receiver';
import fs from 'node:fs';
import path from 'node:path';

export class JsonDataStore extends DataStore {
  private filePath: string;
  private data: Record<string, unknown>;

  constructor(filePath: string) {
    super();
    this.filePath = filePath;
    this.data = this.loadFromDisk();
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.data[key] = value;
    this.saveToDisk();
  }

  async get<T>(key: string): Promise<T | null> {
    const value = this.data[key];
    return value !== undefined ? (value as T) : null;
  }

  private loadFromDisk(): Record<string, unknown> {
    try {
      const content = fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  private saveToDisk(): void {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }
}
