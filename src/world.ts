import * as THREE from 'three';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OctreeHelper } from 'three/addons/helpers/OctreeHelper.js';
import { Octree } from 'three/addons/math/Octree.js';
import { Player } from './player';

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('./draco/');
const geometryLoader = new GLTFLoader();
geometryLoader.setDRACOLoader(dracoLoader);

interface WorldEventMap extends THREE.Object3DEventMap {
    needHudUpdate: WorldNeedHudUpdateEvent;
    levelUp: WorldLevelUpEvent;
}

export interface WorldNeedHudUpdateEvent extends THREE.Event {
    type: 'needHudUpdate';
}

export interface WorldLevelUpEvent extends THREE.Event {
    type: 'levelUp';
}

type Weather = 'rain' | 'snow' | 'none';

export class World extends THREE.Object3D<WorldEventMap> {

    static debug = false;
    static soundBufferAmbient: Promise<AudioBuffer>;
    static model: Promise<THREE.Object3D>; 
    static initialize() {
        //load audio     
        const audioLoader = new THREE.AudioLoader();
        World.soundBufferAmbient = audioLoader.loadAsync('./sounds/ambient.ogg');

        // World.soundBufferIntro = audioLoader.loadAsync('./sounds/intro.ogg');
    }

    worldOctree = new Octree();

    gui: GUI;
    playerSpawnPoint: THREE.Vector3;
    scene: THREE.Scene | undefined;
    soundAmbient: THREE.Audio | undefined;
    soundIntro: THREE.Audio | undefined;
    collisionMap: THREE.Object3D<THREE.Object3DEventMap> | undefined;
    helper: OctreeHelper | undefined;
    animatedObjects: THREE.Object3D[] = [];
    private moon: THREE.Mesh | undefined;
    private earth: THREE.Mesh | undefined;
    private stars: THREE.Object3D<THREE.Object3DEventMap> | undefined;
    public metersToLanding: number = 0;
    public playerHitMoon: boolean = false;

    /**
     * @param {Promise<THREE.AudioListener>} audioListenerPromise
     * @param {GUI} gui
     */
    constructor(audioListenerPromise: Promise<THREE.AudioListener>, gui: GUI) {
        super();

        this.gui = gui;
        this.playerSpawnPoint = new THREE.Vector3(0, 3, -200);

        setInterval(() => {
            this.dispatchEvent({ type: 'needHudUpdate' } as WorldNeedHudUpdateEvent);
        }, 200);

        this.initAudio(audioListenerPromise);
    }

    async initAudio(audioListenerPromise: Promise<THREE.AudioListener>) {
        const audioListener = await audioListenerPromise;
        const soundBufferAmbient = await World.soundBufferAmbient;
        this.soundAmbient = new THREE.Audio(audioListener);
        this.soundAmbient.setBuffer(soundBufferAmbient);
        this.soundAmbient.setVolume(1);

        this.playWorldAudio();
    }

    playWorldAudio() {
        if (this.soundAmbient && !this.soundAmbient.isPlaying) {
            this.soundAmbient.play();
        }
        setTimeout(() => {
            if (!this.soundIntro || this.soundIntro.isPlaying) return;
            this.soundIntro.play();
        }, 1000);
    }

    stopWorldAudio() {
        if (this.soundAmbient) {
            this.soundAmbient.stop();
        }
    }

