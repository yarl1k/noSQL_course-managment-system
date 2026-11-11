import { sql, type Kysely } from "kysely";
import type { Database } from "../db/types.js";
import { MongoCourseRepository } from "../repositories/mongo-course-repository.js";
import type {
  CourseDocument,
  CourseModuleDocument,
  CourseTagDocument,
} from "../nosql/types.js";

interface CourseDocumentRow {
  courseId: number;
  title: string;
  description: string | null;
  price: string;
  tags: CourseTagDocument[];
  categoryId: number;
  categoryName: string;
  instructorId: number;
  instructorName: string;
  createdAt: Date;
  updatedAt: Date;
  modules: CourseModuleDocument[];
}

export class CourseDocumentService {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly mongoCourses: MongoCourseRepository,
  ) {}

  async readFromPostgres(courseId?: number): Promise<CourseDocument[]> {
    const result = await sql<CourseDocumentRow>`
      SELECT
        c.id AS "courseId",
        c.title,
        c.description,
        c.price::TEXT AS price,

        cat.id AS "categoryId",
        cat.name AS "categoryName",

        instructor.id AS "instructorId",
        instructor.name AS "instructorName",

        c.created_at AS "createdAt",
        c.updated_at AS "updatedAt",

        COALESCE((
          SELECT json_agg(
            json_build_object(
              'tagId', t.id,
              'name', t.name
            ) ORDER BY t.name, t.id
          )
          FROM course_tags ct
          JOIN tags t ON t.id = ct.tag_id
          WHERE ct.course_id = c.id
            AND NOT t.is_deleted
        ), '[]'::JSON) AS tags,

        COALESCE((
          SELECT json_agg(
            json_build_object(
              'moduleId', m.id,
              'title', m.title,
              'sortOrder', m.sort_order,
              'lessons', COALESCE((
                SELECT json_agg(
                  json_build_object(
                    'lessonId', l.id,
                    'title', l.title,
                    'contentUrl', l.content_url,
                    'durationMins', l.duration_mins,
                    'sortOrder', l.sort_order,
                    'assignments', COALESCE((
                      SELECT json_agg(
                        json_build_object(
                          'assignmentId', a.id,
                          'title', a.title,
                          'maxScore', a.max_score,
                          'dueDate', a.due_date
                        ) ORDER BY a.id
                      )
                      FROM assignments a
                      WHERE a.lesson_id = l.id
                        AND NOT a.is_deleted
                    ), '[]'::JSON)
                  ) ORDER BY l.sort_order, l.id
                )
                FROM lessons l
                WHERE l.module_id = m.id
                  AND NOT l.is_deleted
              ), '[]'::JSON)
            ) ORDER BY m.sort_order, m.id
          )
          FROM modules m
          WHERE m.course_id = c.id
            AND NOT m.is_deleted
        ), '[]'::JSON) AS modules

      FROM courses c
      JOIN categories cat
        ON cat.id = c.category_id
      JOIN users instructor
        ON instructor.id = c.instructor_id

      WHERE NOT c.is_deleted
        AND NOT cat.is_deleted
        AND NOT instructor.is_deleted
        AND (${courseId ?? null}::INTEGER IS NULL OR c.id = ${courseId ?? null})

      ORDER BY c.id
    `.execute(this.db);

    return result.rows.map((row) => ({
      courseId: row.courseId,
      title: row.title,
      description: row.description,
      price: row.price,

      category: {
        id: row.categoryId,
        name: row.categoryName,
      },

      instructor: {
        id: row.instructorId,
        name: row.instructorName,
      },

      tags: row.tags ?? [],

      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      modules: row.modules ?? [],
      syncedAt: new Date(),
    }));
  }

  async syncAll(): Promise<number> {
    const courses = await this.readFromPostgres();
    await this.mongoCourses.replaceAll(courses);
    return courses.length;
  }

  async getFromPostgres(courseId: number): Promise<CourseDocument | null> {
    const courses = await this.readFromPostgres(courseId);
    return courses[0] ?? null;
  }

  getFromMongo(
    courseId: number,
  ): ReturnType<MongoCourseRepository["findById"]> {
    return this.mongoCourses.findById(courseId);
  }
}
