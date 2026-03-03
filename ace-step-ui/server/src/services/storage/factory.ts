import type { StorageProvider } from './index.js';
import { LocalStorageProvider } from './local.js';

let storageInstance: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (storageInstance) {
    return storageInstance;
  }

  // Always use local storage for ACE-Step UI
  console.log('Initializing local storage provider');
  storageInstance = new LocalStorageProvider();

  return storageInstance;
}

export function resetStorageProvider(): void {
  storageInstance = null;
}
