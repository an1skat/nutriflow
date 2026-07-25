# NutriFlow API

## Railway: automatic day closure

Run automatic closure as a separate Railway Cron Service connected to the same repository
and MongoDB as the API:

- Root directory: `/apps/api`
- Start command: `python -m app.scripts.close_due_days`
- Cron schedule: `*/15 * * * *`
- Public domain: none
- Replicas: one

Railway evaluates the schedule in UTC. The command itself checks `Europe/Kyiv` and only
closes the current day at or after 18:00; overdue days are closed on the next successful run.
The command exits after every run, so it must not be used as an API start command.

Copy the API database and application variables to the Cron Service. To send closure
notifications, configure:

```dotenv
MAIL_ENABLED=true
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=notifications@example.com
SMTP_PASSWORD=replace-with-smtp-password
SMTP_SECURITY=starttls
SMTP_FROM_EMAIL=notifications@example.com
```

The operation is idempotent. Closing and enqueueing its email happen in one atomic MongoDB
update; successful SMTP delivery clears the pending flag, while failures remain pending for
the next Cron run.
