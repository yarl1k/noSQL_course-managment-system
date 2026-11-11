import { sql } from "kysely";
import type { CourseDocument } from "../types.js";
import {
  ITERATIONS,
  WARMUP_ITERATIONS,
  logCleanupErrors,
  measure,
  printSpeedup,
  type BenchmarkContext,
} from "../benchmark-shared.js";

export async function runCourseInsertTest({
  db,
  courseDocument,
  mongoCollection,
}: BenchmarkContext): Promise<void> {
  console.log("\n6. Запис курсу: PostgreSQL vs MongoDB");

  const testRunId = `${Date.now()}-${process.pid}`;
  const testTitlePrefix = `Benchmark-${testRunId}-`;
  const testCount = ITERATIONS + WARMUP_ITERATIONS;
  const testTitles = Array.from(
    { length: testCount },
    (_, index) => `${testTitlePrefix}${index}`,
  );
  let pgInsertIndex = 0;
  let mongoInsertIndex = 0;

  try {
    const pgMs = await measure("PostgreSQL: INSERT INTO courses", async () => {
      const title = testTitles[pgInsertIndex];

      await sql`
        INSERT INTO courses (
          title,
          description,
          category_id,
          instructor_id,
          price
        )
        VALUES (
          ${title},
          ${"Тестовий курс для benchmark"},
          ${courseDocument.category.id},
          ${courseDocument.instructor.id},
          ${courseDocument.price}
        )
      `.execute(db);

      pgInsertIndex += 1;
    });
    const mongoMs = await measure(
      "MongoDB: insertOne course document",
      async () => {
        const index = mongoInsertIndex;
        const title = testTitles[mongoInsertIndex];

        if (!title) {
          throw new Error("Вичерпано назви тестових курсів");
        }

        const testDocument: CourseDocument = {
          ...courseDocument,
          courseId: -(Date.now() + index),
          title,
          modules: [],
          tags: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          syncedAt: new Date(),
        };

        await mongoCollection.insertOne(testDocument);
        mongoInsertIndex += 1;
      },
    );

    printSpeedup(pgMs, mongoMs);
  } finally {
    console.log("\nОчищення тимчасових тестових записів...");
    const cleanupResults = await Promise.allSettled([
      sql`
        UPDATE courses
        SET
          is_deleted = TRUE,
          updated_at = CURRENT_TIMESTAMP
        WHERE title LIKE ${`${testTitlePrefix}%`}
      `.execute(db),
      mongoCollection.deleteMany({ title: { $in: testTitles } }),
    ]);

    logCleanupErrors(cleanupResults);
    console.log("Тимчасові записи успішно очищено з PostgreSQL та MongoDB.");
  }
}
