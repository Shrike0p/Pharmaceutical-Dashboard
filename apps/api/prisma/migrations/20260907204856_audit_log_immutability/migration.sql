-- Make the audit trail append-only at the database level.
--
-- The application never issues an UPDATE or DELETE against audit_logs, but
-- "the application does not do that" is a convention. In a regulated context
-- the trail has to hold even against a future code change, a migration script,
-- or somebody at a psql prompt — so the guarantee belongs in the database.
--
-- Scope note: this blocks row-level tampering (UPDATE/DELETE). TRUNCATE does
-- not fire row-level triggers and is deliberately left available, because the
-- test suite and the seed script need to reset the database; it requires table
-- ownership, so it stays an explicit administrative act rather than something
-- ordinary application code can reach. See NOTES.md.

CREATE OR REPLACE FUNCTION reject_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'audit_logs is append-only: % is not permitted on this table', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER audit_logs_reject_update
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION reject_audit_log_mutation();

CREATE TRIGGER audit_logs_reject_delete
  BEFORE DELETE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION reject_audit_log_mutation();
