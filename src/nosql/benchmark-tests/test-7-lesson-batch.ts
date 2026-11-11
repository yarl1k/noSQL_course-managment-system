import { sql } from "kysely";
import type { UpdateFilter } from "mongodb";
import type { CourseDocument } from "../types.js";
import {
  ITERATIONS,
  insertBenchmarkLessons,
  logCleanupErrors,
  measure,
  printSpeedup,
  type BenchmarkContext,
} from "../benchmark-shared.js";

export async function runLessonBatchTest({
  db,
  courseId,
  courseDocument,
  mongoCollection,
}: BenchmarkContext): Promise<void> {
  console.log("\n7. Пакетний запис уроків: PostgreSQL vs MongoDB");

  const BATCH_SIZE = 20;
  const testRunId = `${Date.now()}-${process.pid}`;
  const testModuleTitle = `Benchmark Module ${testRunId}`;
  const lessonTitlePrefix = `Benchmark lesson ${testRunId}-`;
  const testMongoCourseId = -(Date.now() + process.pid);
  const testModuleId = -(Date.now() + process.pid + 1);
  const sourceModule = courseDocument.modules[0];
  const sourceLesson = sourceModule?.lessons[0];

  if (!sourceModule || !sourceLesson) {
    throw new Error(
      "Для benchmark потрібен курс хоча б з одним модулем та уроком",
    );
  }

  let pgTestModuleId: number | null = null;
  let pgBatchIndex = 0;
  let mongoBatchIndex = 0;

  try {
    const moduleInsert = await sql<{ id: number }>`
      INSERT INTO modules (
        course_id,
        title,
        sort_order
      )
      VALUES (
        ${courseId},
        ${testModuleTitle},
        999999
      )
      RETURNING id
    `.execute(db);

    pgTestModuleId = Number(moduleInsert.rows[0]?.id);

    if (!pgTestModuleId) {
      throw new Error("Не вдалося створити тестовий модуль PostgreSQL");
    }
    const moduleId = pgTestModuleId;

    await mongoCollection.insertOne({
      ...courseDocument,
      courseId: testMongoCourseId,
      title: `Benchmark Course ${testRunId}`,
      modules: [
        {
          ...sourceModule,
          moduleId: testModuleId,
          title: testModuleTitle,
          sortOrder: 999999,
          lessons: [],
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      syncedAt: new Date(),
    });

    console.log(
      `Додавання ${BATCH_SIZE} уроків за одну операцію (${ITERATIONS} вимірювань)...`,
    );

    const pgMs = await measure(
      "PostgreSQL: пакетний INSERT уроків",
      async () => {
        await insertBenchmarkLessons(
          db,
          moduleId,
          sourceLesson,
          lessonTitlePrefix,
          pgBatchIndex,
          BATCH_SIZE,
        );
        pgBatchIndex += 1;
      },
    );
    const mongoMs = await measure("MongoDB: $push + $each уроків", async () => {
      const lessons = Array.from({ length: BATCH_SIZE }, (_, index) => {
        const sortOrder = mongoBatchIndex * BATCH_SIZE + index;

        return {
          ...sourceLesson,
          lessonId: -(Date.now() * 1000 + sortOrder + 1),
          title: `${lessonTitlePrefix}${mongoBatchIndex}-${index}`,
          sortOrder,
        };
      });
      const update = {
        $push: {
          "modules.$[module].lessons": { $each: lessons },
        },
      } as unknown as UpdateFilter<CourseDocument>;

      await mongoCollection.updateOne({ courseId: testMongoCourseId }, update, {
        arrayFilters: [{ "module.moduleId": testModuleId }],
      });
      mongoBatchIndex += 1;
    });

    printSpeedup(pgMs, mongoMs);
  } finally {
    console.log("\nОчищення тимчасових тестових записів...");
    const cleanupResults = await Promise.allSettled([
      (async () => {
        if (pgTestModuleId === null) return;

        await db.transaction().execute(async (trx) => {
          await sql`
            UPDATE lessons
            SET
              is_deleted = TRUE,
              updated_at = CURRENT_TIMESTAMP
            WHERE module_id = ${pgTestModuleId}
              AND title LIKE ${`${lessonTitlePrefix}%`}
          `.execute(trx);
          await sql`
            UPDATE modules
            SET
              is_deleted = TRUE,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ${pgTestModuleId}
          `.execute(trx);
        });
      })(),
      mongoCollection.deleteOne({ courseId: testMongoCourseId }),
    ]);

    logCleanupErrors(cleanupResults);
    console.log("Тимчасові записи успішно очищено з PostgreSQL та MongoDB.");
  }
}
