import { sql, type Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { ProgressRepository } from '../repositories/progress-repository.js';
import { RedisCacheRepository } from '../repositories/redis-cache-repository.js';
import type { StudentProgressCacheEntry } from '../nosql/types.js';

const CACHE_TTL_SECONDS = 30;

interface EnrollmentProgressRow {
  enrollment_id: number;
  student_id: number;
  student_name: string;
  course_id: number;
  course_title: string;
  status: 'active' | 'completed' | 'dropped';
  enrolled_at: Date | string;
  progress_percent: string | number;
}

interface LessonProgressRow {
  lesson_id: number;
  lesson_title: string;
  is_completed: boolean;
  completed_at: Date | string | null;
  updated_at: Date | string;
}

interface EnrollmentOwnerRow {
  student_id: number;
  course_id: number;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export class StudentProgressCacheService {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly cache: RedisCacheRepository,
  ) {}

  private key(studentId: number, courseId: number): string {
    return `lms:student:${studentId}:course:${courseId}:progress`;
  }

  async readFromPostgres(
    studentId: number,
    courseId: number,
  ): Promise<StudentProgressCacheEntry | null> {
    const enrollmentResult = await sql<EnrollmentProgressRow>`
      SELECT
        enrollment_id,
        student_id,
        student_name,
        course_id,
        course_title,
        status,
        enrolled_at,
        progress_percent
      FROM v_student_enrollments
      WHERE student_id = ${studentId}
        AND course_id = ${courseId}
        AND status IN ('active', 'completed')
      ORDER BY enrolled_at DESC
      LIMIT 1
    `.execute(this.db);

    const enrollment = enrollmentResult.rows[0];
    if (!enrollment) return null;

    const lessonResult = await sql<LessonProgressRow>`
      SELECT lesson_id, lesson_title, is_completed, completed_at, updated_at
      FROM v_lesson_progress_details
      WHERE enrollment_id = ${enrollment.enrollment_id}
      ORDER BY lesson_id
    `.execute(this.db);

    return {
      enrollmentId: Number(enrollment.enrollment_id),
      studentId: Number(enrollment.student_id),
      studentName: enrollment.student_name,
      courseId: Number(enrollment.course_id),
      courseTitle: enrollment.course_title,
      status: enrollment.status,
      enrolledAt: toIsoString(enrollment.enrolled_at),
      progressPercent: Number(enrollment.progress_percent),
      trackedLessons: lessonResult.rows.map((lesson) => ({
        lessonId: Number(lesson.lesson_id),
        lessonTitle: lesson.lesson_title,
        isCompleted: lesson.is_completed,
        completedAt: lesson.completed_at === null ? null : toIsoString(lesson.completed_at),
        updatedAt: toIsoString(lesson.updated_at),
      })),
    };
  }

  async get(studentId: number, courseId: number): Promise<StudentProgressCacheEntry | null> {
    const key = this.key(studentId, courseId);
    const cached = await this.cache.get<StudentProgressCacheEntry>(key);
    if (cached) return cached;

    const progress = await this.readFromPostgres(studentId, courseId);
    if (progress) await this.cache.set(key, progress, CACHE_TTL_SECONDS);
    return progress;
  }

  async invalidate(studentId: number, courseId: number): Promise<void> {
    await this.cache.delete(this.key(studentId, courseId));
  }

  async markLessonCompleted(
    enrollmentId: number,
    lessonId: number,
    actorId: number,
  ): Promise<void> {
    const enrollmentResult = await sql<EnrollmentOwnerRow>`
      SELECT student_id, course_id
      FROM enrollments
      WHERE id = ${enrollmentId} AND NOT is_deleted
    `.execute(this.db);

    const enrollment = enrollmentResult.rows[0];
    if (!enrollment) throw new Error(`Активне зарахування ID=${enrollmentId} не знайдено`);

    await new ProgressRepository(this.db).markLessonCompleted(enrollmentId, lessonId, actorId);
    await this.invalidate(Number(enrollment.student_id), Number(enrollment.course_id));
  }
}
