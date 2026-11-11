import { performance } from "node:perf_hooks";
import type { Collection } from "mongodb";
import { sql, type Kysely } from "kysely";
import type { Database } from "../db/types.js";
import type { CourseDocument } from "./types.js";
import type { CourseDocumentService } from "../services/course-document-service.js";
import type { CourseStatisticsCacheService } from "../services/course-statistics-cache-service.js";
import type { StudentProgressCacheService } from "../services/student-progress-cache-service.js";

export const ITERATIONS = 50;
export const WARMUP_ITERATIONS = 5;

export type BenchmarkContext = {
  db: Kysely<Database>;
  mongoCollection: Collection<CourseDocument>;
  courseId: number;
  studentId: number;
  courseDocument: CourseDocument;
  courseDocuments: CourseDocumentService;
  courseStatistics: CourseStatisticsCacheService;
  studentProgress: StudentProgressCacheService;
};

export async function measure(
  label: string,
  action: () => Promise<unknown>,
): Promise<number> {
  for (let i = 0; i < WARMUP_ITERATIONS; i += 1) {
    await action();
  }

  const startedAt = performance.now();

  for (let i = 0; i < ITERATIONS; i += 1) {
    await action();
  }

  const averageMs = (performance.now() - startedAt) / ITERATIONS;

  console.log(`${label.padEnd(39)} ${averageMs.toFixed(4)} ms/op`);
  return averageMs;
}

export function printSpeedup(sqlMs: number, alternativeMs: number): void {
  if (alternativeMs <= 0) return;

  const ratio = sqlMs / alternativeMs;

  console.log(`  Відношення SQL / NoSQL: ${ratio.toFixed(2)}x`);

  if (ratio < 1) {
    console.log(`  Швидше: PostgreSQL (${(1 / ratio).toFixed(2)}x)`);
  } else if (ratio > 1) {
    console.log(`  Швидше: NoSQL (${ratio.toFixed(2)}x)`);
  } else {
    console.log("  Швидкість однакова");
  }
}

export async function insertBenchmarkLessons(
  db: Kysely<Database>,
  moduleId: number,
  sourceLesson: {
    contentUrl: string | null;
    durationMins: number;
  },
  titlePrefix: string,
  batchIndex: number,
  batchSize: number,
): Promise<void> {
  const values = Array.from({ length: batchSize }, (_, index) => {
    const sortOrder = batchIndex * batchSize + index;

    return sql`(
      ${moduleId},
      ${`${titlePrefix}${batchIndex}-${index}`},
      ${sourceLesson.contentUrl},
      ${sourceLesson.durationMins},
      ${sortOrder}
    )`;
  });

  await sql`
    INSERT INTO lessons (
      module_id,
      title,
      content_url,
      duration_mins,
      sort_order
    )
    VALUES ${sql.join(values)}
  `.execute(db);
}

export function logCleanupErrors(
  cleanupResults: PromiseSettledResult<unknown>[],
): void {
  const cleanupErrors = cleanupResults.filter(
    (result) => result.status === "rejected",
  );

  if (cleanupErrors.length === 0) return;

  console.error("Помилка під час очищення тестових записів:");

  for (const result of cleanupErrors) {
    if (result.status === "rejected") {
      console.error(result.reason);
    }
  }

  throw new Error("Не вдалося повністю очистити тестові записи benchmark");
}
