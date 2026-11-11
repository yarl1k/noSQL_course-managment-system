-- 1. Автоматичні дата зміни й користувач-редактор.
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_actor_id INTEGER;
BEGIN
    NEW.updated_at := CURRENT_TIMESTAMP;
    v_actor_id := NULLIF(current_setting('app.user_id', TRUE), '')::INTEGER;

    IF v_actor_id IS NOT NULL THEN
        NEW.updated_by_id := v_actor_id;
    END IF;

    RETURN NEW;
END;
$$;

-- 2. Загальний аудит INSERT / UPDATE / DELETE і Soft Delete.
CREATE OR REPLACE FUNCTION fn_audit_row()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_old JSONB;
    v_new JSONB;
    v_row JSONB;
    v_record_id BIGINT;
    v_actor_id INTEGER;
    v_action VARCHAR(20);
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_new := to_jsonb(NEW);
        v_row := v_new;
        v_record_id := (v_new ->> 'id')::BIGINT;
        v_action := 'INSERT';
    ELSIF TG_OP = 'UPDATE' THEN
        v_old := to_jsonb(OLD);
        v_new := to_jsonb(NEW);
        v_row := v_new;
        v_record_id := (v_new ->> 'id')::BIGINT;
        v_action := 'UPDATE';

        IF (v_old ? 'is_deleted')
           AND (v_old ->> 'is_deleted') = 'false'
           AND (v_new ->> 'is_deleted') = 'true' THEN
            v_action := 'SOFT_DELETE';
        END IF;
    ELSE
        v_old := to_jsonb(OLD);
        v_row := v_old;
        v_record_id := (v_old ->> 'id')::BIGINT;
        v_action := 'DELETE';
    END IF;

    v_actor_id := COALESCE(
        NULLIF(current_setting('app.user_id', TRUE), '')::INTEGER,
        NULLIF(v_row ->> 'updated_by_id', '')::INTEGER
    );

    INSERT INTO audit_log (
        table_name, record_id, action, changed_by_id, old_data, new_data
    ) VALUES (
        TG_TABLE_NAME, v_record_id, v_action, v_actor_id, v_old, v_new
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

-- 3. Нормалізація позначки завершення уроку.
CREATE OR REPLACE FUNCTION fn_normalize_lesson_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.is_completed THEN
        NEW.completed_at := COALESCE(NEW.completed_at, CURRENT_TIMESTAMP);
    ELSE
        NEW.completed_at := NULL;
    END IF;
    RETURN NEW;
END;
$$;

-- 4. Чи має студент активний доступ до курсу.
CREATE OR REPLACE FUNCTION fn_student_has_course_access(
    p_student_id INTEGER,
    p_course_id INTEGER
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM enrollments e
        JOIN courses c ON c.id = e.course_id
        JOIN users u ON u.id = e.student_id
        WHERE e.student_id = p_student_id
          AND e.course_id = p_course_id
          AND e.status = 'active'
          AND NOT e.is_deleted
          AND NOT c.is_deleted
          AND NOT u.is_deleted
    );
$$;

-- 5. Відсоток завершення активних уроків для зарахування.
CREATE OR REPLACE FUNCTION fn_course_progress_percent(p_enrollment_id INTEGER)
RETURNS NUMERIC(5,2)
LANGUAGE SQL
STABLE
AS $$
    SELECT COALESCE(
        ROUND(100.0 * COUNT(DISTINCT lp.lesson_id)
              FILTER (WHERE lp.is_completed)
              / NULLIF(COUNT(DISTINCT l.id), 0), 2),
        0
    )::NUMERIC(5,2)
    FROM enrollments e
    JOIN courses c ON c.id = e.course_id AND NOT c.is_deleted
    LEFT JOIN modules m ON m.course_id = c.id AND NOT m.is_deleted
    LEFT JOIN lessons l ON l.module_id = m.id AND NOT l.is_deleted
    LEFT JOIN lesson_progress lp
           ON lp.enrollment_id = e.id AND lp.lesson_id = l.id
    WHERE e.id = p_enrollment_id AND NOT e.is_deleted;
$$;

-- 6. Заборона зарахування на видалений курс.
CREATE OR REPLACE FUNCTION fn_block_enroll_deleted_course()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM courses WHERE id = NEW.course_id AND is_deleted
    ) THEN
        RAISE EXCEPTION 'Не можна записатися на видалений курс (course_id=%)', NEW.course_id;
    END IF;
    RETURN NEW;
