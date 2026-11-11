-- 1-12. Автоматичне оновлення updated_at / updated_by_id.
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'users', 'categories', 'courses', 'modules', 'lessons',
        'enrollments', 'lesson_progress', 'assignments', 'submissions',
        'reviews', 'tags', 'course_announcements'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%s_set_updated_at
             BEFORE UPDATE ON %I
             FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at()',
            tbl, tbl
        );
    END LOOP;
END;
$$;

-- 13-25. Аудит змін (INSERT / UPDATE / DELETE).
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'users', 'categories', 'courses', 'modules', 'lessons',
        'enrollments', 'lesson_progress', 'assignments', 'submissions',
        'reviews', 'certificates', 'tags', 'course_announcements'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%s_audit
             AFTER INSERT OR UPDATE OR DELETE ON %I
             FOR EACH ROW EXECUTE FUNCTION fn_audit_row()',
            tbl, tbl
        );
    END LOOP;
END;
$$;

-- 26. Узгоджує is_completed і completed_at у прогресі уроку.
CREATE TRIGGER trg_lesson_progress_normalize
BEFORE INSERT OR UPDATE ON lesson_progress
FOR EACH ROW EXECUTE FUNCTION fn_normalize_lesson_progress();

-- 27. Не дозволяти зарахування на видалений курс.
CREATE TRIGGER trg_enrollments_block_deleted_course
BEFORE INSERT ON enrollments
FOR EACH ROW EXECUTE FUNCTION fn_block_enroll_deleted_course();

-- 28. Не дозволяти зміну статусу завершеного зарахування.
CREATE TRIGGER trg_enrollments_block_modify_completed
BEFORE UPDATE ON enrollments
FOR EACH ROW EXECUTE FUNCTION fn_block_modify_completed_enrollment();

-- 29. Не дозволяти зміну оціненої роботи без процедури перегляду.
CREATE TRIGGER trg_submissions_block_modify_graded
BEFORE UPDATE ON submissions
FOR EACH ROW EXECUTE FUNCTION fn_block_modify_graded_submission();

-- 30. Перевірка коректності подання роботи (дедлайн, оцінка, курс).
CREATE TRIGGER trg_submissions_validate
BEFORE INSERT ON submissions
FOR EACH ROW EXECUTE FUNCTION fn_validate_submission();

-- 31-40. Заборона фізичного видалення на усіх таблицях із Soft Delete.
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'users', 'categories', 'courses', 'modules', 'lessons',
        'enrollments', 'assignments', 'reviews', 'tags', 'course_announcements'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%s_block_hard_delete
             BEFORE DELETE ON %I
             FOR EACH ROW EXECUTE FUNCTION fn_block_hard_delete()',
            tbl, tbl
        );
    END LOOP;
END;
$$;
