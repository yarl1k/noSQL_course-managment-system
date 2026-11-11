import { createClient } from 'redis';

export type RedisClient = ReturnType<typeof createClient>;

let redisClient: RedisClient | null = null;

export async function getRedisClient(): Promise<RedisClient> {
  const url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

  if (!redisClient) {
    redisClient = createClient({ url });
    redisClient.on('error', (error) => {
      console.error('Помилка Redis:', error.message);
    });
  }

  if (!redisClient.isOpen) {
    await redisClient.connect();
  }

  return redisClient;
}

export async function closeRedis(): Promise<void> {
  if (redisClient?.isOpen) {
    await redisClient.close();
  }
  redisClient = null;
}
