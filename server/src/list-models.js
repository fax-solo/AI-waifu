import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

async function listModels() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  try {
    // There is no direct listModels in the main SDK, but we can try to fetch model info
    console.log('Testing with gemini-1.5-flash-latest...');
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
    const result = await model.generateContent('hi');
    console.log('SUCCESS with gemini-1.5-flash-latest:', result.response.text());
  } catch (e1) {
    console.error('FAILED with gemini-1.5-flash-latest:', e1.message);
    try {
      console.log('Testing with gemini-pro...');
      const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
      const result = await model.generateContent('hi');
      console.log('SUCCESS with gemini-pro:', result.response.text());
    } catch (e2) {
      console.error('FAILED with gemini-pro:', e2.message);
    }
  }
}

listModels();
