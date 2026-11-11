import {
  measure,
  printSpeedup,
  type BenchmarkContext,
} from "../benchmark-shared.js";

export async function runCourseStatisticsTest({
  courseId,
  courseStatistics,
}: BenchmarkContext): Promise<void> {
  console.log("\n2. Статистика курсу: PostgreSQL vs Redis Cache");

  const sqlMs = await measure("PostgreSQL: v_course_statistics", () =>
    courseStatistics.readFromPostgres(courseId),
  );
  const redisMs = await measure("Redis: отримання через кеш-сервіс", () =>
    courseStatistics.get(courseId),
  );

  printSpeedup(sqlMs, redisMs);
}
