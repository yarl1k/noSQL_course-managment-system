import { Kysely, sql } from 'kysely';
import type { AssignmentSubmissionView, Database } from '../db/types.js';

export class SubmissionRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async createAssignment(
    lessonId: number,
    title: string,
    maxScore: number,
    dueDate: Date | null,
    actorId: number,
  ): Promise<number> {
    const result = await sql<{ p_assignment_id: number }>`
      CALL sp_create_assignment(
        ${lessonId}::integer,
        ${title}::varchar,
        ${maxScore}::integer,
        ${dueDate}::timestamptz,
        ${actorId}::integer,
        NULL::integer
      )
    `.execute(this.db);
    const id = result.rows[0]?.p_assignment_id;
    if (id == null) throw new Error('sp_create_assignment не повернула ID завдання');
    return Number(id);
  }

  async submit(
    assignmentId: number,
    studentId: number,
    fileUrl: string,
    actorId: number,
  ): Promise<number> {
    const result = await sql<{ p_submission_id: number }>`
      CALL sp_submit_assignment(
        ${assignmentId}, ${studentId}, ${fileUrl}, ${actorId}, NULL::integer
      )
    `.execute(this.db);

    const id = result.rows[0]?.p_submission_id;
    if (id == null) throw new Error('sp_submit_assignment не повернула ID роботи');
    return Number(id);
  }

  async grade(submissionId: number, score: number, actorId: number): Promise<void> {
    await sql`CALL sp_grade_submission(${submissionId}, ${score}, ${actorId})`.execute(this.db);
  }

  forCourse(courseId: number): Promise<AssignmentSubmissionView[]> {
    return this.db
      .selectFrom('v_assignment_submissions')
      .selectAll()
      .where('course_id', '=', courseId)
      .orderBy('submitted_at', 'desc')
      .execute();
  }
}
