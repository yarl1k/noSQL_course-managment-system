-- 1. Створити курс і повернути його ID.
CREATE OR REPLACE PROCEDURE sp_create_course(
    IN p_title VARCHAR(150),
    IN p_description TEXT,
    IN p_category_id INTEGER,
    IN p_instructor_id INTEGER,
    IN p_price NUMERIC(10,2),
    IN p_user_id INTEGER,
    INOUT p_course_id INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_price < 0 THEN
        RAISE EXCEPTION 'Ціна курсу не може бути від’ємною';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM users
        WHERE id = p_user_id AND NOT is_deleted
    ) THEN
        RAISE EXCEPTION 'Користувача-ініціатора не знайдено або його деактивовано';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM categories
        WHERE id = p_category_id AND NOT is_deleted
    ) THEN
        RAISE EXCEPTION 'Активну категорію не знайдено';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM users u
        JOIN user_roles ur ON ur.user_id = u.id
        JOIN roles r ON r.id = ur.role_id
        WHERE u.id = p_instructor_id
          AND NOT u.is_deleted
          AND LOWER(r.name) = 'instructor'
    ) THEN
        RAISE EXCEPTION 'Вказаний користувач не є активним викладачем';
    END IF;

    IF p_user_id <> p_instructor_id AND NOT EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = p_user_id AND LOWER(r.name) = 'admin'
    ) THEN
        RAISE EXCEPTION 'Створити курс може його викладач або адміністратор';
    END IF;

    PERFORM set_config('app.user_id', p_user_id::TEXT, TRUE);

    INSERT INTO courses (
        title, description, category_id, instructor_id, price, updated_by_id
    ) VALUES (
        p_title, p_description, p_category_id, p_instructor_id, p_price, p_user_id
    )
    RETURNING id INTO p_course_id;
END;
$$;

-- 2. SOFT DELETE курсу, зберігши історію зарахувань.
CREATE OR REPLACE PROCEDURE sp_soft_delete_course(
    IN p_course_id INTEGER,
    IN p_user_id INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id AND NOT is_deleted) THEN
        RAISE EXCEPTION 'Користувача-ініціатора не знайдено або його деактивовано';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM courses c
        WHERE c.id = p_course_id
          AND (c.instructor_id = p_user_id OR EXISTS (
              SELECT 1 FROM user_roles ur
              JOIN roles r ON r.id = ur.role_id
              WHERE ur.user_id = p_user_id AND LOWER(r.name) = 'admin'
          ))
    ) THEN
        RAISE EXCEPTION 'Курс може видалити лише його викладач або адміністратор';
    END IF;

    PERFORM set_config('app.user_id', p_user_id::TEXT, TRUE);

    UPDATE courses
    SET is_deleted = TRUE, updated_by_id = p_user_id
    WHERE id = p_course_id AND NOT is_deleted;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Активний курс з ID % не знайдено', p_course_id;
    END IF;
END;
$$;

-- 3. Відновити Soft Deleted курс.
CREATE OR REPLACE PROCEDURE sp_restore_course(
    IN p_course_id INTEGER,
    IN p_user_id INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id AND NOT is_deleted) THEN
        RAISE EXCEPTION 'Користувача-ініціатора не знайдено або його деактивовано';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM courses c
        WHERE c.id = p_course_id
          AND (c.instructor_id = p_user_id OR EXISTS (
              SELECT 1 FROM user_roles ur
              JOIN roles r ON r.id = ur.role_id
              WHERE ur.user_id = p_user_id AND LOWER(r.name) = 'admin'
          ))
    ) THEN
        RAISE EXCEPTION 'Курс може відновити лише його викладач або адміністратор';
    END IF;

    PERFORM set_config('app.user_id', p_user_id::TEXT, TRUE);

    UPDATE courses
    SET is_deleted = FALSE, updated_by_id = p_user_id
    WHERE id = p_course_id
      AND is_deleted
      AND EXISTS (
          SELECT 1 FROM categories cat
          WHERE cat.id = courses.category_id AND NOT cat.is_deleted
      );

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Курс не знайдено, він уже активний або його категорію видалено';
    END IF;
