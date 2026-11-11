-- Login looks users up by lowercased email; accounts provisioned with mixed case could
-- never sign in. Lowercase them, skipping any that would collide with an existing account
-- (those need a manual merge).
UPDATE "user" u
SET email = lower(u.email)
WHERE u.email IS NOT NULL
  AND u.email <> lower(u.email)
  AND NOT EXISTS (SELECT 1 FROM "user" o WHERE o.email = lower(u.email) AND o.id <> u.id);
