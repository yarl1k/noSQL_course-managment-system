import { sql } from "kysely";
import {
  measure,
  printSpeedup,
  type BenchmarkContext,
} from "../benchmark-shared.js";

export async function runCategoryCountTest({
  db,
  courseDocument,
  mongoCollection,
}: BenchmarkContext): Promise<void> {
  console.log("\n4. Кількість курсів у категорії: PostgreSQL vs MongoDB");

  const categoryId = courseDocument.category.id;
  const sqlMs = await measure("PostgreSQL: COUNT курсів категорії", () =>
    sql`
      SELECT COUNT(*) AS total
      FROM courses c
      JOIN categories cat ON cat.id = c.category_id
      WHERE c.category_id = ${categoryId}
        AND NOT c.is_deleted
        AND NOT cat.is_deleted
    `.execute(db),
  );
  const mongoMs = await measure("MongoDB: countDocuments категорії", () =>
    mongoCollection.countDocuments({
      "category.id": categoryId,
    }),
  );

  printSpeedup(sqlMs, mongoMs);
}
