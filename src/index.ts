import { db, closeDb } from './db/client.js';
import { UnitOfWork } from './uow/unit-of-work.js';
import { sql } from 'kysely';

async function main(): Promise<void> {
  console.log('=== TEST 1: SETUP DEMO USERS ===');
  
  // Створюємо демо-користувачів безпосередньо для тестів
  const instructorRes = await sql<{ id: number }>`
    INSERT INTO users (name, email, password_hash)
    VALUES ('Тестовий Викладач', 'inst_' || floor(random()*1000000)::text || '@test.local', 'hash123')
    RETURNING id;
  `.execute(db);
  const instructorRow = instructorRes.rows[0];
  if (!instructorRow) throw new Error('Не вдалося створити тестового викладача');
  const instructorId = Number(instructorRow.id);

  const studentRes = await sql<{ id: number }>`
    INSERT INTO users (name, email, password_hash)
    VALUES ('Тестовий Студент', 'stud_' || floor(random()*1000000)::text || '@test.local', 'hash123')
    RETURNING id;
  `.execute(db);
  const studentRow = studentRes.rows[0];
  if (!studentRow) throw new Error('Не вдалося створити тестового студента');
  const studentId = Number(studentRow.id);

  await sql`
    INSERT INTO user_roles (user_id, role_id)
    SELECT ${instructorId}, id FROM roles WHERE name = 'instructor';
  `.execute(db);

  await sql`
    INSERT INTO user_roles (user_id, role_id)
    SELECT ${studentId}, id FROM roles WHERE name = 'student';
  `.execute(db);

  const catRes = await sql<{ id: number }>`
    SELECT id FROM categories WHERE slug = 'programming' LIMIT 1;
  `.execute(db);
  const catRow = catRes.rows[0];
  if (!catRow) throw new Error('Категорію programming не знайдено');
  const categoryId = Number(catRow.id);

  console.log(`Створено: Викладач ID=${instructorId}, Студент ID=${studentId}`);

  console.log('\n=== TEST 2: UNIT OF WORK + REPOSITORIES ===');
  const uow = new UnitOfWork(db);

  let courseId = 0;
  let enrollmentId = 0;
  let submissionId = 0;
  let lessonId = 0;
  let assignmentId = 0;

  await uow.execute(async ({ courses, enrollments, progress, submissions }) => {
    // 1. Створення курсу через sp_create_course
    courseId = await courses.create({
      title: 'PostgreSQL Advanced UoW ' + Date.now(),
      description: 'Курс для тестування UoW і збережених процедур',
      categoryId,
      instructorId,
      price: 1500,
      actorId: instructorId,
    });
    console.log(`  1. Створено курс ID=${courseId} через sp_create_course`);

    // 2. Створення модуля через sp_create_module
    const moduleId = await courses.createModule(courseId, 'Модуль 1', 1, instructorId);
    console.log(`  2. Створено модуль ID=${moduleId} через sp_create_module`);

    // 3. Створення уроку через sp_create_lesson
    lessonId = await courses.createLesson(moduleId, 'Урок 1: Транзакції', 45, 1, instructorId);
    console.log(`  3. Створено урок ID=${lessonId} через sp_create_lesson`);

    // 4. Створення завдання через sp_create_assignment
    assignmentId = await submissions.createAssignment(lessonId, 'ДЗ 1', 100, null, instructorId);
    console.log(`  4. Створено завдання ID=${assignmentId} через sp_create_assignment`);

    // 5. Зарахування студента через sp_enroll_student
    enrollmentId = await enrollments.enroll(studentId, courseId, instructorId);
    console.log(`  5. Студента зараховано ID=${enrollmentId} через sp_enroll_student`);

    // 6. Подання роботи студентом через sp_submit_assignment
    submissionId = await submissions.submit(
      assignmentId,
      studentId,
      'https://github.com/solution/lab2',
      studentId,
    );
    console.log(`  6. Роботу подано ID=${submissionId} через sp_submit_assignment`);

    // 7. Оцінювання викладачем через sp_grade_submission
    await submissions.grade(submissionId, 95, instructorId);
    console.log(`  7. Роботу оцінено (95/100) через sp_grade_submission`);

    // 8. Позначення уроку завершеним через sp_mark_lesson_completed
    await progress.markLessonCompleted(enrollmentId, lessonId, studentId);
    console.log(`  8. Урок завершено через sp_mark_lesson_completed`);
  });

  console.log('  Транзакція Unit of Work успішно закомічена.');

  console.log('\n=== TEST 3: ЧИТАННЯ ЧЕРЕЗ РОЗРІЗИ ДАНИХ (VIEWS) ===');
  const courseRepo = new (await import('./repositories/course-repository.js')).CourseRepository(db);
  const enrollRepo = new (await import('./repositories/enrollment-repository.js')).EnrollmentRepository(db);
  const progRepo = new (await import('./repositories/progress-repository.js')).ProgressRepository(db);
  const subRepo = new (await import('./repositories/submission-repository.js')).SubmissionRepository(db);

  const activeCourses = await courseRepo.listActive();
  const createdCourse = activeCourses.find(c => c.course_id === courseId);
  console.log(`  v_active_courses: знайдено курс "${createdCourse?.title}", викладач: ${createdCourse?.instructor_name}`);

  const studentEnrollments = await enrollRepo.forStudent(studentId);
  console.log(`  v_student_enrollments: прогрес студента = ${studentEnrollments[0]?.progress_percent}%`);

  const lessonDetails = await progRepo.forEnrollment(enrollmentId);
  console.log(`  v_lesson_progress_details: урок "${lessonDetails[0]?.lesson_title}", виконано: ${lessonDetails[0]?.is_completed}`);

  const submissionsList = await subRepo.forCourse(courseId);
  console.log(`  v_assignment_submissions: робота студента "${submissionsList[0]?.student_name}", оцінка: ${submissionsList[0]?.score}/${submissionsList[0]?.max_score}`);

  const stats = await courseRepo.getStatistics(courseId);
  console.log(`  v_course_statistics: всього студентів = ${stats?.total_students}`);

  console.log('\n=== TEST 4: TRANSACTION ROLLBACK В UNIT OF WORK) ===');
  let rollbackCourseId = 0;
  try {
    await uow.execute(async ({ courses, submissions }) => {
      rollbackCourseId = await courses.create({
        title: 'Rollback Course ' + Date.now(),
        description: 'Має відкотитися',
        categoryId,
        instructorId,
        price: 200,
        actorId: instructorId,
      });
      console.log(`  Створено тимчасовий курс ID=${rollbackCourseId}`);
      // Навмисна помилка: спроба оцінити неіснуючу роботу
      await submissions.grade(999999, 100, instructorId);
    });
  } catch (err: any) {
    console.log(`  Очікувано перехоплено помилку: "${err.message.split('\n')[0]}"`);
  }

  const checkRollback = (await courseRepo.listActive()).find(c => c.course_id === rollbackCourseId);
  if (!checkRollback) {
    console.log('Курс відкотився! Rollback успішний.');
  } else {
    throw new Error('Помилка: курс залишився в базі після аварійного завершення');
  }

  console.log('\n=== TEST 5: ТРИГЕРИ ТА БІЗНЕC ЛОГІКА ===');
  // 1. Заборона фізичного видалення (тригер 31-40)
  try {
    await sql`DELETE FROM courses WHERE id = ${courseId}`.execute(db);
    console.error('ПОМИЛКА: Фізичне видалення мало бути заблоковане!');
  } catch (err: any) {
    console.log(`    Тригер блокує фізичне DELETE: "${err.message.split('\n')[0]}"`);
  }

  // 2. Soft Delete курсу через процедуру sp_soft_delete_course
  await courseRepo.softDelete(courseId, instructorId);
  console.log('    Soft delete курсу виконано успішно');

  // 3. Заборона запису на видалений курс
  try {
    const fakeStudent = await sql<{ id: number }>`
      INSERT INTO users (name, email, password_hash)
      VALUES ('Студент 2', 'stud2_' || floor(random()*1000000)::text || '@test.local', 'hash')
      RETURNING id;
    `.execute(db);
    const fakeStudentRow = fakeStudent.rows[0];
    if (!fakeStudentRow) throw new Error('Не вдалося створити другого студента');
    const sid2 = Number(fakeStudentRow.id);
    await sql`INSERT INTO user_roles (user_id, role_id) SELECT ${sid2}, id FROM roles WHERE name = 'student'`.execute(db);

    await enrollRepo.enroll(sid2, courseId, sid2);
    console.error('ПОМИЛКА: Зарахування на видалений курс мало бути заблоковане!');
  } catch (err: any) {
    console.log(`    Тригер блокує запис на видалений курс: "${err.message.split('\n')[0]}"`);
  }

  // 4. Заборона прямої модифікації оціненої роботи без перегляду (тригер 29)
  try {
    await sql`UPDATE submissions SET score = 50 WHERE id = ${submissionId}`.execute(db);
    console.error('ПОМИЛКА: Пряма зміна оцінки мала бути заблокована!');
  } catch (err: any) {
    console.log(`  Тригер блокує несанкціоновану зміну оцінки: "${err.message.split('\n')[0]}"`);
  }

  console.log('\n========================================');
  console.log('ВСІ ПЕРЕВІРКИ УСПІШНО ПРОЙДЕНО');
  console.log('========================================');
}

main()
  .catch((e) => {
    console.error('Помилка під час виконання тестів:', e);
    process.exitCode = 1;
  })
  .finally(closeDb);
