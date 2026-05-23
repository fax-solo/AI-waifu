import { resolveAnimation } from './server/src/services/animationResolver.js';

console.log('Testing explicit action:');
console.log(resolveAnimation('can you dance for me?', 'Sure, let me dance!', 'happy'));

console.log('\nTesting non-action context:');
console.log(resolveAnimation('I am running late', 'Oh no!', 'sad'));

console.log('\nTesting AI sentiment:');
console.log(resolveAnimation('Hello', 'I am so happy to see you!', 'happy'));

console.log('\nTesting Emotion fallback:');
console.log(resolveAnimation('Hello', 'Hello there', 'sad'));
