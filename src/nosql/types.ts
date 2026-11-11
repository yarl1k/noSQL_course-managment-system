import type { Document } from "mongodb";

export interface CourseTagDocument {
  tagId: number;
  name: string;
}

export interface CourseAssignmentDocument {
  assignmentId: number;
  title: string;
  maxScore: number;
  dueDate: string | null;
}

export interface CourseLessonDocument {
  lessonId: number;
  title: string;
  contentUrl: string | null;
  durationMins: number;
  sortOrder: number;
  assignments: CourseAssignmentDocument[];
}

export interface CourseModuleDocument {
  moduleId: number;
  title: string;
  sortOrder: number;
  lessons: CourseLessonDocument[];
}

export interface CourseDocument extends Document {
  courseId: number;
  title: string;
  description: string | null;
  price: string;
  tags: CourseTagDocument[];
  category: {
    id: number;
    name: string;
  };
  instructor: {
    id: number;
    name: string;
  };
  createdAt: Date;
  updatedAt: Date;
  modules: CourseModuleDocument[];
  syncedAt: Date;
}

export interface CourseStatisticsCacheEntry {
  courseId: number;
  title: string;
  totalStudents: number;
  averageRating: number | null;
}

export interface StudentProgressCacheEntry {
  enrollmentId: number;
  studentId: number;
  studentName: string;
  courseId: number;
  courseTitle: string;
  status: "active" | "completed" | "dropped";
  enrolledAt: string;
  progressPercent: number;
  trackedLessons: Array<{
    lessonId: number;
    lessonTitle: string;
    isCompleted: boolean;
    completedAt: string | null;
    updatedAt: string;
  }>;
}
