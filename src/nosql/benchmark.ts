import type { Db } from "mongodb";
import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";
import type { RedisClient } from "../redis/client.js";
import { MongoCourseRepository } from "../repositories/mongo-course-repository.js";
import { RedisCacheRepository } from "../repositories/redis-cache-repository.js";
import { CourseDocumentService } from "../services/course-document-service.js";
import { CourseStatisticsCacheService } from "../services/course-statistics-cache-service.js";
import { StudentProgressCacheService } from "../services/student-progress-cache-service.js";
import type { CourseDocument } from "./types.js";
import {
  ITERATIONS,
  WARMUP_ITERATIONS,
  type BenchmarkContext,
} from "./benchmark-shared.js";
import { runCourseDocumentTest } from "./benchmark-tests/test-1-course-document.js";
import { runCourseStatisticsTest } from "./benchmark-tests/test-2-course-statistics.js";
import { runStudentProgressTest } from "./benchmark-tests/test-3-student-progress.js";
import { runCategoryCountTest } from "./benchmark-tests/test-4-category-count.js";
import { runLessonCountTest } from "./benchmark-tests/test-5-lesson-count.js";
import { runCourseInsertTest } from "./benchmark-tests/test-6-course-insert.js";
import { runLessonBatchTest } from "./benchmark-tests/test-7-lesson-batch.js";

export async function runNoSqlBenchmark(
  db: Kysely<Database>,
  mongoDatabase: Db,
  redisClient: RedisClient,
  courseId: number,
  studentId: number,
): Promise<void> {
  const mongoCourses = new MongoCourseRepository(mongoDatabase);
  const mongoCollection = mongoDatabase.collection<CourseDocument>("courses");
  const redisCache = new RedisCacheRepository(redisClient);
  const courseDocuments = new CourseDocumentService(db, mongoCourses);
  const courseStatistics = new CourseStatisticsCacheService(db, redisCache);
  const studentProgress = new StudentProgressCacheService(db, redisCache);

  console.log("\nОновлення документів MongoDB з PostgreSQL...");
  await courseDocuments.syncAll();

  const courseDocument = await courseDocuments.getFromPostgres(courseId);
  if (!courseDocument) {
    throw new Error(`Активний курс ID=${courseId} не знайдено в PostgreSQL`);
  }

  const mongoDocument = await courseDocuments.getFromMongo(courseId);
  if (!mongoDocument) {
    throw new Error(`Документ курсу ID=${courseId} не знайдено в MongoDB`);
  }

  const statistics = await courseStatistics.readFromPostgres(courseId);
  if (!statistics) {
    throw new Error(`Статистику курсу ID=${courseId} не знайдено`);
  }

  const progress = await studentProgress.readFromPostgres(studentId, courseId);
  if (!progress) {
    throw new Error(
      `Активне зарахування студента ID=${studentId} на курс ID=${courseId} не знайдено`,
    );
  }

  await redisCache.set(`lms:course:${courseId}:statistics`, statistics, 60);
  await redisCache.set(
    `lms:student:${studentId}:course:${courseId}:progress`,
    progress,
    30,
  );

  console.log(
    `\nПорівняння: ${ITERATIONS} вимірювань після ${WARMUP_ITERATIONS} тестових викликів`,
  );

  const context: BenchmarkContext = {
    db,
    mongoCollection,
    courseId,
    studentId,
    courseDocument,
    courseDocuments,
    courseStatistics,
    studentProgress,
  };

  await runCourseDocumentTest(context);
  await runCourseStatisticsTest(context);
  await runStudentProgressTest(context);
  await runCategoryCountTest(context);
  await runLessonCountTest(context);
  await runCourseInsertTest(context);
  await runLessonBatchTest(context);
}
