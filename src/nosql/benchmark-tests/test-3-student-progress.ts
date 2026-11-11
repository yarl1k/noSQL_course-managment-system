import {
  measure,
  printSpeedup,
  type BenchmarkContext,
} from "../benchmark-shared.js";

export async function runStudentProgressTest({
  courseId,
  studentId,
  studentProgress,
}: BenchmarkContext): Promise<void> {
  console.log("\n3. Прогрес студента: PostgreSQL vs Redis Cache");

  const sqlMs = await measure("PostgreSQL: прогрес + уроки", () =>
    studentProgress.readFromPostgres(studentId, courseId),
  );
  const redisMs = await measure("Redis: отримання через кеш-сервіс", () =>
    studentProgress.get(studentId, courseId),
  );

  printSpeedup(sqlMs, redisMs);
}
