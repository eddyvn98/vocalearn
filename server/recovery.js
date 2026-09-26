import {randomBytes} from 'node:crypto';
import {digest,normalizeEmail,passwordRecord,validatePassword} from './auth.js';
const cleanup=(db,now)=>db.prepare('DELETE FROM password_reset_tokens WHERE expires<? OR used=1').run(now);
export async function requestPasswordReset(db,email,config,{now=Date.now(),fetchImpl=globalThis.fetch}={}){
  cleanup(db,now);
  const user=db.prepare('SELECT id,email FROM users WHERE email=?').get(normalizeEmail(email));
  if(!user||config.mode==='disabled')return {issued:false};
  const token=randomBytes(32).toString('hex'),expires=now+config.ttlMs;
  db.prepare('DELETE FROM password_reset_tokens WHERE user_id=?').run(user.id);
  db.prepare('INSERT INTO password_reset_tokens(token_hash,user_id,expires,used,created) VALUES(?,?,?,?,?)')
    .run(digest(token),user.id,expires,0,now);
  const resetUrl=`${config.appOrigin}/reset-password?token=${encodeURIComponent(token)}`;
  if(config.mode==='return-token')return {issued:true,debugToken:token,resetUrl,expires};
  try{
    const response=await fetchImpl(config.providerUrl,{
      method:'POST',
      headers:{'Content-Type':'application/json',...(config.providerToken?{Authorization:`Bearer ${config.providerToken}`}:{})},
      body:JSON.stringify({type:'vocalearn.password-reset',email:user.email,resetUrl,expiresAt:new Date(expires).toISOString()})
    });
    if(!response.ok)throw new Error(`Provider returned ${response.status}`);
    return {issued:true,expires};
  }catch(error){
    db.prepare('DELETE FROM password_reset_tokens WHERE token_hash=?').run(digest(token));
    return {issued:false,deliveryError:error.message};
  }
}
export async function confirmPasswordReset(db,token,password,now=Date.now()){
  validatePassword(password);
  const tokenHash=digest(String(token||''));
  const row=db.prepare('SELECT token_hash,user_id,expires,used FROM password_reset_tokens WHERE token_hash=?').get(tokenHash);
  if(!row||row.used||row.expires<now)throw new Error('Reset link is invalid or expired');
  const record=await passwordRecord(password);
  db.exec('BEGIN IMMEDIATE');
  try{
    db.prepare('UPDATE users SET hash=?,salt=? WHERE id=?').run(record.hash,record.salt,row.user_id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.user_id);
    db.prepare('UPDATE password_reset_tokens SET used=1 WHERE token_hash=?').run(tokenHash);
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  return {ok:true};
}
