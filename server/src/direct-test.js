import 'dotenv/config';
import { chat } from './services/gemini.js';

async function test() {
  console.log('Testing Gemini API with key from .env...');
  try {
    const response = await chat({
      systemPrompt: 'You are a helpful assistant.',
      userMessage: 'Say hello!',
      history: []
    });
    console.log('SUCCESS! Response:', response);
  } catch (error) {
    console.error('FAILURE!', error.message);
  }
}

test();
