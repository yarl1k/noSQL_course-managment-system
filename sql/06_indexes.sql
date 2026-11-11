-- B-tree для фільтрів/JOIN, GIN для повнотекстового пошуку.

-- 1. Курси конкретного викладача (B-tree за замовчуванням).
CREATE INDEX idx_courses_instructor
    ON courses USING BTREE (instructor_id);

-- 2. Активні курси в межах категорії (частковий B-tree).
CREATE INDEX idx_courses_active_category
    ON courses USING BTREE (category_id, title)
    WHERE NOT is_deleted;

-- 3. Унікальність активного зарахування студента на курс.
CREATE UNIQUE INDEX ux_enrollments_active_student_course
    ON enrollments (student_id, course_id)
    WHERE NOT is_deleted AND status IN ('active', 'completed');

-- 4. Зарахування студента за статусом і датою.
CREATE INDEX idx_enrollments_student_status_date
    ON enrollments USING BTREE (student_id, status, enrolled_at DESC)
    WHERE NOT is_deleted;

-- 5. Пошук прогресу конкретного уроку.
CREATE INDEX idx_lesson_progress_lesson
    ON lesson_progress USING BTREE (lesson_id, is_completed);

-- 6. Один активний відгук студента на курс.
CREATE UNIQUE INDEX ux_reviews_active_course_student
    ON reviews (course_id, student_id)
    WHERE NOT is_deleted;

-- 7. Опубліковані оголошення курсу за датою.
CREATE INDEX idx_announcements_published_course_date
    ON course_announcements USING BTREE (course_id, published_at DESC)
    WHERE NOT is_deleted AND published_at IS NOT NULL;

-- 8. Повнотекстовий пошук за назвою й описом (GIN).
CREATE INDEX idx_courses_search_gin
    ON courses USING GIN (
        to_tsvector('simple', COALESCE(title, '') || ' ' || COALESCE(description, ''))
    );

-- 9. Швидка вибірка аудиту конкретного об'єкта.
CREATE INDEX idx_audit_log_entity_time
    ON audit_log USING BTREE (table_name, record_id, changed_at DESC);

-- 10. Перегляд журналу аудиту за часом.
CREATE INDEX idx_audit_log_changed_at
    ON audit_log USING BTREE (changed_at DESC);