    async loadScene(): Promise<THREE.Scene> {
        this.scene = new THREE.Scene();

        //load texture
        const textureLoader = new THREE.TextureLoader();
        const moonTexture = await textureLoader.loadAsync('./textures/moon.jpg');
        const moonNormalTexture = await textureLoader.loadAsync('./textures/moon_normal.jpg');

        this.collisionMap = new THREE.Object3D();

        const moonMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xffffff, 
            map: moonTexture, 
            displacementMap: moonTexture, 
            displacementScale: 0.2,
            normalMap: moonNormalTexture,
            normalScale: new THREE.Vector2(0.3, 0.3)
         });

        const moonGeometry = new THREE.SphereGeometry(17, 64, 64); //1.737,4 km
        this.moon = new THREE.Mesh(moonGeometry, moonMaterial);
        this.moon.castShadow = true;
        this.moon.receiveShadow = true;
        this.moon.layers.enable(1); //bloom layer
        this.collisionMap.add(this.moon);

        const earthTexture = await textureLoader.loadAsync('./textures/earth.jpg');
        const earthReflectionTexture = await textureLoader.loadAsync('./textures/earth_reflection.jpg');
        const earthCloudsTexture = await textureLoader.loadAsync('./textures/earth_clouds.jpg');
        const earthGeometry = new THREE.SphereGeometry(63, 64, 64); //6371 km
        const earthMaterial = new THREE.MeshStandardMaterial({ map: earthTexture, metalnessMap: earthReflectionTexture, roughness: 0.5, metalness: 0.5 });
        const earthAtmosphereMaterial = new THREE.MeshStandardMaterial({ map: earthCloudsTexture, transparent: true, opacity: 0.5 });
        const earthAtmosphere = new THREE.Mesh(earthGeometry.clone().scale(1.01,1.01,1.01), earthAtmosphereMaterial);
        this.earth = new THREE.Mesh(earthGeometry, earthMaterial);
        this.earth.position.set(1800, 0, 700);
        this.earth.castShadow = true;
        this.earth.receiveShadow = true;
        this.earth.add(earthAtmosphere);
        this.collisionMap.add(this.earth);

        this.rebuildOctree();

        this.scene.add(this.collisionMap);

        this.addHemisphere();

        const helper = new OctreeHelper(this.worldOctree);
        helper.visible = false;
        this.scene.add(helper);
        this.helper = helper;

        return this.scene;
    }

    reset() {
        this.stopWorldAudio();
        this.playWorldAudio();
        this.allLightsOn();
    }

    allLightsOff() {
        if (!this.scene) return;

        this.scene.traverse(child => {
            if ((child as THREE.Light).isLight) {
                child.visible = false;
            }
        });
    }

    allLightsOn() {
        if (!this.scene) return;

        this.scene.traverse(child => {
            if ((child as THREE.Light).isLight) {
                child.visible = true;
            }
        });
    }

    addFog() {
        if (!this.scene) return;

        this.scene.fog = new THREE.Fog(0xffffff, 10, 35);
    }

    getLevel() {
        return 1;
    }

    async addHemisphere() {
        if (!this.scene) return;

        //check if scene has hemisphere
        let hemisphere = this.scene.getObjectByName("Hemisphere");
        if (hemisphere) hemisphere.removeFromParent();

        hemisphere = new THREE.Group();
        hemisphere.name = "Hemisphere";

        // Sky
        this.scene.background = new THREE.Color(0x000000);

        const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444);
        hemisphereLight.position.set(0, 10, 0);
        hemisphereLight.intensity = .05;
        hemisphere.add(hemisphereLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff,1.5);
        directionalLight.position.set(-1000, 20, -10);
        directionalLight.rotation.set(-Math.PI/2, 0, 0);
        directionalLight.castShadow = true;
        hemisphere.add(directionalLight);

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

        this.scene.add(this.stars);

        this.scene.add(hemisphere);
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

    update(deltaTime: number, player: Player) {
        if (!this.moon ||!this.earth) return;

        this.moon.rotation.y += 0.05 * deltaTime;

        this.earth.rotation.y += 0.01 * deltaTime;

        // this.animatedObjects.forEach(object => {
        // });

        // gravity player to moon 1,62 m/s²
        const moonGlobalPosition = new THREE.Vector3();
        this.moon.getWorldPosition(moonGlobalPosition);
        const moonGravity = 1.62 * 50;
        const distanceToMoon = player.position.distanceTo(moonGlobalPosition);
        const gravityForce = moonGravity * (1 / distanceToMoon);
        player.velocity.addScaledVector(moonGlobalPosition.sub(player.position).normalize(), gravityForce * deltaTime);

        //check if player is on moon
        if(player.onFloor) {
            this.metersToLanding = 0;
            //first time player hits moon
            if(!this.playerHitMoon) {
                this.playerHitMoon = true;
                player.smoke.visible = false;
                player.tweens.forEach(tween => tween.stop());
                
                //attach player from sceen to moon                
                player.position.copy(this.moon.worldToLocal(player.position));
                player.removeFromParent();
                this.moon.add(player);

                const totalVelocity = player.collisionVelocity;
                console.log("playerHitMoon",totalVelocity);
                if(totalVelocity > 0.8) {
                    player.damage(totalVelocity*7);
                }
            }
        } else {
            this.metersToLanding = Number(((player.position.distanceTo(this.moon.position)-17) * 100)) - 44;

            //player left the moon
            if(this.playerHitMoon && this.scene) {
                this.playerHitMoon = false;
                player.tweens.forEach(tween => tween.start());

                //detach player from moon back to scene
                player.position.copy(this.moon.localToWorld(player.position));
                player.removeFromParent();
                this.scene.add(player);
            }
            if(this.metersToLanding < 200) {
                player.smoke.visible = true;
            } else {
                player.smoke.visible = false;
            }
        }

        //stars follow player
        if(this.stars) this.stars.position.copy(player.position);

        //check if player is near placeholder
        this.checkPlayerCollision(player);

    }

    private checkPlayerCollision(player: Player) {
        const playerGlobalPosition = new THREE.Vector3();
        player.getWorldPosition(playerGlobalPosition);

    }

    rebuildOctree() {
        if (this.collisionMap) {
            this.worldOctree.clear().fromGraphNode(this.collisionMap);
        }
    }
}
World.initialize();