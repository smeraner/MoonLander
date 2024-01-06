import * as THREE from 'three';
import { ShadowMapViewer } from 'three/addons/utils/ShadowMapViewer.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OctreeHelper } from 'three/addons/helpers/OctreeHelper.js';
import { Octree } from 'three/addons/math/Octree.js';
import { Player } from './player';
import { WorldSceneMoonEarth } from './worldSceneMoonEarth';
import { WorldScene } from './worldScene';
import { WorldSceneWormhole } from './worldSceneWormhole';

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

type worldSceneName = "MoonEarth" | "DeepSpace" | "Wormhole";

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

    worldScene: WorldScene | undefined;
    worldOctree = new Octree();

    gui: GUI;
    playerSpawnPoint: THREE.Vector3;
    scene= new THREE.Scene();
    worldContainer = new THREE.Group();
    soundAmbient: THREE.Audio | undefined;
    soundIntro: THREE.Audio | undefined;
    collisionMap = new THREE.Object3D();
    helper: OctreeHelper | undefined;
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

    async loadScene(worldSceneName: worldSceneName = "MoonEarth"): Promise<THREE.Scene> {
        //clean scene
        this.cleanScene();

        switch (worldSceneName) {
            case "MoonEarth":
                this.worldScene = new WorldSceneMoonEarth();
                break;
            case "Wormhole":
                this.worldScene = new WorldSceneWormhole();
                break;
            case "DeepSpace":
                // this.worldScene = new WorldSceneDeepSpace();
                break;
        }
        
        if (!this.worldScene) throw new Error("worldScene not found");
        const { collisionMap, scene } = await this.worldScene.build(this);
        this.collisionMap = collisionMap;
        
        this.worldContainer.add(this.collisionMap);
        this.worldContainer.add(scene);

        this.scene.add(this.worldContainer);

        //build collision octree
        this.rebuildOctree();
        const helper = new OctreeHelper(this.worldOctree);
        helper.visible = false;
        this.scene.add(helper);
        this.helper = helper;

        return this.scene;
    }

    private cleanScene() {
        const objectsToRemove: THREE.Object3D[] = [];
        this.worldContainer.traverse(child => {
            objectsToRemove.push(child);
        });
        objectsToRemove.forEach(child => {
            child.removeFromParent();
        });
    }

    reset() {
        this.stopWorldAudio();
        this.playWorldAudio();
        this.allLightsOn();
    }

    allLightsOff() {
        this.scene.traverse(child => {
            if ((child as THREE.Light).isLight) {
                child.visible = false;
            }
        });
    }

    allLightsOn() {
        this.scene.traverse(child => {
            if ((child as THREE.Light).isLight) {
                child.visible = true;
            }
        });
    }

    addFog() {
        this.scene.fog = new THREE.Fog(0xffffff, 10, 35);
    }

    getLevel() {
        return 1;
    }

    async buildHemisphere() {

        //check if scene has hemisphere
        let hemisphere = this.scene.getObjectByName("Hemisphere");
        if (hemisphere) hemisphere.removeFromParent();

        hemisphere = new THREE.Group();
        hemisphere.name = "Hemisphere";

        this.scene.background = new THREE.Color(0x000000);

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

        if(this.worldScene) this.worldScene.update(deltaTime, this, player);

        //stars follow player
        if(this.stars) this.stars.position.copy(player.position);

    }

    rebuildOctree() {
        if (this.collisionMap) {
            this.worldOctree.clear().fromGraphNode(this.collisionMap);
        }
    }
}
World.initialize();