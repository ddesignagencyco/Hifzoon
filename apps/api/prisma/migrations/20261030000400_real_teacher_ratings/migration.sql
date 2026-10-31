-- The seed gave every approved teacher an invented 4.8 rating from 12 reviews. Ratings
-- are now derived only from real family reviews (the same rule as QaService).
UPDATE "teacher_profile" tp
SET "rating_avg"        = COALESCE(r.avg_stars, 0),
    "rating_count"      = COALESCE(r.n, 0),
    "public_rating_avg" = COALESCE(r.avg_stars, 0)
FROM (
  SELECT t.id AS teacher_id,
         ROUND(AVG(cr.stars)::numeric, 2) AS avg_stars,
         COUNT(cr.*)::int AS n
  FROM "teacher_profile" t
  LEFT JOIN "class_session" cs ON cs.teacher_id = t.id
  LEFT JOIN "class_review" cr ON cr.class_id = cs.id
  GROUP BY t.id
) r
WHERE tp.id = r.teacher_id;
