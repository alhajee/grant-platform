BEGIN;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS enrolment_male INTEGER NOT NULL DEFAULT 0 CHECK (enrolment_male >= 0);
ALTER TABLE schools ADD COLUMN IF NOT EXISTS enrolment_female INTEGER NOT NULL DEFAULT 0 CHECK (enrolment_female >= 0);
ALTER TABLE schools ADD COLUMN IF NOT EXISTS latitude TEXT NOT NULL DEFAULT '';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS longitude TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS infrastructure_packages (
 id SERIAL PRIMARY KEY, plan_id INTEGER NOT NULL REFERENCES action_plans(id) ON DELETE CASCADE,
 school_id INTEGER NOT NULL REFERENCES schools(id), kind TEXT NOT NULL CHECK(kind IN ('new','whole','furniture')),
 version INTEGER NOT NULL DEFAULT 1, input JSONB NOT NULL, result JSONB NOT NULL,
 total_cost NUMERIC(18,2) NOT NULL CHECK(total_cost>=0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS infrastructure_packages_plan ON infrastructure_packages(plan_id);
CREATE TABLE IF NOT EXISTS infrastructure_documents (
 id UUID PRIMARY KEY, plan_id INTEGER NOT NULL REFERENCES action_plans(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('drawings','boq','survey','land','photo')),
 name TEXT NOT NULL, media_type TEXT NOT NULL, content BYTEA NOT NULL,
 size INTEGER NOT NULL CHECK(size>0 AND size<=5242880), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMIT;
