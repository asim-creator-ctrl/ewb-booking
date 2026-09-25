-- Phase 4: confirmBookingByOrderId calls next_booking_ref() via RPC using the
-- service-role client. PostgREST only exposes a function over RPC to roles
-- that have been explicitly granted EXECUTE on it.
grant execute on function next_booking_ref() to service_role;
