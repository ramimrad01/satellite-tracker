import * as THREE from 'three';
import * as satellite from 'satellite.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';


// Setup scene, camera, renderer (same as before)
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
camera.position.z = 4;

const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // Smooth motion
controls.dampingFactor = 0.05;
controls.enablePan = false;    // Optional: disable panning
controls.minDistance = 2;      // Optional: min zoom distance
controls.maxDistance = 100;    // Optional: max zoom distance


// Earth
const earthGeo = new THREE.SphereGeometry(1, 64, 64);
const earthMat = new THREE.MeshBasicMaterial({color:0x2233ff, wireframe:true});
const earth = new THREE.Mesh(earthGeo, earthMat);
scene.add(earth);

// Globals to hold satellites
let satrecs = [];
let satCount = 0;

// Satellite dot geometry + material
const satGeo = new THREE.SphereGeometry(0.005, 6, 6);
const satMat = new THREE.MeshBasicMaterial({color: 0xffffff});

// Create InstancedMesh with max capacity (adjust as needed)
const maxSats = 25000;
const satMesh = new THREE.InstancedMesh(satGeo, satMat, maxSats);
scene.add(satMesh);

// Temporary matrix for instance positioning
const dummy = new THREE.Object3D();
 
// Main TLE fetch + parse
async function loadTLEs() {
  try {
    const res = await fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle');
    const text = await res.text();
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    const newSatrecs = [];
    for (let i = 0; i < lines.length; i += 3) {
      const name = lines[i];
      const tle1 = lines[i + 1];
      const tle2 = lines[i + 2];
      if (tle1 && tle2) {
        const satrec = satellite.twoline2satrec(tle1, tle2);
        newSatrecs.push({ name, satrec });
      }
    }

    satrecs = newSatrecs.slice(0, maxSats); // Limit to max capacity
    console.log(`[${new Date().toLocaleTimeString()}] Loaded ${satrecs.length} satellites.`);
  } catch (err) {
    console.error('TLE fetch error:', err);
  }
}

// Position update
function updateSatellitePositions() {
  const now = new Date();
  const scale = 1 / 6371;

  for (let i = 0; i < satrecs.length; i++) {
    const { satrec } = satrecs[i];
    const posVel = satellite.propagate(satrec, now);
    if (!posVel.position) continue;

    const gmst = satellite.gstime(now);
    const posEcf = satellite.eciToEcf(posVel.position, gmst);

    dummy.position.set(posEcf.x * scale, posEcf.y * scale, posEcf.z * scale);
    dummy.updateMatrix();
    satMesh.setMatrixAt(i, dummy.matrix);
  }

  satMesh.instanceMatrix.needsUpdate = true;
}

// Animate
function animate() {
  requestAnimationFrame(animate);
  updateSatellitePositions();
  controls.update();
  renderer.render(scene, camera);
}

// Startup
await loadTLEs();
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
animate();

// Auto-refresh TLE data every 6 hours
setInterval(loadTLEs, 6 * 60 * 60 * 1000);

