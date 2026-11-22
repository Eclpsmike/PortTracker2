ALTER TABLE buildings ADD COLUMN position integer NOT NULL DEFAULT 0;
ALTER TABLE distribution_frames ADD COLUMN position integer NOT NULL DEFAULT 0;
ALTER TABLE racks ADD COLUMN position integer NOT NULL DEFAULT 0;
ALTER TABLE equipment ADD COLUMN position integer NOT NULL DEFAULT 0;
ALTER TABLE cables ADD COLUMN position integer NOT NULL DEFAULT 0;
ALTER TABLE equipment_templates ADD COLUMN position integer NOT NULL DEFAULT 0;
ALTER TABLE equipment_templates ADD COLUMN current_revision_id uuid REFERENCES template_revisions(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE projects ADD COLUMN catalog_present boolean NOT NULL DEFAULT false;
