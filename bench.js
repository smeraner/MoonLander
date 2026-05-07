const THREE = require('three');

function benchOld() {
    for (let i = 0; i < 100000; i++) {
        const smokeSize = Math.random() * 3 + 7;
        const smokeParticleGeo = new THREE.PlaneGeometry(smokeSize, smokeSize);
        const smokeParticle = new THREE.Mesh(smokeParticleGeo, undefined);
    }
}

function benchNew() {
    const smokeParticleGeo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < 100000; i++) {
        const smokeSize = Math.random() * 3 + 7;
        const smokeParticle = new THREE.Mesh(smokeParticleGeo, undefined);
        smokeParticle.scale.set(smokeSize, smokeSize, 1);
    }
}

console.time('old');
benchOld();
console.timeEnd('old');

console.time('new');
benchNew();
console.timeEnd('new');
