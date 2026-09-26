export const SCHEMA_VERSION=3;
const migrations=[
  {version:1,sql:`
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,hash TEXT NOT NULL,salt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL REFERENCES users(id),event_id TEXT NOT NULL,payload TEXT NOT NULL,UNIQUE(user_id,event_id));
    CREATE INDEX IF NOT EXISTS user_events ON events(user_id,seq);
    CREATE TABLE IF NOT EXISTS devices(user_id TEXT,device_id TEXT,server_at INTEGER,client_at INTEGER,PRIMARY KEY(user_id,device_id));
  `},
  {version:2,sql:`
    CREATE TABLE IF NOT EXISTS media(
      user_id TEXT NOT NULL REFERENCES users(id),
      media_id TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      bytes BLOB NOT NULL,
      created INTEGER NOT NULL,
      PRIMARY KEY(user_id,media_id)
    );
    CREATE INDEX IF NOT EXISTS user_media ON media(user_id);
  `},
  {version:3,sql:`
    CREATE TABLE IF NOT EXISTS password_reset_tokens(
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      expires INTEGER NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS reset_user ON password_reset_tokens(user_id,expires);
  `}
];
export function schemaVersion(db){
  const exists=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get();
  if(!exists)return 0;
  return Number(db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_migrations').get().version||0);
}
export function applyMigrations(db,now=Date.now()){
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,applied_at INTEGER NOT NULL);');
  const applied=new Set(db.prepare('SELECT version FROM schema_migrations').all().map(row=>Number(row.version)));
  db.exec('BEGIN IMMEDIATE');
  try{
    for(const migration of migrations){
      if(applied.has(migration.version))continue;
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)').run(migration.version,now);
    }
    db.exec(`PRAGMA user_version=${SCHEMA_VERSION};`);
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  const version=schemaVersion(db);
  if(version!==SCHEMA_VERSION)throw new Error(`Database schema is ${version}; expected ${SCHEMA_VERSION}`);
  return version;
}
