import 'dotenv/config';

async function testFetch() {
  const key = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${key}`;
  
  console.log('Testing raw fetch to v1 endpoint...');
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'hi' }] }]
      })
    });
    const data = await response.json();
    if (response.ok) {
      console.log('SUCCESS with v1:', data.candidates[0].content.parts[0].text);
    } else {
      console.error('FAILED with v1:', JSON.stringify(data, null, 2));
    }
  } catch (e) {
    console.error('FETCH ERROR:', e.message);
  }
}

testFetch();
