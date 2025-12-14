-- PostgreSQL Triggers for Database Change Notifications
-- Setup LISTEN/NOTIFY triggers for reverse_proxy, instance, and pve_vm tables

-- Function to notify about reverse_proxy changes
CREATE OR REPLACE FUNCTION notify_reverse_proxy_changes()
RETURNS TRIGGER AS $$
DECLARE
  payload JSON;
BEGIN
  -- Determine the operation type and build payload
  IF TG_OP = 'DELETE' THEN
    payload = json_build_object(
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'id', OLD.id,
      'timestamp', EXTRACT(EPOCH FROM NOW())
    );
  ELSE
    payload = json_build_object(
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'id', NEW.id,
      'subdomain', NEW.subdomain,
      'enabled', NEW.enabled,
      'timestamp', EXTRACT(EPOCH FROM NOW())
    );
  END IF;

  -- Send notification
  PERFORM pg_notify('reverse_proxy_changes', payload::text);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Function to notify about instance changes
CREATE OR REPLACE FUNCTION notify_instance_changes()
RETURNS TRIGGER AS $$
DECLARE
  payload JSON;
BEGIN
  -- Determine the operation type and build payload
  IF TG_OP = 'DELETE' THEN
    payload = json_build_object(
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'id', OLD.id,
      'timestamp', EXTRACT(EPOCH FROM NOW())
    );
  ELSE
    payload = json_build_object(
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'id', NEW.id,
      'name', NEW.name,
      'status', NEW.status,
      'timestamp', EXTRACT(EPOCH FROM NOW())
    );
  END IF;

  -- Send notification
  PERFORM pg_notify('instance_changes', payload::text);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Function to notify about pve_vm changes
CREATE OR REPLACE FUNCTION notify_pve_vm_changes()
RETURNS TRIGGER AS $$
DECLARE
  payload JSON;
BEGIN
  -- Determine the operation type and build payload
  IF TG_OP = 'DELETE' THEN
    payload = json_build_object(
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'id', OLD.id,
      'timestamp', EXTRACT(EPOCH FROM NOW())
    );
  ELSE
    payload = json_build_object(
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'id', NEW.id,
      'vmId', NEW."vmId",
      'status', NEW.status,
      'timestamp', EXTRACT(EPOCH FROM NOW())
    );
  END IF;

  -- Send notification
  PERFORM pg_notify('pve_vm_changes', payload::text);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS reverse_proxy_changes_trigger ON reverse_proxy;
DROP TRIGGER IF EXISTS instance_changes_trigger ON instance;
DROP TRIGGER IF EXISTS pve_vm_changes_trigger ON pve_vm;

-- Create triggers for reverse_proxy table
CREATE TRIGGER reverse_proxy_changes_trigger
AFTER INSERT OR UPDATE OR DELETE ON reverse_proxy
FOR EACH ROW
EXECUTE FUNCTION notify_reverse_proxy_changes();

-- Create triggers for instance table
CREATE TRIGGER instance_changes_trigger
AFTER INSERT OR UPDATE OR DELETE ON instance
FOR EACH ROW
EXECUTE FUNCTION notify_instance_changes();

-- Create triggers for pve_vm table
CREATE TRIGGER pve_vm_changes_trigger
AFTER INSERT OR UPDATE OR DELETE ON pve_vm
FOR EACH ROW
EXECUTE FUNCTION notify_pve_vm_changes();

-- Verify triggers were created
SELECT 
    trigger_name,
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE trigger_name IN (
    'reverse_proxy_changes_trigger',
    'instance_changes_trigger',
    'pve_vm_changes_trigger'
)
ORDER BY event_object_table;
