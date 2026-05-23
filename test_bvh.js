import fs from 'fs';
import * as THREE from 'three';
import { BVHLoader } from 'three/examples/jsm/loaders/BVHLoader.js';

const text = fs.readFileSync('server/data/animations/body/action_walk.bvh', 'utf-8');
const loader = new BVHLoader();
try {
  const { clip } = loader.parse(text);
  console.log('Tracks:', clip.tracks.length);
  console.log('Duration:', clip.duration);
} catch (e) {
  console.error('Error parsing:', e);
}
