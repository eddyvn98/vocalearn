import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reminderPlan} from '../core/reminders.js';

const settings={reminder:true,reminderPrimaryDevice:'device-a',reminderLastDay:''};

test('AT-31 primary device uses a browser notification when permission is granted',()=>{
  assert.deepEqual(reminderPlan(settings,'device-a','2026-09-26','granted',false),
    {action:'notification',primary:true});
});

test('AT-31 denied notification permission falls back to in-app on the primary device',()=>{
  assert.deepEqual(reminderPlan(settings,'device-a','2026-09-26','denied',false),
    {action:'in-app',primary:true});
});

test('AT-31 non-primary devices only use in-app reminders',()=>{
  assert.deepEqual(reminderPlan(settings,'device-b','2026-09-26','granted',false),
    {action:'in-app',primary:false});
});

test('AT-31 one primary reminder per day is suppressed after the synced day marker',()=>{
  assert.deepEqual(reminderPlan({...settings,reminderLastDay:'2026-09-26'},'device-a','2026-09-26','granted',false),
    {action:'none',primary:true});
});

test('Local reminder display is not repeated on the same device',()=>{
  assert.deepEqual(reminderPlan(settings,'device-b','2026-09-26','granted',true),
    {action:'none',primary:false});
});
