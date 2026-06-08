# Citizen Back

![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-47A248?logo=mongodb&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue.svg)
![CI](https://github.com/meleudas/citizen_back/actions/workflows/ci.yml/badge.svg)

REST API backend для мобільного та веб застосунку **громадянського моніторингу правопорушень** — паркування, сміття, інфраструктура, безпека тощо.

## Можливості

- JWT-автентифікація (access / refresh / reset tokens)
- CRUD правопорушень з геолокацією (GeoJSON Point)
- Завантаження фото (Cloudinary або локальне сховище)
- Офлайн-синхронізація правопорушень
- Публічна статистика та фільтрація за датою / локацією
- Rate limiting, Helmet, CORS, Winston-логування
- Опційний Redis для кешування та сесій токенів

## Tech stack

| Технологія | Версія |
|------------|--------|
| Node.js | ≥ 20 |
| Express | 5.x |
| MongoDB (Mongoose) | 8.x |
| Redis | 5.x (опційно) |
| JWT | jsonwebtoken 9.x |
| Cloudinary | 2.x (опційно) |
| Winston | 3.x |

## Архітектура

```
HTTP Request
    ↓
Routes → Controllers → Services → Repositories → Models (MongoDB)
    ↓
Middleware (auth, validation, upload, error handling)
```

```
src/
├── controllers/   # HTTP-обробники
├── services/      # Бізнес-логіка
├── repositories/  # Доступ до БД
├── models/        # Mongoose-схеми
├── routes/        # Маршрути API
├── middleware/    # Auth, CORS, upload, errors
├── validators/    # express-validator правила
├── dtos/          # Форматування відповідей
└── utils/         # Допоміжні утиліти
```

## Швидкий старт

### Вимоги

- Node.js 20+
- MongoDB (локально або Atlas)
- Redis (опційно, для кешу та refresh-токенів)

### Локальний запуск

```bash
git clone https://github.com/meleudas/citizen_back.git
cd citizen_back
cp .env.example .env
# Заповніть обов'язкові змінні: MONGODB_URI, JWT_*_SECRET
npm install
npm run dev
```

Сервер запуститься на `http://localhost:3000`.

Перевірка:

```bash
curl http://localhost:3000/api/health
```

### Docker

```bash
cp .env.example .env
# Заповніть MONGODB_URI та JWT-секрети
docker-compose up -d
```

Compose піднімає Redis та додаток. MongoDB очікується зовні (Atlas або локально через `.env`).

## Змінні середовища

| Змінна | Обов'язкова | Опис |
|--------|:-----------:|------|
| `NODE_ENV` | Ні | `development` / `production` |
| `PORT` | Ні | Порт сервера (default: `3000`) |
| `HOST` | Ні | Хост (default: `0.0.0.0`) |
| `MONGODB_URI` | **Так** | URI підключення до MongoDB |
| `JWT_ACCESS_SECRET` | **Так** | Секрет access-токена |
| `JWT_REFRESH_SECRET` | **Так** | Секрет refresh-токена |
| `JWT_RESET_SECRET` | **Так** | Секрет reset-токена |
| `JWT_ACCESS_EXPIRES` | Ні | TTL access (default: `1d`) |
| `JWT_REFRESH_EXPIRES` | Ні | TTL refresh (default: `7d`) |
| `JWT_RESET_EXPIRES` | Ні | TTL reset (default: `1h`) |
| `REDIS_URL` | Ні | Redis URI для кешу |
| `CLOUDINARY_URL` | Ні | Cloudinary connection string |
| `CLOUDINARY_CLOUD_NAME` | Ні | Альтернатива CLOUDINARY_URL |
| `CLOUDINARY_API_KEY` | Ні | Альтернатива CLOUDINARY_URL |
| `CLOUDINARY_API_SECRET` | Ні | Альтернатива CLOUDINARY_URL |
| `LOCAL_STORAGE_PATH` | Ні | Локальне сховище (default: `./uploads`) |
| `BASE_URL` | Ні | Base URL для локальних файлів |
| `ALLOWED_ORIGINS` | Ні | CORS origins (comma-separated) |
| `LOG_DIR` | Ні | Директорія логів (default: `logs`) |
| `LOG_LEVEL` | Ні | Рівень логування (default: `info`) |

> **Увага:** якщо `.env` раніше був у git — обов'язково ротуйте всі секрети. Деталі в [SECURITY.md](SECURITY.md).

## API

- Повна документація: [docs/API.md](docs/API.md)
- Огляд ендпоінтів: `GET /api/docs`
- Health check: `GET /api/health`

### Авторизація

Для захищених ендпоінтів передайте заголовок:

```
Authorization: Bearer <access_token>
```

## Структура проєкту

```
citizen_back/
├── app.js                 # Express-додаток
├── server.js              # Точка входу, graceful shutdown
├── config/                # Database, logger
├── src/                   # Код API
├── docs/API.md            # Документація ендпоінтів
├── docker-compose.yml     # Redis + app
├── Dockerfile
├── .env.example           # Шаблон змінних середовища
└── .github/workflows/     # CI
```

## Скрипти

| Команда | Опис |
|---------|------|
| `npm start` | Запуск у production |
| `npm run dev` | Розробка з nodemon |
| `npm test` | Заглушка (тести — у планах) |

## Долучення

Див. [CONTRIBUTING.md](CONTRIBUTING.md).

## Ліцензія

[MIT](LICENSE) © meleudas
