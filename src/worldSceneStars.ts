import * as THREE from 'three';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { Player } from './player';
import { World } from './world';
import { WorldScene } from './worldScene';

export interface WorldSceneStarsEventMap extends THREE.Object3DEventMap {
    success: WorldSceneStarsSuccessEvent;
}

export interface WorldSceneStarsSuccessEvent extends THREE.Event {
    type: "success";
}

export abstract class WorldSceneStars extends THREE.Object3D<WorldSceneStarsEventMap> {

    private stars: THREE.Object3D<THREE.Object3DEventMap> | undefined;

    public async build(world: World) {
        const collisionMap = new THREE.Object3D();

        this.buildHemisphere();

        return collisionMap;
    }

    async buildHemisphere() {

        //check if scene has hemisphere
        let hemisphere = this.getObjectByName("Hemisphere");
        if (hemisphere) hemisphere.removeFromParent();

        hemisphere = new THREE.Group();
        hemisphere.name = "Hemisphere";

        //this.background = new THREE.Color(0x000000);

        //sun light
        const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444);
        hemisphereLight.position.set(0, 10, 0);
        hemisphereLight.intensity = .05;
        hemisphere.add(hemisphereLight);

        const SHADOW_MAP_WIDTH = 1024, SHADOW_MAP_HEIGHT = 1024;
        const directionalLight = new THREE.DirectionalLight(0xffffff,3);
        directionalLight.position.set(-1000, 20, -10);
        directionalLight.rotation.set(-Math.PI/2, 0, 0);
        directionalLight.castShadow = true;
        directionalLight.shadow.camera.top = 18;
        directionalLight.shadow.camera.bottom = - 18;
        directionalLight.shadow.camera.left = - 18;
        directionalLight.shadow.camera.right = 18;
        directionalLight.shadow.camera.near = 18;
        directionalLight.shadow.camera.far = 1100;
        directionalLight.shadow.bias = 0.0001;

        directionalLight.shadow.mapSize.width = SHADOW_MAP_WIDTH;
        directionalLight.shadow.mapSize.height = SHADOW_MAP_HEIGHT;
        hemisphere.add(directionalLight);

        // const shadowHelper = new THREE.CameraHelper( directionalLight.shadow.camera );
        // this.scene.add( shadowHelper );

        // sun lensflare
        const textureLoader = new THREE.TextureLoader();
        const textureFlare0 = await textureLoader.loadAsync('./textures/lensflare0.png');
        const textureFlare3 = await textureLoader.loadAsync('./textures/lensflare3.png');

        const lensflare = new Lensflare();
        lensflare.addElement(new LensflareElement(textureFlare0, 700, 0, directionalLight.color));
        lensflare.addElement(new LensflareElement(textureFlare3, 70, 0.7));

        directionalLight.add(lensflare);

        // stars
        const starsCount = 10000;
        const starsColors = [0x777777,0xaaaaaa,0xffffff];
        const starsSize = [0.1,0.3,1];
        const starssAreaSize = [1400, 1400, 1400];
        const starsFreeAreaSize = [900, 900, 900];
        const starsMaterials = [
            new THREE.PointsMaterial({ color: starsColors[0], size: starsSize[0], /*transparent: true*/ }),
            new THREE.PointsMaterial({ color: starsColors[1], size: starsSize[1], /*transparent: true*/ }),
            new THREE.PointsMaterial({ color: starsColors[2], size: starsSize[2], /*transparent: true*/ }),
        ];

        this.stars = new THREE.Object3D();
        for (let i = 0; i < 3; i++) {
            const starssGeo = this.createStarsParticleGeo(starsCount, starssAreaSize, starsFreeAreaSize, starsSize);
            const starsMesh = new THREE.Points(starssGeo, starsMaterials[i]);
            this.stars.add(starsMesh);
        }

        hemisphere.add(this.stars);

        this.add(hemisphere);
    }

 
    private createStarsParticleGeo(starsCount: number, starssAreaSize: number[], starsFreeAreaSize: number[], starsSize: number[]) {
        const positions = [];
        const sizes = [];
        const starssGeo = new THREE.BufferGeometry();
        for (let i = 0; i < starsCount; i++) {
            const x = Math.random() * starssAreaSize[0] - starssAreaSize[0] / 2;
            const y = Math.random() * starssAreaSize[1] - starssAreaSize[1] / 2;
            const z = Math.random() * starssAreaSize[2] - starssAreaSize[2] / 2;
            if (x > -starsFreeAreaSize[0] / 2 && x < starsFreeAreaSize[0] / 2 &&
                y > -starsFreeAreaSize[1] / 2 && y < starsFreeAreaSize[1] / 2 &&
                z > -starsFreeAreaSize[2] / 2 && z < starsFreeAreaSize[2] / 2) {
                continue;
            }
            positions.push(x, y, z);
            sizes.push(starsSize[Math.floor(Math.random() * starsSize.length)]);
        }
        starssGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
        starssGeo.setAttribute("size", new THREE.BufferAttribute(new Float32Array(sizes), 1));
        return starssGeo;
    }

    public update(deltaTime: number, world: World, player: Player) {

        //stars follow player
        if(this.stars) this.stars.position.copy(player.position);
    }

}