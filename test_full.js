import { resolveAnimation } from './server/src/services/animationResolver.js';
const result = resolveAnimation('dance', '', 'happy', 'dance_2.bvh');
console.log(result);
