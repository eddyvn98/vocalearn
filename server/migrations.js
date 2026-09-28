export const SCHEMA_VERSION=2;

const CORE_SCHEMA=`
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,hash TEXT NOT NULL,salt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL REFERENCES users(id),event_id TEXT NOT NULL,payload TEXT NOT NULL,UNIQUE(user_id,event_id));
CREATE INDEX IF NOT EXISTS user_events ON events(user_id,seq);
CREATE TABLE IF NOT EXISTS devices(user_id TEXT,device_id TEXT,server_at INTEGER,client_at INTEGER,PRIMARY KEY(user_id,device_id));
`;

const RESOURCE_SCHEMA=`
CREATE TABLE IF NOT EXISTS media_files(user_id TEXT NOT NULL REFERENCES users(id),id TEXT NOT NULL,mime TEXT NOT NULL,
  size INTEGER NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(user_id,id));
CREATE INDEX IF NOT EXISTS user_media_files_created ON media_files(user_id,created);
CREATE TABLE IF NOT EXISTS ai_jobs(user_id TEXT NOT NULL REFERENCES users(id),id TEXT NOT NULL,kind TEXT NOT NULL,word_id TEXT NOT NULL,
  input_version TEXT NOT NULL,request_key TEXT NOT NULL,input_json TEXT NOT NULL DEFAULT '{}',status TEXT NOT NULL,retry_count INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER,
  result_json TEXT,error_code TEXT,created INTEGER NOT NULL,updated INTEGER NOT NULL,PRIMARY KEY(user_id,id),UNIQUE(user_id,kind,word_id,request_key));
CREATE INDEX IF NOT EXISTS user_ai_jobs ON ai_jobs(user_id,word_id,updated);
`;

function version(db){
  return Number(db.prepare('PRAGMA user_version').get()?.user_version||0);
}
function ensureAiColumns(db){
  const table=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ai_jobs'").get();
  if(!table)return;
  const columns=new Set(db.prepare('PRAGMA table_info(ai_jobs)').all().map(row=>row.name));
  if(!columns.has('input_json'))db.exec("ALTER TABLE ai_jobs ADD COLUMN input_json TEXT NOT NULL DEFAULT '{}'");
}
export function migrateDatabase(db){
  const current=version(db);
  if(current>SCHEMA_VERSION)throw new Error(`Database schema ${current} is newer than supported ${SCHEMA_VERSION}`);
  db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
  try{
    if(current<1)db.exec(CORE_SCHEMA);
    if(current<2){db.exec(RESOURCE_SCHEMA);ensureAiColumns(db);}
    db.exec(`PRAGMA user_version=${SCHEMA_VERSION}; COMMIT`);
  }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
  return {from:current,to:SCHEMA_VERSION};
}
