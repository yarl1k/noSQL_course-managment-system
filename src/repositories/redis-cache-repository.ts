import type { RedisClient } from '../redis/client.js';

export class RedisCacheRepository {
  constructor(private readonly client: RedisClient) {}

  async get<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    return value === null ? null : (JSON.parse(value) as T);
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error('Значення кешу не вдалося серіалізувати в JSON');
    await this.client.set(key, serialized, { EX: ttlSeconds });
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }
}
