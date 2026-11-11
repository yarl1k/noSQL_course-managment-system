-- ПОЧАТКОВІ ДОВІДКОВІ ДАНІ. Скрипт можна запускати повторно.

INSERT INTO roles (name, description) VALUES
    ('student', 'Студент: проходить курси та здає роботи'),
    ('instructor', 'Викладач: керує курсами та оцінює роботи'),
    ('admin', 'Адміністратор системи')
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, slug) VALUES
    ('Програмування', 'programming'),
    ('Бази даних', 'databases'),
    ('Дизайн', 'design'),
    ('Інше', 'general')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO tags (name) VALUES
    ('beginner'),
    ('intermediate'),
    ('advanced'),
    ('practice')
ON CONFLICT (name) DO NOTHING;
