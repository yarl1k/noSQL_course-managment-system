PostgreSQL залишається основною базою даних. MongoDB і Redis використовуються як окремі сховища для порівняння, а не як заміна PostgreSQL.

Запуск синхронізації:

```bash
pnpm nosql:sync
```

Команда повторно формує документи з PostgreSQL. MongoDB не стає джерелом істини для редагування курсів.

## Локальне підключення

- MongoDB: `mongodb://127.0.0.1:2701/lms_nosql`, база `lms_nosql`;
- Redis: `redis://127.0.0.1:6379`.

Приклад усіх змінних лежить у кореневому `.env.example`: скопіюйте його в `.env` .Адреси MongoDB та Redis можна змінити там само.

Після додавання залежностей встановіть пакети:

```bash
pnpm install
```

## Перевірка

```bash
# Синхронізувати документи курсів із PostgreSQL
pnpm nosql:sync

# Перевірити читання статистики й прогресу через кеш
pnpm nosql:demo <studentId> <courseId>

# Порівняти PostgreSQL із MongoDB та Redis
pnpm nosql:benchmark <studentId> <courseId>
```

Benchmark використовує 5 тестових викликів і 50 вимірювань. Для Redis перед замірами спочатку заповнюється кеш.
