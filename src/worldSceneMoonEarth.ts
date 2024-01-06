import * as THREE from 'three';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { Player } from './player';
import { World } from './world';
import { WorldScene } from './worldScene';

export interface WorldSceneMoonEarthEventMap extends THREE.Object3DEventMap {
    success: WorldSceneMoonEarthSuccessEvent;
}

export interface WorldSceneMoonEarthSuccessEvent extends THREE.Event {
    type: "success";
}

export class WorldSceneMoonEarth extends THREE.Object3D<WorldSceneMoonEarthEventMap> implements WorldScene {

    moon: THREE.Mesh | undefined;
    earth: THREE.Mesh | undefined;
    private stars: THREE.Object3D<THREE.Object3DEventMap> | undefined;

    public async build(world: World) {
        const collisionMap = new THREE.Object3D();
        const textureLoader = new THREE.TextureLoader();
        const moonTexture = await textureLoader.loadAsync('./textures/moon.jpg');
        const moonNormalTexture = await textureLoader.loadAsync('./textures/moon_normal.jpg');

        const moonMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: moonTexture,
            displacementMap: moonTexture,
            displacementScale: 0.2,
            normalMap: moonNormalTexture,
            normalScale: new THREE.Vector2(0.3, 0.3)
        });

        const moonGeometry = new THREE.SphereGeometry(17, 64, 64); //1.737,4 km
        const moon = new THREE.Mesh(moonGeometry, moonMaterial);
        moon.castShadow = true;
        moon.receiveShadow = true;
        moon.layers.enable(1); //bloom layer
        this.moon = moon;
        collisionMap.add(moon);

        const earthTexture = await textureLoader.loadAsync('./textures/earth.jpg');
        const earthReflectionTexture = await textureLoader.loadAsync('./textures/earth_reflection.jpg');
        const earthCloudsTexture = await textureLoader.loadAsync('./textures/earth_clouds.jpg');
        const earthGeometry = new THREE.SphereGeometry(63, 64, 64); //6371 km
        const earthMaterial = new THREE.MeshStandardMaterial({ map: earthTexture, metalnessMap: earthReflectionTexture, roughness: 0.5, metalness: 0.5 });
        const earthAtmosphereMaterial = new THREE.MeshStandardMaterial({ map: earthCloudsTexture, transparent: true, opacity: 0.5 });
        const earthAtmosphere = new THREE.Mesh(earthGeometry.clone().scale(1.01, 1.01, 1.01), earthAtmosphereMaterial);
        const earth = new THREE.Mesh(earthGeometry, earthMaterial);
        earth.position.set(1800, 0, 700);
        earth.add(earthAtmosphere);
        this.earth = earth;
        collisionMap.add(earth);

        this.add(collisionMap);

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
        if (!this.moon ||!this.earth) return;

        this.moon.rotation.y += 0.03 * deltaTime;

        this.earth.rotation.y += 0.01 * deltaTime;

        // gravity player to moon 1,62 m/s²
        const moonGlobalPosition = new THREE.Vector3();
        this.moon.getWorldPosition(moonGlobalPosition);
        const moonGravity = 1.62 * 50;
        const distanceToMoon = player.position.distanceTo(moonGlobalPosition);
        const gravityForce = moonGravity * (1 / distanceToMoon);
        player.velocity.addScaledVector(moonGlobalPosition.sub(player.position).normalize(), gravityForce * deltaTime);

        //check if player is on moon
        if(player.onFloor) {
            world.metersToLanding = 0;
            //first time player hits moon
            if(!world.playerHitMoon) {
                world.playerHitMoon = true;
                player.smoke.visible = false;
                player.tweens.forEach(tween => tween.stop());
                
                //attach player from sceen to moon                
                this.attachPlayerToMoon(player);

                const totalVelocity = player.collisionVelocity;
                console.log("playerHitMoon",totalVelocity);
                if(totalVelocity > 0.8) {
                    player.damage(totalVelocity*10);
                    setTimeout(() => { // wait for bounce animation
                        if(player.health > 0 && player.onFloor) {
                            this.detachPlayerFromMoon(player, world);
                            this.dispatchEvent({ type: "success" } as WorldSceneMoonEarthSuccessEvent);
                        }
                    }, 2500);
                }
            }
        } else {
            world.metersToLanding = Number(((player.position.distanceTo(this.moon.position)-17) * 100)) - 44;

            //player left the moon
            if(world.playerHitMoon && world.scene) {
                world.playerHitMoon = false;
                player.tweens.forEach(tween => tween.start());

                //detach player from moon back to scene
                this.detachPlayerFromMoon(player, world);
            }
            if(world.metersToLanding < 200) {
                player.smoke.visible = true;
            } else {
                player.smoke.visible = false;
            }
        }

        //stars follow player
        if(this.stars) this.stars.position.copy(player.position);
    }



    private detachPlayerFromMoon(player: Player, world: World) {
        if (!this.moon) return;
        player.position.copy(this.moon.localToWorld(player.position));
        player.removeFromParent();
        world.scene.add(player);
    }

    private attachPlayerToMoon(player: Player) {
        if (!this.moon) return;
        player.position.copy(this.moon.worldToLocal(player.position));
        player.removeFromParent();
        this.moon.add(player);
    }
}