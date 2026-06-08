# Як долучитись

Дякуємо за інтерес до проєкту!

## Процес

1. Зробіть fork репозиторію
2. Створіть гілку: `git checkout -b feature/my-feature`
3. Внесіть зміни та закоміть (рекомендуємо [Conventional Commits](https://www.conventionalcommits.org/))
4. Переконайтесь, що локально все працює: `npm run dev`
5. Відкрийте Pull Request у гілку `main`

## Правила

- Не комітьте `.env`, логи (`logs/`) або завантажені файли (`uploads/`)
- Не змінюйте бізнес-логіку без обговорення в issue
- Для нових API-ендпоінтів оновлюйте `docs/API.md`

## Локальний запуск

```bash
cp .env.example .env
# заповніть обов'язкові змінні
npm install
npm run dev
```

Health check: `GET http://localhost:3000/api/health`

## Питання

Створіть [issue](https://github.com/meleudas/citizen_back/issues/new/choose) з описом питання.
