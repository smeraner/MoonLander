const THREE = require('three');
const { performance } = require('perf_hooks');

const ITERATIONS = 1000000;

// Reused vectors
const _homePosition = new THREE.Vector3(-0.7, 0.8, 2);
const _radialVector = new THREE.Vector3();
const _velocityVector = new THREE.Vector3();

// Mock data
const position = new THREE.Vector3(10, 20, 30);
const velocity = { x: 1, y: -2, z: 3 };
const camera = { position: new THREE.Vector3() };

function runUnoptimized() {
    let verticalSpeed = 0;
    let isThrusting = true;
    for (let i = 0; i < ITERATIONS; i++) {
        const radialVector = new THREE.Vector3().copy(position).normalize();
        const velocityVector = new THREE.Vector3(velocity.x, velocity.y, velocity.z);
        verticalSpeed = velocityVector.dot(radialVector);

        const homePosition = new THREE.Vector3(-0.7, 0.8, 2);
        if (isThrusting) {
            const jitterIntensity = 0.005;
            camera.position.x = homePosition.x + (Math.random() - 0.5) * jitterIntensity;
            camera.position.y = homePosition.y + (Math.random() - 0.5) * jitterIntensity;
            camera.position.z = homePosition.z + (Math.random() - 0.5) * jitterIntensity;
        } else {
            camera.position.lerp(homePosition, 0.1);
        }
    }
    return verticalSpeed; // to prevent optimization removal
}

function runOptimized() {
    let verticalSpeed = 0;
    let isThrusting = true;
    for (let i = 0; i < ITERATIONS; i++) {
        _radialVector.copy(position).normalize();
        _velocityVector.set(velocity.x, velocity.y, velocity.z);
        verticalSpeed = _velocityVector.dot(_radialVector);

        if (isThrusting) {
            const jitterIntensity = 0.005;
            camera.position.x = _homePosition.x + (Math.random() - 0.5) * jitterIntensity;
            camera.position.y = _homePosition.y + (Math.random() - 0.5) * jitterIntensity;
            camera.position.z = _homePosition.z + (Math.random() - 0.5) * jitterIntensity;
        } else {
            camera.position.lerp(_homePosition, 0.1);
        }
    }
    return verticalSpeed; // to prevent optimization removal
}

// Warm up
runUnoptimized();
runOptimized();

// Measure
const start1 = performance.now();
runUnoptimized();
const end1 = performance.now();
console.log(`Unoptimized: ${end1 - start1} ms`);

const start2 = performance.now();
runOptimized();
const end2 = performance.now();
console.log(`Optimized: ${end2 - start2} ms`);
