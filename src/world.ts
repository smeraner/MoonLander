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
        World.soundBufferAmbient = audioLoader.loadAsync('./sounds/ambient.mp3');

        // World.soundBufferIntro = audioLoader.loadAsync('./sounds/intro.ogg');
    }

    worldOctree = new Octree();

    gui: GUI;
    playerSpawnPoint: THREE.Vector3;
    scene: THREE.Scene | undefined;
    soundAmbient: THREE.Audio | undefined;
    soundIntro: THREE.Audio | undefined;
    map: THREE.Object3D<THREE.Object3DEventMap> | undefined;
    helper: OctreeHelper | undefined;
    animatedObjects: THREE.Object3D[] = [];
    private moon: THREE.Mesh | undefined;
    metersToLanding: number = 0;
    playerHitMoon: boolean = false;

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
        this.soundAmbient.setLoop(true);
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


        //big world roller geometry
        const map = this.map = new THREE.Object3D();
        // const widthHeight = 1024;
        // const dataNoiseTexture = new THREE.DataTexture(new Uint8Array(widthHeight * widthHeight * 4), widthHeight, widthHeight, THREE.RGBAFormat);
        // dataNoiseTexture.wrapS = THREE.RepeatWrapping;
        // dataNoiseTexture.wrapT = THREE.RepeatWrapping;
        // dataNoiseTexture.repeat.set(5, 2);
        // dataNoiseTexture.needsUpdate = true;

        // for (let i = 0; i < dataNoiseTexture.image.data.length; i += 4) {
        //     //random number between 200 and 255
        //     const x = Math.floor(Math.random() * 55) + 200;
        //     dataNoiseTexture.image.data[i + 0] = x;
        //     dataNoiseTexture.image.data[i + 1] = x;
        //     dataNoiseTexture.image.data[i + 2] = x;
        //     dataNoiseTexture.image.data[i + 3] = x;
        // }
        const moonMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xffffff, 
            map: moonTexture, 
            displacementMap: moonTexture, 
            displacementScale: 0.2,
            normalMap: moonNormalTexture,
            normalScale: new THREE.Vector2(0.3, 0.3),
         });

        const moonGeometry = new THREE.SphereGeometry(17, 64, 64); //1.737,4 km
        this.moon = new THREE.Mesh(moonGeometry, moonMaterial);
        this.moon.castShadow = true;
        this.moon.receiveShadow = true;
        this.moon.layers.enable(1); //bloom layer
        map.add(this.moon);

        this.rebuildOctree();

        this.scene.add(map);

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
        const particleCount = 15000;
        const particleColor = 0xffffff;
        const particleSize = 0.1;
        const particlesAreaSize = [1000, 1000, 1000];
        const particleFreeAreaSize = [500, 500, 500];
        const positions = [];
        const sizes = [];
        const particlesGeo = new THREE.BufferGeometry();
        for (let i = 0; i < particleCount; i++) {
            const x = Math.random() * particlesAreaSize[0] - particlesAreaSize[0] / 2;
            const y = Math.random() * particlesAreaSize[1] - particlesAreaSize[1] / 2;
            const z = Math.random() * particlesAreaSize[2] - particlesAreaSize[2] / 2;
            if (x > -particleFreeAreaSize[0] / 2 && x < particleFreeAreaSize[0] / 2 &&
                y > -particleFreeAreaSize[1] / 2 && y < particleFreeAreaSize[1] / 2 &&
                z > -particleFreeAreaSize[2] / 2 && z < particleFreeAreaSize[2] / 2) {
                continue;
            }
            positions.push(x, y, z);
            sizes.push(particleSize);
        }
        particlesGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
        particlesGeo.setAttribute("size", new THREE.BufferAttribute(new Float32Array(sizes), 1));

        const starsMaterial = new THREE.PointsMaterial({
            color: particleColor,
            size: particleSize,
            //transparent: true
        });
        const particles = new THREE.Points(particlesGeo, starsMaterial);

        this.scene.add(particles);

        this.scene.add(hemisphere);
    }


    update(deltaTime: number, player: Player) {
        if (!this.moon) return;

        this.moon.rotation.y += 0.05 * deltaTime;

        this.metersToLanding = Number(((player.position.distanceTo(this.moon.position)-17) * 100).toFixed(2));
        // this.animatedObjects.forEach(object => {
        // });

        // gravity player to moon 1,62 m/s²
        const moonGlobalPosition = new THREE.Vector3();
        this.moon.getWorldPosition(moonGlobalPosition);
        const moonGravity = 1.62;
        const distanceToMoon = player.position.distanceTo(moonGlobalPosition);
        const gravityForce = moonGravity * (1 / distanceToMoon);
        player.velocity.addScaledVector(moonGlobalPosition.sub(player.position).normalize(), gravityForce * deltaTime);

        //check if player is on moon
        if(player.onFloor) {
            if(!this.playerHitMoon) {
                const totalVelocity = player.collisionVelocity;
                player.position.copy(this.moon.worldToLocal(player.position));
                player.removeFromParent();
                this.moon.add(player);
                this.playerHitMoon = true;
                console.log("playerHitMoon",totalVelocity);
                if(totalVelocity > 1.1) {
                    player.damage(totalVelocity);
                }
            }
        } else {
            this.playerHitMoon = false;
        }

        //check if player is near placeholder
        this.checkPlayerCollision(player);

    }

    private checkPlayerCollision(player: Player) {
        const playerGlobalPosition = new THREE.Vector3();
        player.getWorldPosition(playerGlobalPosition);

    }

    rebuildOctree() {
        if (this.map) {
            this.worldOctree.clear().fromGraphNode(this.map);
        }
    }
}
World.initialize();