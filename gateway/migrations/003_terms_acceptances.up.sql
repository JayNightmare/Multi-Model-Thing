-- One row per user and Terms/Privacy version they accepted at sign-in.
CREATE TABLE IF NOT EXISTS terms_acceptances (
  login VARCHAR NOT NULL,
  version VARCHAR NOT NULL,
  accepted_at TIMESTAMP NOT NULL,
  PRIMARY KEY (login, version)
);
