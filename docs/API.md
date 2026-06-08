# API Documentation

Базовий URL: `http://localhost:3000`

Усі відповіді мають формат JSON. Успішні відповіді зазвичай містять поле `success: true`.

## Авторизація

Захищені ендпоінти вимагають заголовок:

```
Authorization: Bearer <access_token>
```

Refresh-токен передається в body або cookie (залежно від клієнта).

---

## System

### GET /api/health

Перевірка стану сервера.

**Auth:** Ні

**Відповідь:**

```json
{
  "success": true,
  "message": "OK",
  "timestamp": "2026-06-08T12:00:00.000Z",
  "uptime": 123.45
}
```

---

### GET /api/ping

Простий ping.

**Auth:** Ні

**Відповідь:**

```json
{
  "success": true,
  "message": "pong",
  "timestamp": "2026-06-08T12:00:00.000Z"
}
```

---

### GET /api/docs

Огляд доступних груп ендпоінтів.

**Auth:** Ні

---

## Auth — `/api/auth`

### POST /api/auth/register

Реєстрація нового користувача.

**Auth:** Ні

**Body:**

| Поле | Тип | Обов'язкове | Опис |
|------|-----|:-----------:|------|
| `firstName` | string | Так | Ім'я (1–50 символів) |
| `lastName` | string | Так | Прізвище (1–50 символів) |
| `email` | string | Так | Email |
| `password` | string | Так | Мін. 8 символів, 1 велика, 1 мала, 1 цифра |

**Приклад:**

```json
{
  "firstName": "Іван",
  "lastName": "Петренко",
  "email": "ivan@example.com",
  "password": "SecurePass1"
}
```

---

### POST /api/auth/login

Вхід у систему.

**Auth:** Ні

**Body:**

| Поле | Тип | Обов'язкове |
|------|-----|:-----------:|
| `email` | string | Так |
| `password` | string | Так |

**Відповідь:** access та refresh tokens, дані користувача.

---

### POST /api/auth/refresh

Оновлення access-токена.

**Auth:** Ні

**Body:**

| Поле | Тип | Обов'язкове |
|------|-----|:-----------:|
| `refreshToken` | string | Так |

---

### POST /api/auth/logout

Вихід з системи (інвалідація refresh-токена).

**Auth:** Так

---

### GET /api/auth/me

Отримання профілю поточного користувача.

**Auth:** Так

---

### PUT /api/auth/profile

Оновлення профілю.

**Auth:** Так

**Body:** поля профілю (firstName, lastName тощо).

---

### PUT /api/auth/password

Зміна пароля.

**Auth:** Так

**Body:**

| Поле | Тип | Обов'язкове |
|------|-----|:-----------:|
| `oldPassword` | string | Так |
| `newPassword` | string | Так |

---

### POST /api/auth/forgot-password

Запит на скидання пароля.

**Auth:** Ні

**Body:**

| Поле | Тип | Обов'язкове |
|------|-----|:-----------:|
| `email` | string | Так |

---

### POST /api/auth/reset-password

Скидання пароля за токеном.

**Auth:** Ні

**Body:**

| Поле | Тип | Обов'язкове |
|------|-----|:-----------:|
| `token` | string | Так |
| `newPassword` | string | Так |

---

## Violations — `/api/violations`

### Категорії

`traffic`, `parking`, `trash`, `environment`, `public_safety`, `infrastructure`, `vandalism`, `noise`, `other`

### GET /api/violations

Список правопорушень з пагінацією.

**Auth:** Ні

**Query:**

| Параметр | Тип | Опис |
|----------|-----|------|
| `limit` | number | 1–100 (default залежить від сервісу) |
| `offset` | number | Зміщення |
| `sort` | string | `dateTime`, `-dateTime`, `createdAt`, `-createdAt` |

---

### GET /api/violations/statistics

Статистика правопорушень.

**Auth:** Ні

**Query:**

| Параметр | Тип | Опис |
|----------|-----|------|
| `period` | string | `day`, `week`, `month` (default: `month`) |

---

### GET /api/violations/dates

Список дат, за які є правопорушення.

**Auth:** Ні

---

### GET /api/violations/by-date

Правопорушення за конкретною датою.

**Auth:** Ні

**Query:**

| Параметр | Тип | Обов'язкове |
|----------|-----|:-----------:|
| `date` | ISO8601 | Так |
| `userId` | MongoId | Так |

---

### GET /api/violations/by-date-range

Правопорушення за діапазоном дат.

**Auth:** Ні

**Query:**

| Параметр | Тип | Обов'язкове |
|----------|-----|:-----------:|
| `startDate` | ISO8601 | Так |
| `endDate` | ISO8601 | Так |

---

### POST /api/violations/by-location

Пошук правопорушень у радіусі від координат.

**Auth:** Ні

**Body:**

| Поле | Тип | Обов'язкове | Опис |
|------|-----|:-----------:|------|
| `coordinates` | `[lng, lat]` | Так | Довгота, широта |
| `radius` | number | Ні | 100–5000 м |

**Приклад:**

```json
{
  "coordinates": [30.5234, 50.4501],
  "radius": 1000
}
```

---

### GET /api/violations/:id

Отримання одного правопорушення за ID.

**Auth:** Ні

---

### POST /api/violations

Створення правопорушення.

**Auth:** Так

**Body:**

| Поле | Тип | Обов'язкове | Опис |
|------|-----|:-----------:|------|
| `description` | string | Так | 10–500 символів |
| `category` | string | Так | Одна з категорій |
| `dateTime` | ISO8601 | Так | Не в майбутньому, не старше 30 днів |
| `location` | object | Так | GeoJSON Point |
| `location.type` | string | Так | `"Point"` |
| `location.coordinates` | `[lng, lat]` | Так | |
| `photoBase64` | string | Ні | `data:image/...;base64,...` |

**Приклад:**

```json
{
  "description": "Автомобіль припаркований на тротуарі",
  "category": "parking",
  "dateTime": "2026-06-08T10:00:00.000Z",
  "location": {
    "type": "Point",
    "coordinates": [30.5234, 50.4501]
  }
}
```

---

### POST /api/violations/upload

Створення правопорушення з завантаженням зображення (multipart/form-data).

**Auth:** Так

**Form fields:** ті самі, що для POST `/api/violations`, плюс файл зображення.

---

### GET /api/violations/unsynced

Список несинхронізованих правопорушень поточного користувача.

**Auth:** Так

---

### POST /api/violations/sync

Синхронізація локального правопорушення з сервером.

**Auth:** Так

**Body:** поля створення + опційно `isSynced`, `cloudinaryPublicId`.

---

### PUT /api/violations/:id

Оновлення правопорушення.

**Auth:** Так

---

### DELETE /api/violations/:id

Видалення правопорушення.

**Auth:** Так

---

## Коди помилок

| Код | Опис |
|-----|------|
| 400 | Помилка валідації |
| 401 | Не авторизовано |
| 403 | Доступ заборонено |
| 404 | Не знайдено |
| 429 | Rate limit перевищено |
| 500 | Внутрішня помилка сервера |

**Приклад помилки:**

```json
{
  "success": false,
  "message": "Опис помилки"
}
```

---

## Rate limiting

Окремі ліміти для реєстрації, логіну, створення та читання правопорушень. При перевищенні — HTTP 429.

## Примітки

- Маршрути `/api/sync/*` закоментовані в `app.js` і наразі недоступні.
- У режимі `development` reset-токен може повертатися у відповіді forgot-password для тестування.
