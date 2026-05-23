import { getAnimationText } from './client/src/utils/api.js';
console.log('Fetching...');
getAnimationText('body', 'action_walk.bvh').then(text => {
  console.log('Success, length:', text.length);
}).catch(err => {
  console.error('Error:', err);
});
