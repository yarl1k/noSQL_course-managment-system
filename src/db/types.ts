export interface ActiveCourseView {
  course_id: number;
  title: string;
  description: string | null;
  price: string;
  category_id: number;
  category_name: string;
  instructor_id: number;
  instructor_name: string;
  created_at: Date;
  updated_at: Date;
}

export interface StudentEnrollmentView {
  enrollment_id: number;
  student_id: number;
  student_name: string;
  course_id: number;
  course_title: string;
  status: 'active' | 'completed' | 'dropped';
  enrolled_at: Date;
  progress_percent: string;
}

export interface CourseStatisticsView {
  course_id: number;
  title: string;
  total_students: string;
  average_rating: string | null;
}

export interface LessonProgressView {
  progress_id: number;
  enrollment_id: number;
  student_id: number;
  student_name: string;
  course_id: number;
  course_title: string;
  lesson_id: number;
  lesson_title: string;
  is_completed: boolean;
  completed_at: Date | null;
  updated_at: Date;
}

export interface AssignmentSubmissionView {
  submission_id: number;
  student_id: number;
  student_name: string;
  assignment_id: number;
  assignment_title: string;
  max_score: number;
  score: number | null;
  status: 'submitted' | 'graded' | 'rejected';
  submitted_at: Date;
  lesson_title: string;
  course_id: number;
  course_title: string;
}

// Коду застосунку дозволено читати через VIEW і змінювати через процедури.
export interface Database {
  v_active_courses: ActiveCourseView;
  v_student_enrollments: StudentEnrollmentView;
  v_course_statistics: CourseStatisticsView;
  v_lesson_progress_details: LessonProgressView;
  v_assignment_submissions: AssignmentSubmissionView;
}
