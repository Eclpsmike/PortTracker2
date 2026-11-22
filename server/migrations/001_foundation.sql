CREATE TABLE service_metadata (
  name text PRIMARY KEY,
  value text NOT NULL
);
INSERT INTO service_metadata(name,value) VALUES ('application','PortTracker');
