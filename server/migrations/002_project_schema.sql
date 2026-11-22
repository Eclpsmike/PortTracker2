CREATE TABLE projects (
  id uuid PRIMARY KEY,
  legacy_id text NOT NULL UNIQUE,
  name text NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  data jsonb NOT NULL DEFAULT '{}',
  configuration jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE buildings (
  id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  legacy_id text NOT NULL, name text NOT NULL, data jsonb NOT NULL,
  UNIQUE(project_id,legacy_id), UNIQUE(project_id,id)
);
CREATE TABLE distribution_frames (
  id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  building_id uuid NOT NULL, legacy_id text NOT NULL, name text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('IDF','MDF')), data jsonb NOT NULL, layout_data jsonb NOT NULL,
  FOREIGN KEY(project_id,building_id) REFERENCES buildings(project_id,id),
  UNIQUE(project_id,legacy_id), UNIQUE(project_id,id)
);
CREATE TABLE racks (
  id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  frame_id uuid NOT NULL, legacy_id text NOT NULL, label text NOT NULL,
  height_u integer NOT NULL CHECK(height_u BETWEEN 1 AND 100), data jsonb NOT NULL,
  FOREIGN KEY(project_id,frame_id) REFERENCES distribution_frames(project_id,id),
  UNIQUE(frame_id,legacy_id), UNIQUE(project_id,id)
);
CREATE TABLE equipment_templates (
  id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  legacy_id text NOT NULL, name text NOT NULL, active boolean NOT NULL DEFAULT true,
  UNIQUE(project_id,legacy_id), UNIQUE(project_id,id)
);
CREATE TABLE template_revisions (
  id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  template_id uuid NOT NULL, revision integer NOT NULL CHECK(revision>0), digest text NOT NULL,
  definition jsonb NOT NULL, source_yaml text, source_metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(project_id,template_id) REFERENCES equipment_templates(project_id,id),
  UNIQUE(template_id,revision), UNIQUE(template_id,digest), UNIQUE(project_id,id)
);
CREATE FUNCTION prevent_revision_edit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Published template revisions are immutable'; END;
$$;
CREATE TRIGGER immutable_template_revision BEFORE UPDATE ON template_revisions FOR EACH ROW EXECUTE FUNCTION prevent_revision_edit();
CREATE TABLE template_revision_ports (
  id uuid PRIMARY KEY, revision_id uuid NOT NULL REFERENCES template_revisions(id) ON DELETE CASCADE,
  port_identity uuid NOT NULL, slot integer NOT NULL CHECK(slot>=0), name text NOT NULL,
  face text NOT NULL CHECK(face IN ('front','rear')),
  x double precision NOT NULL CHECK(x>=0 AND x<=1), y double precision NOT NULL CHECK(y>=0 AND y<=1),
  width double precision NOT NULL CHECK(width>0 AND width<=1), height double precision NOT NULL CHECK(height>0 AND height<=1),
  data jsonb NOT NULL,
  CHECK(x-width/2>=-0.000000001 AND x+width/2<=1.000000001 AND y-height/2>=-0.000000001 AND y+height/2<=1.000000001),
  UNIQUE(revision_id,slot), UNIQUE(revision_id,port_identity)
);
CREATE TRIGGER immutable_template_ports BEFORE UPDATE ON template_revision_ports FOR EACH ROW EXECUTE FUNCTION prevent_revision_edit();
CREATE TABLE equipment (
  id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rack_id uuid NOT NULL, legacy_id text NOT NULL, label text NOT NULL,
  template_revision_id uuid, bottom_u integer NOT NULL CHECK(bottom_u>0), height_u integer NOT NULL CHECK(height_u>0), data jsonb NOT NULL,
  FOREIGN KEY(project_id,rack_id) REFERENCES racks(project_id,id),
  FOREIGN KEY(project_id,template_revision_id) REFERENCES template_revisions(project_id,id),
  UNIQUE(rack_id,legacy_id), UNIQUE(project_id,id)
);
CREATE TABLE device_ports (
  id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  equipment_id uuid NOT NULL, slot integer NOT NULL CHECK(slot>=0), number integer NOT NULL CHECK(number>=0),
  vlan integer CHECK(vlan BETWEEN 1 AND 4094), details jsonb, media jsonb,
  FOREIGN KEY(project_id,equipment_id) REFERENCES equipment(project_id,id),
  UNIQUE(equipment_id,slot), UNIQUE(equipment_id,number), UNIQUE(project_id,id)
);
CREATE TABLE cables (
  id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  frame_id uuid NOT NULL, legacy_id text NOT NULL, data jsonb NOT NULL,
  FOREIGN KEY(project_id,frame_id) REFERENCES distribution_frames(project_id,id),
  UNIQUE(frame_id,legacy_id), UNIQUE(project_id,id)
);
CREATE TABLE cable_endpoints (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cable_id uuid NOT NULL, side text NOT NULL CHECK(side IN ('from','to')), port_id uuid NOT NULL,
  FOREIGN KEY(project_id,cable_id) REFERENCES cables(project_id,id) ON DELETE CASCADE,
  FOREIGN KEY(project_id,port_id) REFERENCES device_ports(project_id,id),
  PRIMARY KEY(cable_id,side), UNIQUE(project_id,port_id)
);
CREATE TABLE floors (
  id uuid PRIMARY KEY, project_id uuid NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  legacy_id text NOT NULL, building_name text NOT NULL, name text NOT NULL, data jsonb NOT NULL,
  UNIQUE(project_id,id)
);
CREATE TABLE floor_layers (
  id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  floor_id uuid NOT NULL, legacy_id text NOT NULL, position integer NOT NULL, data jsonb NOT NULL,
  FOREIGN KEY(project_id,floor_id) REFERENCES floors(project_id,id), UNIQUE(floor_id,legacy_id), UNIQUE(project_id,id)
);
CREATE TABLE map_objects (
  id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  floor_id uuid NOT NULL, layer_id uuid NOT NULL, legacy_id text NOT NULL, position integer NOT NULL,
  kind text NOT NULL, x double precision NOT NULL, y double precision NOT NULL, data jsonb NOT NULL,
  FOREIGN KEY(project_id,floor_id) REFERENCES floors(project_id,id), FOREIGN KEY(project_id,layer_id) REFERENCES floor_layers(project_id,id),
  UNIQUE(floor_id,legacy_id), UNIQUE(project_id,id)
);
CREATE TABLE map_ports (
  id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  object_id uuid NOT NULL, legacy_id text NOT NULL, position integer NOT NULL, device_port_id uuid, data jsonb NOT NULL,
  FOREIGN KEY(project_id,object_id) REFERENCES map_objects(project_id,id),
  FOREIGN KEY(project_id,device_port_id) REFERENCES device_ports(project_id,id),
  UNIQUE(object_id,legacy_id)
);
CREATE TABLE project_events (
  id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  revision integer NOT NULL, action text NOT NULL, actor text NOT NULL, summary jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX equipment_rack ON equipment(rack_id);
CREATE INDEX device_ports_vlan ON device_ports(project_id,vlan);
CREATE INDEX map_objects_kind ON map_objects(project_id,kind);
CREATE INDEX events_project ON project_events(project_id,created_at);
