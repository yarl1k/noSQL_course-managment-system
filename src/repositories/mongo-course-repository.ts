import type { Collection, Db, WithId } from 'mongodb';
import type { CourseDocument } from '../nosql/types.js';

export class MongoCourseRepository {
  private readonly collection: Collection<CourseDocument>;

  constructor(database: Db) {
    this.collection = database.collection<CourseDocument>('courses');
  }

  async replaceAll(courses: CourseDocument[]): Promise<void> {
    await this.collection.createIndex({ courseId: 1 }, { unique: true });

    if (courses.length === 0) {
      await this.collection.deleteMany({});
      return;
    }

    await this.collection.bulkWrite(
      courses.map((course) => ({
        replaceOne: {
          filter: { courseId: course.courseId },
          replacement: course,
          upsert: true,
        },
      })),
    );

    const courseIds = courses.map((course) => course.courseId);
    await this.collection.deleteMany({ courseId: { $nin: courseIds } });
  }

  findById(courseId: number): Promise<WithId<CourseDocument> | null> {
    return this.collection.findOne({ courseId });
  }
}
