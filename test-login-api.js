async function testLogin() {
    try {
        const response = await fetch('http://localhost:3000/api/schools/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'test', password: 'test' })
        });
        const data = await response.json();
        console.log('Status:', response.status);
        console.log('Data:', data);
    } catch (e) {
        console.error('Fetch error:', e);
    }
}
testLogin();
