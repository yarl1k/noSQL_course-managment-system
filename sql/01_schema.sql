-- 1. Користувачі системи
CREATE TABLE users (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by_id   INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- 2. Ролі користувачів
CREATE TABLE roles (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(50) NOT NULL UNIQUE,
    description TEXT
);

-- 3. Зв'язок користувачів і ролей
CREATE TABLE user_roles (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- 4. Категорії курсів
CREATE TABLE categories (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    slug            VARCHAR(100) NOT NULL UNIQUE,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by_id   INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- 5. Курси
CREATE TABLE courses (
    id              SERIAL PRIMARY KEY,
    title           VARCHAR(150) NOT NULL,
    description     TEXT,
    category_id     INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    instructor_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    price           NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by_id   INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- 6. Модулі курсу
CREATE TABLE modules (
    id              SERIAL PRIMARY KEY,
    course_id       INTEGER NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
    title           VARCHAR(150) NOT NULL,
    sort_order      INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by_id   INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- 7. Уроки
CREATE TABLE lessons (
    id              SERIAL PRIMARY KEY,
    module_id       INTEGER NOT NULL REFERENCES modules(id) ON DELETE RESTRICT,
    title           VARCHAR(150) NOT NULL,
    content_url     TEXT,
    duration_mins   INTEGER NOT NULL DEFAULT 0 CHECK (duration_mins >= 0),
    sort_order      INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by_id   INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- 8. Зарахування студентів на курси
CREATE TABLE enrollments (
    id              SERIAL PRIMARY KEY,
    student_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    course_id       INTEGER NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'completed', 'dropped')),
    enrolled_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by_id   INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- 9. Прогрес студента за уроками
CREATE TABLE lesson_progress (
    id              SERIAL PRIMARY KEY,
    enrollment_id   INTEGER NOT NULL REFERENCES enrollments(id) ON DELETE RESTRICT,
    lesson_id       INTEGER NOT NULL REFERENCES lessons(id) ON DELETE RESTRICT,
    is_completed    BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at    TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_lesson_progress UNIQUE (enrollment_id, lesson_id)
);

-- 10. Домашні завдання
CREATE TABLE assignments (
    id              SERIAL PRIMARY KEY,
    lesson_id       INTEGER NOT NULL REFERENCES lessons(id) ON DELETE RESTRICT,
    title           VARCHAR(150) NOT NULL,
    max_score       INTEGER NOT NULL DEFAULT 100 CHECK (max_score > 0),
    due_date        TIMESTAMPTZ,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by_id   INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- 11. Надані студентами роботи
CREATE TABLE submissions (
    id              SERIAL PRIMARY KEY,
    assignment_id   INTEGER NOT NULL REFERENCES assignments(id) ON DELETE RESTRICT,
    student_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    file_url        TEXT,
    score           INTEGER CHECK (score >= 0),
    status          VARCHAR(20) NOT NULL DEFAULT 'submitted'
                    CHECK (status IN ('submitted', 'graded', 'rejected')),
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by_id   INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- 12. Відгуки на курси
CREATE TABLE reviews (
    id              SERIAL PRIMARY KEY,
    course_id       INTEGER NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
    student_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    rating          INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment         TEXT,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by_id   INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- 13. Сертифікати
CREATE TABLE certificates (
    id              SERIAL PRIMARY KEY,
    enrollment_id   INTEGER NOT NULL UNIQUE REFERENCES enrollments(id) ON DELETE RESTRICT,
    certificate_code VARCHAR(100) NOT NULL UNIQUE,
    issued_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 14. Теги
CREATE TABLE tags (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(50) NOT NULL UNIQUE,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by_id   INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- 15. Зв'язок курсів і тегів
CREATE TABLE course_tags (
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    tag_id    INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (course_id, tag_id)
);

-- 16. Оголошення в межах курсу
CREATE TABLE course_announcements (
    id              SERIAL PRIMARY KEY,
    course_id       INTEGER NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
    author_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    title           VARCHAR(150) NOT NULL,
    body            TEXT NOT NULL,
    published_at    TIMESTAMPTZ,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by_id   INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- 17. Журнал аудиту
CREATE TABLE audit_log (
    id              BIGSERIAL PRIMARY KEY,
    table_name      VARCHAR(100) NOT NULL,
    record_id       BIGINT NOT NULL,
    action          VARCHAR(20) NOT NULL
                    CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'SOFT_DELETE')),
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    changed_by_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    old_data        JSONB,
    new_data        JSONB
);
