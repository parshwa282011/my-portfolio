const API_BASE = 'http://localhost:3000';

async function testAPI() {
  console.log('Testing API endpoints...\n');
  
  try {
    // Test blog endpoint
    console.log('1. Testing /api/blog endpoint:');
    const blogRes = await fetch(`${API_BASE}/api/blog`);
    const blogs = await blogRes.json();
    console.log('Blogs:', blogs);
    
    // Test admin login
    console.log('\n2. Testing admin login:');
    const loginRes = await fetch(`${API_BASE}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'p', password: 'a' })
    });
    const loginData = await loginRes.json();
    console.log('Login response:', loginData);
    
    if (loginData.token) {
      console.log('\n3. Testing admin endpoints with token:');
      const token = loginData.token;
      
      // Test admin verify
      const verifyRes = await fetch(`${API_BASE}/api/admin/verify`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log('Admin verify:', verifyRes.ok ? 'Success' : 'Failed');
    }
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testAPI();
