# Auto-Knowledge Injection — Design Spec

> **For agentic workers:** This is a design spec, not an implementation plan. Use `superpowers:writing-plans` to create the implementation plan from this spec.

**Goal:** When any issue is created, automatically tag it with domain keywords, query the knowledge base for matching entries, and post them as a "Required Reading" comment — so agents never start cold.

**Trigger:** DIRA-177 exposed that agents don't reliably search the knowledge base before starting work (Step 0.5 is manual and agents choose wrong tags). This system removes human/agent choice — knowledge comes to the issue, not the other way around.

---

## Architecture

```
INSERT INTO forge.issues (title, description, ...)
  → Postgres trigger: trg_auto_knowledge_inject (AFTER INSERT)
    → Function: fn_auto_knowledge_inject()
      1. Combine title + description → lowercase text blob
      2. Scan against forge.tag_keywords for matching domain tags
      3. Scan against forge.file_tag_mappings for file path patterns
      4. UPDATE forge.issues SET tags = matched_tags
      5. SELECT from forge.knowledge WHERE tags overlap AND confidence != 'disproven'
      6. INSERT formatted markdown comment into forge.issue_comments
```

No application code changes to creation paths. Fires on every INSERT regardless of source (dashboard, agent API, raw SQL).

---

## Schema Changes

### 1. Add `tags` column to `forge.issues`

```sql
ALTER TABLE forge.issues ADD COLUMN IF NOT EXISTS tags text[];
CREATE INDEX IF NOT EXISTS idx_issues_tags ON forge.issues USING GIN (tags);
```

### 2. Create `forge.tag_keywords` lookup table

```sql
CREATE TABLE forge.tag_keywords (
  tag text PRIMARY KEY,
  keywords text[] NOT NULL
);

INSERT INTO forge.tag_keywords (tag, keywords) VALUES
  ('maplibre',        ARRAY['maplibre', 'mgl', 'mlnmap', 'mlnshape', 'mlnsource', 'mlnstyle', 'mlnlayer', 'basemap', 'label', 'layer', 'opacity', 'render', 'style-layer', 'symbol', 'text-opacity']),
  ('map-rendering',   ARRAY['font', 'glyph', 'glyphs', 'render', 'pixel', 'visual', 'cleanup', 'clutter', 'tile', 'raster']),
  ('satellite',       ARRAY['satellite', 'satellite-style', 'mapbox']),
  ('ferrostar',       ARRAY['ferrostar', 'ferronavigation', 'turn-by-turn']),
  ('valhalla',        ARRAY['valhalla', 'routing', 'route']),
  ('navigation',      ARRAY['navigation', 'nav', 'turncard', 'turncardview']),
  ('poi',             ARRAY['poi', 'waypoint', 'trailhead', 'proximity', 'annotation']),
  ('trail-detection', ARRAY['traildetection', 'ontrail', 'off-trail', 'offtrail', 'trail detection', 'trail']),
  ('hud',             ARRAY['hud', 'hudview', 'turncardview', 'speedbadge', 'beacon']),
  ('ios',             ARRAY['swift', 'xcode', 'xcuitest', 'uikit', 'swiftui', 'simulator']),
  ('supabase',        ARRAY['supabase', 'postgres', 'rls', 'postgrest']),
  ('gpx',             ARRAY['gpx', 'gps', 'location', 'coordinate', 'clocation']),
  ('ride-recording',  ARRAY['ride', 'recording', 'breadcrumb', 'track', 'riderecording']),
  ('zoom',            ARRAY['zoom', 'minzoom', 'maxzoom', 'zoomlevel', 'minimumzoomlevel']),
  ('difficulty',      ARRAY['difficulty', 'easy', 'moderate', 'hard', 'expert', 'singletrack']);
```

### 3. Create `forge.file_tag_mappings` lookup table

```sql
CREATE TABLE forge.file_tag_mappings (
  file_pattern text PRIMARY KEY,
  tag text NOT NULL REFERENCES forge.tag_keywords(tag)
);

INSERT INTO forge.file_tag_mappings (file_pattern, tag) VALUES
  ('mapcoordinator',       'maplibre'),
  ('mapstylemanager',      'maplibre'),
  ('mapstylejson',         'map-rendering'),
  ('traildetection',       'trail-detection'),
  ('trailstyleconfiguration', 'trail-detection'),
  ('navigationhud',        'hud'),
  ('turncardview',         'hud'),
  ('ferrostarnav',         'navigation'),
  ('riderecording',        'ride-recording'),
  ('offlinemapservice',    'maplibre'),
  ('traillayers',          'maplibre'),
  ('poiproximity',         'poi');
```

### 4. Create `forge.trigger_errors` log table

```sql
CREATE TABLE forge.trigger_errors (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  trigger_name text NOT NULL,
  issue_id uuid,
  error_message text,
  created_at timestamptz DEFAULT now()
);
```

---

## Trigger Function

