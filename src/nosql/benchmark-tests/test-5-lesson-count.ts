import { sql } from "kysely";
import {
  measure,
  printSpeedup,
  type BenchmarkContext,
} from "../benchmark-shared.js";

export async function runLessonCountTest({
  db,
  courseId,
  mongoCollection,
}: BenchmarkContext): Promise<void> {
  console.log("\n5. Кількість уроків курсу: PostgreSQL vs MongoDB");

  const sqlMs = await measure("PostgreSQL: COUNT уроків через JOIN", () =>
    sql`
      SELECT COUNT(*) AS total
      FROM courses c
      JOIN modules m ON m.course_id = c.id
      JOIN lessons l ON l.module_id = m.id
      WHERE c.id = ${courseId}
        AND NOT c.is_deleted
        AND NOT m.is_deleted
        AND NOT l.is_deleted
    `.execute(db),
  );
  const mongoMs = await measure(
    "MongoDB: aggregation вкладених уроків",
    () =>
      mongoCollection
        .aggregate([
          { $match: { courseId } },
          { $unwind: "$modules" },
          { $unwind: "$modules.lessons" },
          { $count: "total" },
        ])
        .toArray(),
  );

  printSpeedup(sqlMs, mongoMs);
}
