-- Performance indexes for the hot read paths.
--
-- 1. Annotator dashboard fetches all images for a dataset, ordered by
--    position. With many datasets this scans the table; a composite
--    index on (dataset_id, position) turns it into a single index
--    range scan.
--
-- 2. Annotator dashboard also fetches all annotations for the current
--    user. The unique (user_id, image_id) constraint already creates
--    a btree index keyed on (user_id, image_id) which we can reuse,
--    but making it explicit makes the intent clear.
--
-- 3. User lookup by name within a dataset uses `ilike`. The functional
--    unique index from migration 001 already covers this (since it
--    uses lower(name)). No new index needed.

create index if not exists images_dataset_id_position_idx
  on public.images (dataset_id, position);

-- Annotations: user_id lookup is the hot path. The unique constraint
-- gives us a (user_id, image_id) index which can serve `eq user_id`
-- queries as a prefix scan. Make it explicit.
create index if not exists annotations_user_id_image_id_idx
  on public.annotations (user_id, image_id);