import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recoveryStatus} from '../core/recovery.js';
test('recovery status',()=>{const s=recoveryStatus({inBook:true,evidence:[]},0);assert.equal(s.remaining,2);assert.equal(s.needsRecall,true);});