END;
$$;

-- 7. Заборона змін до завершеного зарахування (enrollment status='completed').
-- Дозволяє лише soft delete (is_deleted = TRUE) і зміну updated_at / updated_by_id.
CREATE OR REPLACE FUNCTION fn_block_modify_completed_enrollment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status = 'completed'
       AND NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status <> 'completed'
    THEN
        RAISE EXCEPTION 'Завершене зарахування (id=%) не можна змінювати', OLD.id;
    END IF;
    RETURN NEW;
END;
$$;

-- 8. Заборона зміни оціненої роботи без окремої процедури перегляду.
-- Звичайний UPDATE не може змінити score/status на вже оціненій роботі.
-- Процедура sp_grade_submission встановлює app.allow_regrade = 'true' перед оновленням.
CREATE OR REPLACE FUNCTION fn_block_modify_graded_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status = 'graded'
       AND (NEW.score IS DISTINCT FROM OLD.score OR NEW.status IS DISTINCT FROM OLD.status)
       AND COALESCE(NULLIF(current_setting('app.allow_regrade', TRUE), ''), 'false') <> 'true'
    THEN
        RAISE EXCEPTION 'Оцінену роботу (id=%) не можна змінювати без процедури перегляду', OLD.id;
    END IF;
    RETURN NEW;
END;
$$;

-- ФУНКЦІЯ 9. Перевірка коректності подання роботи (INSERT на submissions).
-- Валідує: оцінка в межах max_score, дедлайн не минув, завдання належить курсу студента.
CREATE OR REPLACE FUNCTION fn_validate_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_max_score   INTEGER;
    v_due_date    TIMESTAMPTZ;
    v_course_id   INTEGER;
BEGIN
    SELECT a.max_score, a.due_date, m.course_id
    INTO v_max_score, v_due_date, v_course_id
    FROM assignments a
    JOIN lessons l ON l.id = a.lesson_id AND NOT l.is_deleted
    JOIN modules m ON m.id = l.module_id AND NOT m.is_deleted
    WHERE a.id = NEW.assignment_id AND NOT a.is_deleted;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Активне завдання (id=%) не знайдено', NEW.assignment_id;
    END IF;

    IF NEW.score IS NOT NULL AND (NEW.score < 0 OR NEW.score > v_max_score) THEN
        RAISE EXCEPTION 'Оцінка має бути 0..%, отримано %', v_max_score, NEW.score;
    END IF;

    IF v_due_date IS NOT NULL AND NEW.submitted_at > v_due_date THEN
        RAISE EXCEPTION 'Дедлайн (%) минув', v_due_date;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM enrollments
        WHERE student_id = NEW.student_id
          AND course_id = v_course_id
          AND status = 'active'
          AND NOT is_deleted
    ) THEN
        RAISE EXCEPTION 'Студент (id=%) не має активного зарахування на курс (id=%)', NEW.student_id, v_course_id;
    END IF;

    RETURN NEW;
END;
$$;

-- ФУНКЦІЯ 10. Заборона фізичного видалення на таблицях із Soft Delete.
-- Таблиця повинна мати стовпець is_deleted. Дозволяє DELETE лише якщо is_deleted = TRUE.
CREATE OR REPLACE FUNCTION fn_block_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT OLD.is_deleted THEN
        RAISE EXCEPTION 'Фізичне видалення заборонено для таблиці %. Використовуйте Soft Delete.', TG_TABLE_NAME;
    END IF;
    RETURN OLD;
END;
$$;
