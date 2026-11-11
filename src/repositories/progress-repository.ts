import { Kysely, sql } from 'kysely';
import type { Database, LessonProgressView } from '../db/types.js';

export class ProgressRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async markLessonCompleted(
    enrollmentId: number,
    lessonId: number,
    actorId: number,
  ): Promise<void> {
    await sql`
      CALL sp_mark_lesson_completed(${enrollmentId}, ${lessonId}, ${actorId})
    `.execute(this.db);
  }

  forEnrollment(enrollmentId: number): Promise<LessonProgressView[]> {
    return this.db
      .selectFrom('v_lesson_progress_details')
      .selectAll()
      .where('enrollment_id', '=', enrollmentId)
      .orderBy('lesson_id')
      .execute();
  }
}
