import { Kysely, sql } from 'kysely';
import type { ActiveCourseView, CourseStatisticsView, Database } from '../db/types.js';

export interface CreateCourseInput {
  title: string;
  description: string | null;
  categoryId: number;
  instructorId: number;
  price: number;
  actorId: number;
}

export class CourseRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async listActive(): Promise<ActiveCourseView[]> {
    return this.db.selectFrom('v_active_courses').selectAll().orderBy('title').execute();
  }

  async getStatistics(courseId: number): Promise<CourseStatisticsView | undefined> {
    return this.db
      .selectFrom('v_course_statistics')
      .selectAll()
      .where('course_id', '=', courseId)
      .executeTakeFirst();
  }

  async create(input: CreateCourseInput): Promise<number> {
    const result = await sql<{ p_course_id: number }>`
      CALL sp_create_course(
        ${input.title}, ${input.description}, ${input.categoryId},
        ${input.instructorId}, ${input.price}, ${input.actorId}, NULL::integer
      )
    `.execute(this.db);

    const id = result.rows[0]?.p_course_id;
    if (id == null) throw new Error('sp_create_course не повернула ID курсу');
    return Number(id);
  }

  async softDelete(courseId: number, actorId: number): Promise<void> {
    await sql`CALL sp_soft_delete_course(${courseId}, ${actorId})`.execute(this.db);
  }

  async restore(courseId: number, actorId: number): Promise<void> {
    await sql`CALL sp_restore_course(${courseId}, ${actorId})`.execute(this.db);
  }

  async createModule(courseId: number, title: string, sortOrder: number, actorId: number): Promise<number> {
    const result = await sql<{ p_module_id: number }>`
      CALL sp_create_module(${courseId}, ${title}, ${sortOrder}, ${actorId}, NULL::integer)
    `.execute(this.db);
    const id = result.rows[0]?.p_module_id;
    if (id == null) throw new Error('sp_create_module не повернула ID модуля');
    return Number(id);
  }

  async createLesson(moduleId: number, title: string, durationMins: number, sortOrder: number, actorId: number): Promise<number> {
    const result = await sql<{ p_lesson_id: number }>`
      CALL sp_create_lesson(${moduleId}, ${title}, ${durationMins}, ${sortOrder}, ${actorId}, NULL::integer)
    `.execute(this.db);
    const id = result.rows[0]?.p_lesson_id;
    if (id == null) throw new Error('sp_create_lesson не повернула ID уроку');
    return Number(id);
  }
}
