# Background Worker Architecture

Production-grade asynchronous notification processing system for Node.js + Express + PostgreSQL backend.

## Overview

This worker architecture provides:
- Asynchronous notification queue processing
- Duplicate processing prevention with `FOR UPDATE SKIP LOCKED`
- Exponential backoff retry logic (max 5 retries)
- Graceful shutdown handling
- Structured logging integration
- Future-ready for external service integrations

## Architecture Components

```
backend/
├── workers/
│   ├── workerManager.js     # Polling manager & lifecycle
│   └── notificationWorker.js # Individual notification processing
├── services/
│   └── workers/
│       └── queueProcessor.js # Database operations & safety
└── .env                     # Worker configuration
```

## Processing Flow

1. **Polling**: Worker manager polls `notification_queue` every 5 seconds
2. **Locking**: Fetches PENDING notifications with `FOR UPDATE SKIP LOCKED`
3. **Processing**: Marks PROCESSING, simulates external service calls
4. **Completion**: Marks SENT on success or FAILED on error
5. **Retry**: Increments retry_count, schedules retry if under limit

## Queue Safety

- **Duplicate Prevention**: `FOR UPDATE SKIP LOCKED` prevents concurrent processing
- **Transactional**: All queue operations wrapped in database transactions
- **Idempotent**: Processing same notification multiple times is safe

## Configuration

```env
# Worker Configuration
WORKER_ENABLED=true
WORKER_POLL_INTERVAL_MS=5000
```

## Notification Types

Currently processes:
- `JOB_APPROVAL_NEEDED` → Manager notifications
- `JOB_APPROVED` → Approval confirmations
- `JOB_CLOSED` → Closure notifications
- `PRICING_SUBMITTED` → Pricing notifications
- `SIGNATURE_UPLOADED` → Signature notifications
- `USER_LOGIN/LOGOUT` → Security notifications

## Future Integrations

Ready for:
- **Email Services**: SendGrid, SES, Postmark
- **SMS/WhatsApp**: Twilio, WhatsApp Business API
- **Webhooks**: Custom webhook dispatch
- **Message Queues**: Azure Service Bus, Redis, BullMQ
- **AI Orchestration**: n8n workflows, custom AI services

## Monitoring

Worker logs include:
- Worker startup/shutdown events
- Queue statistics (pending/processing/sent/failed counts)
- Individual notification processing status
- Retry attempts and failures
- Performance metrics

## Error Handling

- **Transient Failures**: Automatic retry with backoff
- **Permanent Failures**: Marked FAILED after max retries
- **System Errors**: Graceful degradation, doesn't break main app
- **Database Issues**: Transaction rollback, logged errors

## Development

```bash
# Start server (workers auto-start if WORKER_ENABLED=true)
npm start

# Disable workers for development
WORKER_ENABLED=false npm start

# Manual processing trigger (for testing)
# Access via workerManager.triggerProcessing()
```

## Production Deployment

- Set `WORKER_ENABLED=true` in production
- Configure appropriate `WORKER_POLL_INTERVAL_MS`
- Monitor logs for queue backlogs
- Scale horizontally if needed (future enhancement)
- Integrate with external services when ready