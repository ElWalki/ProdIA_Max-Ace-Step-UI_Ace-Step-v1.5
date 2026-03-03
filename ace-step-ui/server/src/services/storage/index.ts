export interface StorageProvider {
  upload(key: string, data: Buffer, contentType: string): Promise<string>;
  getUrl(key: string, expiresIn?: number): Promise<string>;
  getPublicUrl(key: string): string;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  copy(sourceKey: string, destKey: string): Promise<void>;
}

export type { StorageProvider as default };
