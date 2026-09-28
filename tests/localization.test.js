import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {vi} from '../public/js/vi.js';

test('Vietnamese auth copy does not collide with vocabulary usage register',()=>{
  assert.equal(vi.register,'Tạo tài khoản');
  assert.equal(vi.usageRegister,'Mức độ trang trọng');
  const source=readFileSync(new URL('../public/js/vi.js',import.meta.url),'utf8');
  assert.equal((source.match(/"register"\s*:/g)||[]).length,1);
});

test('common production auth errors are localized for users',()=>{
  assert.equal(vi['Registration is disabled'],'Hiện chưa cho phép tạo tài khoản mới.');
  assert.equal(vi['Email or password is incorrect'],'Email hoặc mật khẩu không đúng.');
  assert.equal(vi['Use a valid email'],'Hãy nhập địa chỉ email hợp lệ.');
  assert.equal(vi['Use a password of 12-200 characters'],'Mật khẩu phải có từ 12 đến 200 ký tự.');
});

test('high-frequency study labels use plain Vietnamese wording',()=>{
  assert.equal(vi.game,'Dạng bài');
  assert.equal(vi.face,'Nội dung câu hỏi');
  assert.equal(vi.answerFace,'Nội dung đáp án');
  assert.equal(vi.tags,'Nhãn tự do');
  assert.equal(vi.newGraduated,'Từ mới đã hoàn tất bước học');
});
