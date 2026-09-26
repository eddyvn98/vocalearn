export function reminderPlan(settings,deviceId,day,permission='unsupported',localShown=false){
  if(!settings?.reminder||localShown)return {action:'none',primary:false};
  const primary=Boolean(settings.reminderPrimaryDevice&&settings.reminderPrimaryDevice===deviceId);
  if(primary&&settings.reminderLastDay===day)return {action:'none',primary:true};
  if(primary&&permission==='granted')return {action:'notification',primary:true};
  return {action:'in-app',primary};
}
