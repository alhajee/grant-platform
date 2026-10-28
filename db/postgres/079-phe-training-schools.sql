-- PHE officer training distribution list (UBEC74, client 28 October 2026: "a list of schools, like TLM"). A plan whose
-- Sports, Quiz & Debate component has Training of PHE Officers lines names the schools the training is for, kept in
-- tlm_distribution with workstream 'phe' (snapshot pheDistribution, workbook sheet pheDistribution, commentable).
ALTER TABLE tlm_distribution DROP CONSTRAINT IF EXISTS tlm_distribution_workstream_check;
ALTER TABLE tlm_distribution ADD CONSTRAINT tlm_distribution_workstream_check CHECK (workstream IN ('tlm', 'curriculum', 'gscci', 'phe'));
ALTER TABLE plan_comments DROP CONSTRAINT IF EXISTS plan_comments_sheet_check;
ALTER TABLE plan_comments ADD CONSTRAINT plan_comments_sheet_check CHECK (sheet IN ('infrastructure', 'sports', 'sbmc', 'tlm', 'distribution', 'monitoring', 'gscci', 'gscciDistribution', 'curriculum', 'curriculumDistribution', 'quality', 'ict', 'teachers', 'planning', 'pheDistribution'));