END;
$$;

-- 4. Зарахувати студента; повернути ID зарахування.
CREATE OR REPLACE PROCEDURE sp_enroll_student(
    IN p_student_id INTEGER,
    IN p_course_id INTEGER,
    IN p_user_id INTEGER,
    INOUT p_enrollment_id INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM users u
        JOIN user_roles ur ON ur.user_id = u.id
        JOIN roles r ON r.id = ur.role_id
        WHERE u.id = p_student_id
          AND NOT u.is_deleted
          AND LOWER(r.name) = 'student'
    ) THEN
        RAISE EXCEPTION 'Активного користувача з роллю student не знайдено';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM courses c
        JOIN categories cat ON cat.id = c.category_id
        WHERE c.id = p_course_id
          AND NOT c.is_deleted
          AND NOT cat.is_deleted
    ) THEN
        RAISE EXCEPTION 'Активний курс не знайдено';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id AND NOT is_deleted) THEN
        RAISE EXCEPTION 'Користувача-ініціатора не знайдено або його деактивовано';
    END IF;

    IF EXISTS (
        SELECT 1 FROM enrollments
        WHERE student_id = p_student_id
          AND course_id = p_course_id
          AND NOT is_deleted
          AND status IN ('active', 'completed')
    ) THEN
        RAISE EXCEPTION 'Студент уже має активне зарахування на цей курс';
    END IF;

    PERFORM set_config('app.user_id', p_user_id::TEXT, TRUE);

    INSERT INTO enrollments (student_id, course_id, status, updated_by_id)
    VALUES (p_student_id, p_course_id, 'active', p_user_id)
    RETURNING id INTO p_enrollment_id;
END;
$$;

-- 5. Виставити оцінку з перевіркою максимуму та ролі оцінювача.
CREATE OR REPLACE PROCEDURE sp_grade_submission(
    IN p_submission_id INTEGER,
    IN p_score INTEGER,
    IN p_user_id INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_max_score INTEGER;
    v_course_instructor_id INTEGER;
    v_is_admin BOOLEAN;
BEGIN
    SELECT a.max_score, c.instructor_id
    INTO v_max_score, v_course_instructor_id
    FROM submissions s
    JOIN assignments a ON a.id = s.assignment_id AND NOT a.is_deleted
    JOIN lessons l ON l.id = a.lesson_id AND NOT l.is_deleted
    JOIN modules m ON m.id = l.module_id AND NOT m.is_deleted
    JOIN courses c ON c.id = m.course_id AND NOT c.is_deleted
    WHERE s.id = p_submission_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Роботу або активне завдання не знайдено';
    END IF;

    IF p_score IS NULL OR p_score < 0 OR p_score > v_max_score THEN
        RAISE EXCEPTION 'Оцінка має бути в межах від 0 до %', v_max_score;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id AND NOT is_deleted) THEN
        RAISE EXCEPTION 'Користувача-оцінювача не знайдено або його деактивовано';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = p_user_id AND LOWER(r.name) = 'admin'
    ) INTO v_is_admin;

    IF p_user_id <> v_course_instructor_id AND NOT v_is_admin THEN
        RAISE EXCEPTION 'Оцінювати роботу може лише викладач курсу або адміністратор';
    END IF;

    PERFORM set_config('app.user_id', p_user_id::TEXT, TRUE);
    PERFORM set_config('app.allow_regrade', 'true', TRUE);

    UPDATE submissions
    SET score = p_score, status = 'graded', updated_by_id = p_user_id
    WHERE id = p_submission_id;

    PERFORM set_config('app.allow_regrade', '', TRUE);
END;
$$;

