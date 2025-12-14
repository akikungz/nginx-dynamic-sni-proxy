-- Database triggers for HAProxy Dynamic Proxy
-- These triggers send notifications when reverse_proxy or instance tables are modified

-- Function to notify configuration changes
CREATE OR REPLACE FUNCTION notify_config_change()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify(
    'config_changes',
    json_build_object(
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'timestamp', NOW()
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS reverse_proxy_change ON reverse_proxy;
DROP TRIGGER IF EXISTS instance_change ON instance;

-- Trigger for reverse_proxy table changes
CREATE TRIGGER reverse_proxy_change
  AFTER INSERT OR UPDATE OR DELETE ON reverse_proxy
  FOR EACH ROW
  EXECUTE FUNCTION notify_config_change();

-- Trigger for instance table changes
CREATE TRIGGER instance_change
  AFTER INSERT OR UPDATE OR DELETE ON instance
  FOR EACH ROW
  EXECUTE FUNCTION notify_config_change();

-- Log trigger setup
DO $$
BEGIN
  RAISE NOTICE 'HAProxy configuration change triggers installed successfully';
END $$;
