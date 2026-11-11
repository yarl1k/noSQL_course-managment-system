import { Kysely, sql } from 'kysely';
import type { Database, StudentEnrollmentView } from '../db/types.js';

export class EnrollmentRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async enroll(studentId: number, courseId: number, actorId: number): Promise<number> {
    const result = await sql<{ p_enrollment_id: number }>`
      CALL sp_enroll_student(
        ${studentId}, ${courseId}, ${actorId}, NULL::integer
      )
    `.execute(this.db);

    const id = result.rows[0]?.p_enrollment_id;
    if (id == null) throw new Error('sp_enroll_student не повернула ID зарахування');
    return Number(id);
  }

  forStudent(studentId: number): Promise<StudentEnrollmentView[]> {
    return this.db
      .selectFrom('v_student_enrollments')
      .selectAll()
      .where('student_id', '=', studentId)
      .orderBy('enrolled_at', 'desc')
      .execute();
  }
}