-- 6. Позначити урок завершеним у межах власного зарахування.
CREATE OR REPLACE PROCEDURE sp_mark_lesson_completed(
    IN p_enrollment_id INTEGER,
    IN p_lesson_id INTEGER,
    IN p_user_id INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_course_id INTEGER;
    v_student_id INTEGER;
BEGIN
    SELECT e.course_id, e.student_id
    INTO v_course_id, v_student_id
    FROM enrollments e
    WHERE e.id = p_enrollment_id
      AND e.status = 'active'
      AND NOT e.is_deleted;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Активне зарахування не знайдено';
    END IF;

    IF v_student_id <> p_user_id THEN
        RAISE EXCEPTION 'Студент може оновлювати лише власний прогрес';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM lessons l
        JOIN modules m ON m.id = l.module_id AND NOT m.is_deleted
        JOIN courses c ON c.id = m.course_id AND NOT c.is_deleted
        WHERE l.id = p_lesson_id
          AND c.id = v_course_id
          AND NOT l.is_deleted
    ) THEN
        RAISE EXCEPTION 'Урок не належить курсу цього зарахування або недоступний';
    END IF;

    PERFORM set_config('app.user_id', p_user_id::TEXT, TRUE);

    INSERT INTO lesson_progress (
        enrollment_id, lesson_id, is_completed, completed_at, updated_by_id
    ) VALUES (
        p_enrollment_id, p_lesson_id, TRUE, CURRENT_TIMESTAMP, p_user_id
    )
    ON CONFLICT (enrollment_id, lesson_id)
    DO UPDATE SET
        is_completed = TRUE,
        completed_at = COALESCE(lesson_progress.completed_at, CURRENT_TIMESTAMP),
        updated_by_id = EXCLUDED.updated_by_id;
END;
$$;

-- 7. Створити модуль у межах активного курсу.
CREATE OR REPLACE PROCEDURE sp_create_module(
    IN p_course_id INTEGER,
    IN p_title VARCHAR(150),
    IN p_sort_order INTEGER,
    IN p_user_id INTEGER,
    INOUT p_module_id INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id AND NOT is_deleted) THEN
        RAISE EXCEPTION 'Користувача-ініціатора не знайдено або його деактивовано';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM courses
        WHERE id = p_course_id AND NOT is_deleted
    ) THEN
        RAISE EXCEPTION 'Активний курс (id=%) не знайдено', p_course_id;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM courses c
        WHERE c.id = p_course_id
          AND (c.instructor_id = p_user_id OR EXISTS (
              SELECT 1 FROM user_roles ur
              JOIN roles r ON r.id = ur.role_id
              WHERE ur.user_id = p_user_id AND LOWER(r.name) = 'admin'
          ))
    ) THEN
        RAISE EXCEPTION 'Модуль може створити лише викладач курсу або адміністратор';
    END IF;

    PERFORM set_config('app.user_id', p_user_id::TEXT, TRUE);

    INSERT INTO modules (course_id, title, sort_order, updated_by_id)
    VALUES (p_course_id, p_title, COALESCE(p_sort_order, 0), p_user_id)
    RETURNING id INTO p_module_id;
END;
$$;

-- 8. Подання роботи студентом.
CREATE OR REPLACE PROCEDURE sp_submit_assignment(
    IN p_assignment_id INTEGER,
    IN p_student_id INTEGER,
    IN p_file_url TEXT,
    IN p_user_id INTEGER,
    INOUT p_submission_id INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_course_id INTEGER;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id AND NOT is_deleted) THEN
        RAISE EXCEPTION 'Користувача-ініціатора не знайдено або його деактивовано';
    END IF;

    IF p_user_id <> p_student_id AND NOT EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = p_user_id AND LOWER(r.name) = 'admin'
    ) THEN
        RAISE EXCEPTION 'Подати роботу може лише сам студент або адміністратор';
    END IF;

    SELECT m.course_id INTO v_course_id
    FROM assignments a
    JOIN lessons l ON l.id = a.lesson_id AND NOT l.is_deleted
    JOIN modules m ON m.id = l.module_id AND NOT m.is_deleted
    WHERE a.id = p_assignment_id AND NOT a.is_deleted;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Активне завдання (id=%) не знайдено', p_assignment_id;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM enrollments
        WHERE student_id = p_student_id
          AND course_id = v_course_id
          AND status = 'active'
          AND NOT is_deleted
    ) THEN
        RAISE EXCEPTION 'Студент (id=%) не має активного зарахування на курс (id=%)', p_student_id, v_course_id;
    END IF;

    PERFORM set_config('app.user_id', p_user_id::TEXT, TRUE);

    INSERT INTO submissions (assignment_id, student_id, file_url, status, updated_by_id)
    VALUES (p_assignment_id, p_student_id, p_file_url, 'submitted', p_user_id)
    RETURNING id INTO p_submission_id;
