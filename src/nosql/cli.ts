import { db, closeDb } from '../db/client.js';
import { getMongoDatabase, closeMongo } from '../mongo/client.js';
import { getRedisClient, closeRedis } from '../redis/client.js';
import { MongoCourseRepository } from '../repositories/mongo-course-repository.js';
import { RedisCacheRepository } from '../repositories/redis-cache-repository.js';
import { CourseDocumentService } from '../services/course-document-service.js';
import { CourseStatisticsCacheService } from '../services/course-statistics-cache-service.js';
import { StudentProgressCacheService } from '../services/student-progress-cache-service.js';
import { runNoSqlBenchmark } from './benchmark.js';

function parseId(value: string | undefined, name: string): number {
  const parsed = Number(value);
  if (!value || !Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Передайте коректний ${name} як ціле додатне число`);
  }
  return parsed;
}

async function runSync(): Promise<void> {
  const mongoDatabase = await getMongoDatabase();
  const repository = new MongoCourseRepository(mongoDatabase);
  const service = new CourseDocumentService(db, repository);
  const count = await service.syncAll();
  console.log(`MongoDB синхронізовано: ${count} активних курсів у колекції courses.`);
  console.log('Модулі, уроки та завдання збережені як вкладені масиви документу курсу.');
}

async function runDemo(studentId: number, courseId: number): Promise<void> {
  const redisClient = await getRedisClient();
  const cache = new RedisCacheRepository(redisClient);
  const statisticsService = new CourseStatisticsCacheService(db, cache);
  const progressService = new StudentProgressCacheService(db, cache);

  const statistics = await statisticsService.get(courseId);
  const progress = await progressService.get(studentId, courseId);

  if (!statistics) throw new Error(`Статистику курсу ID=${courseId} не знайдено`);
  if (!progress) throw new Error(`Активне зарахування студента ID=${studentId} на курс ID=${courseId} не знайдено`);

  console.log('\nСтатистика курсу (перший виклик заповнює кеш):');
  console.log(JSON.stringify(statistics, null, 2));

  console.log('\nПрогрес студента (перший виклик заповнює кеш):');
  console.log(JSON.stringify(progress, null, 2));

  console.log('\nПовторний виклик читає вже підготовлені значення з Redis:');
  await statisticsService.get(courseId);
  await progressService.get(studentId, courseId);
  console.log('Дані повторно отримано.');
}

async function main(): Promise<void> {
  const [command, firstId, secondId] = process.argv.slice(2);

  switch (command) {
    case 'sync':
      await runSync();
      break;
    case 'demo':
      await runDemo(parseId(firstId, 'studentId'), parseId(secondId, 'courseId'));
      break;
    case 'benchmark': {
      const studentId = parseId(firstId, 'studentId');
      const courseId = parseId(secondId, 'courseId');
      const mongoDatabase = await getMongoDatabase();
      const redisClient = await getRedisClient();
      await runNoSqlBenchmark(db, mongoDatabase, redisClient, courseId, studentId);
      break;
    }
    default:
      throw new Error(
        'Команда не вказана. Використання: nosql:sync | nosql:demo <studentId> <courseId> | nosql:benchmark <studentId> <courseId>',
      );
  }
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Помилка NoSQL-модуля:', message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([closeDb(), closeMongo(), closeRedis()]);
  });
