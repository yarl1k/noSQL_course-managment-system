import {
  measure,
  printSpeedup,
  type BenchmarkContext,
} from "../benchmark-shared.js";

export async function runCourseDocumentTest({
  courseId,
  courseDocuments,
}: BenchmarkContext): Promise<void> {
  console.log(
    "\n1. Документ курсу: PostgreSQL (кілька таблиць) vs MongoDB (один документ)",
  );

  const sqlMs = await measure("PostgreSQL: побудова документа", () =>
    courseDocuments.getFromPostgres(courseId),
  );
  const mongoMs = await measure("MongoDB: читання документа", () =>
    courseDocuments.getFromMongo(courseId),
  );

  printSpeedup(sqlMs, mongoMs);
}