```sql
CREATE OR REPLACE FUNCTION forge.fn_auto_knowledge_inject()
RETURNS TRIGGER AS $$
DECLARE
  combined_text text;
  matched_tags text[] := '{}';
  knowledge_entries record;
  comment_body text := '';
  entry_count int := 0;
  tag_row record;
  file_row record;
BEGIN
  -- Never block issue creation
  BEGIN
    -- 1. Combine title + description, lowercase
    combined_text := lower(NEW.title || ' ' || COALESCE(NEW.description, ''));

    -- 2. Scan tag_keywords for matches
    FOR tag_row IN SELECT tag, keywords FROM forge.tag_keywords LOOP
      IF EXISTS (
        SELECT 1 FROM unnest(tag_row.keywords) kw
        WHERE combined_text LIKE '%' || kw || '%'
      ) THEN
        matched_tags := array_append(matched_tags, tag_row.tag);
      END IF;
    END LOOP;

    -- 3. Scan file_tag_mappings for file path matches
    FOR file_row IN SELECT file_pattern, tag FROM forge.file_tag_mappings LOOP
      IF combined_text LIKE '%' || file_row.file_pattern || '%' THEN
        IF NOT file_row.tag = ANY(matched_tags) THEN
          matched_tags := array_append(matched_tags, file_row.tag);
        END IF;
      END IF;
    END LOOP;

    -- 4. Update issue tags
    IF array_length(matched_tags, 1) > 0 THEN
      UPDATE forge.issues SET tags = matched_tags WHERE id = NEW.id;
    END IF;

    -- 5. Query knowledge base for matching entries
    --    Proven first, then suspected. Max 5.
    FOR knowledge_entries IN
      SELECT title, body, tags, confidence
      FROM forge.knowledge
      WHERE tags && matched_tags
        AND confidence != 'disproven'
        AND company_id = NEW.company_id
      ORDER BY
        CASE confidence WHEN 'proven' THEN 0 ELSE 1 END,
        created_at DESC
      LIMIT 5
    LOOP
      entry_count := entry_count + 1;
      comment_body := comment_body || E'\n### ' || entry_count || '. '
        || knowledge_entries.title
        || ' (' || COALESCE(knowledge_entries.confidence, 'unknown') || ')'
        || E'\n'
        || left(COALESCE(knowledge_entries.body, ''), 150)
        || CASE WHEN length(COALESCE(knowledge_entries.body, '')) > 150 THEN '...' ELSE '' END
        || E'\n**Tags:** ' || array_to_string(knowledge_entries.tags, ', ')
        || E'\n';
    END LOOP;

    -- 6. Post comment if we found matches
    IF entry_count > 0 THEN
      comment_body := '## Required Reading (' || entry_count || ' entries)'
        || E'\nAuto-injected based on tags: **' || array_to_string(matched_tags, ', ') || '**'
        || E'\n'
        || comment_body
        || E'\n---\n_Search the knowledge base for these tags if you need more context._';

      INSERT INTO forge.issue_comments (issue_id, company_id, body, author_user_id)
      VALUES (NEW.id, NEW.company_id, comment_body, 'system');
    END IF;

  EXCEPTION WHEN OTHERS THEN
    -- Log error but never block issue creation
    INSERT INTO forge.trigger_errors (trigger_name, issue_id, error_message)
    VALUES ('auto_knowledge_inject', NEW.id, SQLERRM);
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_knowledge_inject
  AFTER INSERT ON forge.issues
  FOR EACH ROW
  EXECUTE FUNCTION forge.fn_auto_knowledge_inject();
```

---

## Dashboard Change

**File:** `dashboard/src/app/issues/[id]/IssueTabs.tsx`

Add rendering for `author_user_id = 'system'` comments:

- **Icon:** Gray gear icon
- **Label:** "Knowledge Bot"
- **Style:** Light gray background to distinguish from human/agent comments

---

## Keyword Maintenance

The `forge.tag_keywords` table is the single source of truth. To add new keywords:

```sql
UPDATE forge.tag_keywords
SET keywords = array_append(keywords, 'new-keyword')
WHERE tag = 'maplibre';
```

**Audit routine:** The Knowledge Synthesizer should check monthly:
```sql
-- Knowledge entries with tags that have no keywords mapping
SELECT DISTINCT unnest(k.tags) as orphan_tag
FROM forge.knowledge k
WHERE NOT EXISTS (
  SELECT 1 FROM forge.tag_keywords tk WHERE tk.tag = unnest(k.tags)
);
```

---

## What This Does NOT Do

- Does not assign issues to agents
- Does not choose which specialist should work on it
- Does not modify the issue description or acceptance criteria
- Does not fire on UPDATE (INSERT only)
- Does not inject agent LESSONS.md (that's Phase 2)
- Does not link similar past issues (that's Phase 2)
- Does not backfill existing issues (can be done as a one-time script)

---

## Verification

### Test 1: DIRA-177 replay
Create issue: *"BUG: Trail system names and trail labels hidden by hideBasemapClutter cleanup"*

Expected tags: `[maplibre, map-rendering, trail-detection]`
Expected knowledge injected:
1. "MapLibre style JSON missing glyphs URL = no text labels render" (proven)
2. "MLNMapView.visibleFeatures returns empty for MLNShapeSource" (proven)
3. "Simulator tests give false confidence" (proven)

### Test 2: Non-map issue
Create issue: *"Ride recording stops after 5 minutes in background"*

Expected tags: `[ride-recording, gpx]`
Expected knowledge: any ride-recording tagged entries

### Test 3: No-match issue
Create issue: *"Update the app icon"*

Expected tags: `[]`
Expected comment: none (no noise)

### Test 4: File-path matching
Create issue: *"MapCoordinator+TrailLayers.swift crashes on style reload"*

Expected tags: `[maplibre]` (from file pattern match)
Expected knowledge: maplibre-tagged entries

### Test 5: Error resilience
Temporarily break the trigger function. Create an issue.
Expected: issue created successfully, error logged to `forge.trigger_errors`.
