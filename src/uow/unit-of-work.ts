import { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { CourseRepository } from '../repositories/course-repository.js';
import { EnrollmentRepository } from '../repositories/enrollment-repository.js';
import { ProgressRepository } from '../repositories/progress-repository.js';
import { SubmissionRepository } from '../repositories/submission-repository.js';

export interface Repositories {
  courses: CourseRepository;
  enrollments: EnrollmentRepository;
  progress: ProgressRepository;
  submissions: SubmissionRepository;
}

export class UnitOfWork {
  constructor(private readonly db: Kysely<Database>) {}

  execute<T>(work: (repositories: Repositories) => Promise<T>): Promise<T> {
    return this.db.transaction().execute(async (trx) => {
      const repositories: Repositories = {
        courses: new CourseRepository(trx),
        enrollments: new EnrollmentRepository(trx),
        progress: new ProgressRepository(trx),
        submissions: new SubmissionRepository(trx),
      };
      return work(repositories);
    });
  }
}