END;
$$;

-- 9. Створити урок у межах модуля.
CREATE OR REPLACE PROCEDURE sp_create_lesson(
    IN p_module_id INTEGER,
    IN p_title VARCHAR(150),
    IN p_duration_mins INTEGER,
    IN p_sort_order INTEGER,
    IN p_user_id INTEGER,
    INOUT p_lesson_id INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_course_id INTEGER;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id AND NOT is_deleted) THEN
        RAISE EXCEPTION 'Користувача-ініціатора не знайдено або його деактивовано';
    END IF;

    SELECT m.course_id INTO v_course_id
    FROM modules m
    WHERE m.id = p_module_id AND NOT m.is_deleted;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Активний модуль (id=%) не знайдено', p_module_id;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM courses c
        WHERE c.id = v_course_id
          AND (c.instructor_id = p_user_id OR EXISTS (
              SELECT 1 FROM user_roles ur
              JOIN roles r ON r.id = ur.role_id
              WHERE ur.user_id = p_user_id AND LOWER(r.name) = 'admin'
          ))
    ) THEN
        RAISE EXCEPTION 'Урок може створити лише викладач курсу або адміністратор';
    END IF;

    PERFORM set_config('app.user_id', p_user_id::TEXT, TRUE);

    INSERT INTO lessons (module_id, title, duration_mins, sort_order, updated_by_id)
    VALUES (p_module_id, p_title, COALESCE(p_duration_mins, 0), COALESCE(p_sort_order, 0), p_user_id)
    RETURNING id INTO p_lesson_id;
END;
$$;

-- 10. Створити завдання у межах уроку.
CREATE OR REPLACE PROCEDURE sp_create_assignment(
    IN p_lesson_id INTEGER,
    IN p_title VARCHAR(150),
    IN p_max_score INTEGER,
    IN p_due_date TIMESTAMPTZ,
    IN p_user_id INTEGER,
    INOUT p_assignment_id INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_course_id INTEGER;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id AND NOT is_deleted) THEN
        RAISE EXCEPTION 'Користувача-ініціатора не знайдено або його деактивовано';
    END IF;

    SELECT m.course_id INTO v_course_id
    FROM lessons l
    JOIN modules m ON m.id = l.module_id AND NOT m.is_deleted
    WHERE l.id = p_lesson_id AND NOT l.is_deleted;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Активний урок (id=%) не знайдено', p_lesson_id;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM courses c
        WHERE c.id = v_course_id
          AND (c.instructor_id = p_user_id OR EXISTS (
              SELECT 1 FROM user_roles ur
              JOIN roles r ON r.id = ur.role_id
              WHERE ur.user_id = p_user_id AND LOWER(r.name) = 'admin'
          ))
    ) THEN
        RAISE EXCEPTION 'Завдання може створити лише викладач курсу або адміністратор';
    END IF;

    IF p_max_score <= 0 THEN
        RAISE EXCEPTION 'Максимальний бал повинен бути більшим за 0';
    END IF;

    PERFORM set_config('app.user_id', p_user_id::TEXT, TRUE);

    INSERT INTO assignments (lesson_id, title, max_score, due_date, updated_by_id)
    VALUES (p_lesson_id, p_title, p_max_score, p_due_date, p_user_id)
    RETURNING id INTO p_assignment_id;
END;
$$;


