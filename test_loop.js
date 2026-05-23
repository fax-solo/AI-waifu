import { resolveAnimation } from './server/src/services/animationResolver.js';

console.log(resolveAnimation('i will walk', '', 'happy', 'action_walk.bvh'));
console.log(resolveAnimation('dance for me', '', 'happy', 'dance_2.bvh'));
