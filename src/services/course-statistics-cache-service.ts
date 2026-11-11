import { sql, type Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { EnrollmentRepository } from '../repositories/enrollment-repository.js';
import { RedisCacheRepository } from '../repositories/redis-cache-repository.js';
import type { CourseStatisticsCacheEntry } from '../nosql/types.js';

const CACHE_TTL_SECONDS = 60;

interface CourseStatisticsRow {
  course_id: number;
  title: string;
  total_students: string | number;
  average_rating: string | number | null;
}

export class CourseStatisticsCacheService {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly cache: RedisCacheRepository,
  ) {}

  private key(courseId: number): string {
    return `lms:course:${courseId}:statistics`;
  }

  async readFromPostgres(courseId: number): Promise<CourseStatisticsCacheEntry | null> {
    const result = await sql<CourseStatisticsRow>`
      SELECT course_id, title, total_students, average_rating
      FROM v_course_statistics
      WHERE course_id = ${courseId}
    `.execute(this.db);

    const row = result.rows[0];
    if (!row) return null;

    return {
      courseId: Number(row.course_id),
      title: row.title,
      totalStudents: Number(row.total_students),
      averageRating: row.average_rating === null ? null : Number(row.average_rating),
    };
  }

  async get(courseId: number): Promise<CourseStatisticsCacheEntry | null> {
    const key = this.key(courseId);
    const cached = await this.cache.get<CourseStatisticsCacheEntry>(key);
    if (cached) return cached;

    const statistics = await this.readFromPostgres(courseId);
    if (statistics) await this.cache.set(key, statistics, CACHE_TTL_SECONDS);
    return statistics;
  }

  async invalidate(courseId: number): Promise<void> {
    await this.cache.delete(this.key(courseId));
  }

  async enrollStudent(studentId: number, courseId: number, actorId: number): Promise<number> {
    const enrollmentId = await new EnrollmentRepository(this.db).enroll(studentId, courseId, actorId);
    await this.invalidate(courseId);
    return enrollmentId;
  }
}
