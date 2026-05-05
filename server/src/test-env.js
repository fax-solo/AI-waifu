import 'dotenv/config';
console.log('--- ENV TEST ---');
console.log('Raw key from env:', process.env.GEMINI_API_KEY);
console.log('Length:', process.env.GEMINI_API_KEY?.length);
console.log('Starts with AIzaSy:', process.env.GEMINI_API_KEY?.startsWith('AIzaSy'));
console.log('Ends with quote:', process.env.GEMINI_API_KEY?.endsWith('"'));
console.log('--- END TEST ---');
