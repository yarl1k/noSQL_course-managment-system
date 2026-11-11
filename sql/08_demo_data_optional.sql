-- ДЕМО-ДАНІ ДЛЯ ПЕРЕВІРКИ ПРОЦЕДУР.

DO $$
DECLARE
    v_student_id INTEGER;
    v_instructor_id INTEGER;
    v_category_id INTEGER;
    v_course_id INTEGER;
    v_module_id INTEGER;
    v_lesson_id INTEGER;
    v_enrollment_id INTEGER;
BEGIN
    INSERT INTO users (name, email, password_hash)
    VALUES ('Demo Instructor', 'instructor@example.test', 'NOT_A_REAL_PASSWORD_HASH')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, is_deleted = FALSE
    RETURNING id INTO v_instructor_id;

    INSERT INTO users (name, email, password_hash)
    VALUES ('Demo Student', 'student@example.test', 'NOT_A_REAL_PASSWORD_HASH')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, is_deleted = FALSE
    RETURNING id INTO v_student_id;

    INSERT INTO user_roles (user_id, role_id)
    SELECT v_instructor_id, id FROM roles WHERE name = 'instructor'
    ON CONFLICT DO NOTHING;

    INSERT INTO user_roles (user_id, role_id)
    SELECT v_student_id, id FROM roles WHERE name = 'student'
    ON CONFLICT DO NOTHING;

    SELECT id INTO v_category_id FROM categories WHERE slug = 'programming';

    SELECT id INTO v_course_id FROM courses
    WHERE title = 'Демонстраційний курс LMS'
      AND instructor_id = v_instructor_id
      AND NOT is_deleted
    ORDER BY id DESC LIMIT 1;

    IF v_course_id IS NULL THEN
        CALL sp_create_course(
            'Демонстраційний курс LMS',
            'Курс для перевірки процедур і аудиту.',
            v_category_id, v_instructor_id, 0, v_instructor_id, v_course_id
        );
    END IF;

    SELECT id INTO v_module_id FROM modules
    WHERE course_id = v_course_id AND title = 'Перший модуль' AND NOT is_deleted
    ORDER BY id DESC LIMIT 1;

    IF v_module_id IS NULL THEN
        INSERT INTO modules (course_id, title, sort_order, updated_by_id)
        VALUES (v_course_id, 'Перший модуль', 1, v_instructor_id)
        RETURNING id INTO v_module_id;
    END IF;

    SELECT id INTO v_lesson_id FROM lessons
    WHERE module_id = v_module_id AND title = 'Вступний урок' AND NOT is_deleted
    ORDER BY id DESC LIMIT 1;

    IF v_lesson_id IS NULL THEN
        INSERT INTO lessons (module_id, title, duration_mins, sort_order, updated_by_id)
        VALUES (v_module_id, 'Вступний урок', 10, 1, v_instructor_id)
        RETURNING id INTO v_lesson_id;
    END IF;

    SELECT id INTO v_enrollment_id FROM enrollments
    WHERE student_id = v_student_id
      AND course_id = v_course_id
      AND NOT is_deleted
      AND status IN ('active', 'completed')
    LIMIT 1;

    IF v_enrollment_id IS NULL THEN
        CALL sp_enroll_student(v_student_id, v_course_id, v_student_id, v_enrollment_id);
    END IF;

    CALL sp_mark_lesson_completed(v_enrollment_id, v_lesson_id, v_student_id);
END;
$$;

SELECT * FROM v_active_courses WHERE title = 'Демонстраційний курс LMS';
SELECT * FROM v_course_statistics WHERE title = 'Демонстраційний курс LMS';
SELECT * FROM v_student_enrollments WHERE course_title = 'Демонстраційний курс LMS';

SELECT table_name, record_id, action, changed_at, changed_by_id
FROM audit_log
ORDER BY id DESC
LIMIT 25;
