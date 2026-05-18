-- Migration 007: Create notification architecture for internal event governance
-- Supports future integrations with Zoho CRM, n8n, email/SMS workers, and AI orchestration

CREATE TABLE IF NOT EXISTS system_events (
  id SERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  payload JSONB NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS system_events_event_type_idx ON system_events(event_type);
CREATE INDEX IF NOT EXISTS system_events_entity_type_idx ON system_events(entity_type);
CREATE INDEX IF NOT EXISTS system_events_entity_id_idx ON system_events(entity_id);
CREATE INDEX IF NOT EXISTS system_events_created_at_idx ON system_events(created_at);

CREATE TABLE IF NOT EXISTS notification_queue (
  id SERIAL PRIMARY KEY,
  event_id INTEGER REFERENCES system_events(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  recipient_role TEXT,
  recipient_user_id INTEGER REFERENCES users(id),
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED')),
  retry_count INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMP,
  processed_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS notification_queue_status_idx ON notification_queue(status);
CREATE INDEX IF NOT EXISTS notification_queue_recipient_user_id_idx ON notification_queue(recipient_user_id);
CREATE INDEX IF NOT EXISTS notification_queue_notification_type_idx ON notification_queue(notification_type);
CREATE INDEX IF NOT EXISTS notification_queue_created_at_idx ON notification_queue(created_at);
