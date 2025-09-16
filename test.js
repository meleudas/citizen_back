const bcrypt = require('bcryptjs');

async function testPassword() {
  const password = 'MySecurePass123';
  const hash = '$2b$12$oeJ.WnGYI.qgzXxfb3AEiuZjoFJ0bI0TDQjafbpPQrtcRuXuCHSEy';
  
  console.log('Testing password:', password);
  console.log('Testing hash:', hash);
  
  const result = await bcrypt.compare(password, hash);
  console.log('Comparison result:', result);
  
  // Також перевіримо хешування
  const newHash = await bcrypt.hash(password, 12);
  console.log('New hash:', newHash);
  const newResult = await bcrypt.compare(password, newHash);
  console.log('New comparison result:', newResult);
}

testPassword();