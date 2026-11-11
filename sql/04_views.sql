-- 1. Каталог активних курсів.
CREATE OR REPLACE VIEW v_active_courses AS
SELECT
    c.id AS course_id,
    c.title,
    c.description,
    c.price,
    c.category_id,
    cat.name AS category_name,
    c.instructor_id,
    instructor.name AS instructor_name,
    c.created_at,
    c.updated_at
FROM courses c
JOIN categories cat ON cat.id = c.category_id
JOIN users instructor ON instructor.id = c.instructor_id
WHERE NOT c.is_deleted
  AND NOT cat.is_deleted
  AND NOT instructor.is_deleted;

-- 2. Зарахування активних студентів із розрахованим прогресом.
CREATE OR REPLACE VIEW v_student_enrollments AS
SELECT
    e.id AS enrollment_id,
    e.student_id,
    student.name AS student_name,
    e.course_id,
    c.title AS course_title,
    e.status,
    e.enrolled_at,
    fn_course_progress_percent(e.id) AS progress_percent
FROM enrollments e
JOIN users student ON student.id = e.student_id
JOIN courses c ON c.id = e.course_id
WHERE NOT e.is_deleted
  AND NOT student.is_deleted
  AND NOT c.is_deleted;

-- 3. Кількість студентів і середній рейтинг без множення рядків JOIN-ами.
CREATE OR REPLACE VIEW v_course_statistics AS
SELECT
    c.id AS course_id,
    c.title,
    (
        SELECT COUNT(*)
        FROM enrollments e
        WHERE e.course_id = c.id
          AND NOT e.is_deleted
          AND e.status IN ('active', 'completed')
    ) AS total_students,
    (
        SELECT ROUND(AVG(r.rating)::NUMERIC, 2)
        FROM reviews r
        WHERE r.course_id = c.id AND NOT r.is_deleted
    ) AS average_rating
FROM courses c
WHERE NOT c.is_deleted;

-- 4. Деталі проходження уроків.
CREATE OR REPLACE VIEW v_lesson_progress_details AS
SELECT
    lp.id AS progress_id,
    e.id AS enrollment_id,
    e.student_id,
    student.name AS student_name,
    c.id AS course_id,
    c.title AS course_title,
    l.id AS lesson_id,
    l.title AS lesson_title,
    lp.is_completed,
    lp.completed_at,
    lp.updated_at
FROM lesson_progress lp
JOIN enrollments e ON e.id = lp.enrollment_id
JOIN users student ON student.id = e.student_id
JOIN lessons l ON l.id = lp.lesson_id
JOIN modules m ON m.id = l.module_id
JOIN courses c ON c.id = m.course_id AND c.id = e.course_id
WHERE NOT e.is_deleted
  AND NOT student.is_deleted
  AND NOT c.is_deleted
  AND NOT m.is_deleted
  AND NOT l.is_deleted;

-- 5. Роботи студентів із контекстом завдання, уроку та курсу.
CREATE OR REPLACE VIEW v_assignment_submissions AS
SELECT
    s.id AS submission_id,
    s.student_id,
    student.name AS student_name,
    a.id AS assignment_id,
    a.title AS assignment_title,
    a.max_score,
    s.score,
    s.status,
    s.submitted_at,
    l.title AS lesson_title,
    c.id AS course_id,
    c.title AS course_title
FROM submissions s
JOIN users student ON student.id = s.student_id
JOIN assignments a ON a.id = s.assignment_id
JOIN lessons l ON l.id = a.lesson_id
JOIN modules m ON m.id = l.module_id
JOIN courses c ON c.id = m.course_id
WHERE NOT student.is_deleted
  AND NOT a.is_deleted
  AND NOT l.is_deleted
  AND NOT m.is_deleted
  AND NOT c.is_deleted;
