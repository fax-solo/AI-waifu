import { resolveAnimation } from './server/src/services/animationResolver.js';

console.log('Test 1:', resolveAnimation('can you dance version 2', 'sure!', 'happy'));
console.log('Test 2:', resolveAnimation('do joy v3', '', 'happy'));
