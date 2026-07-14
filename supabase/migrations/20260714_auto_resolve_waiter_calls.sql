-- Create the trigger function to auto-resolve waiter requests when a session is closed or cancelled
CREATE OR REPLACE FUNCTION resolve_waiter_requests_on_session_close()
RETURNS TRIGGER AS 
BEGIN
    IF NEW.status IN ('closed', 'cancelled') AND OLD.status NOT IN ('closed', 'cancelled') THEN
        UPDATE waiter_requests
        SET status = 'completed'
        WHERE session_id = NEW.id AND status = 'pending';
    END IF;
    RETURN NEW;
END;
 LANGUAGE plpgsql;

-- Create the trigger on the table_sessions table
DROP TRIGGER IF EXISTS trigger_resolve_waiter_requests ON table_sessions;
CREATE TRIGGER trigger_resolve_waiter_requests
AFTER UPDATE OF status ON table_sessions
FOR EACH ROW
EXECUTE FUNCTION resolve_waiter_requests_on_session_close();
