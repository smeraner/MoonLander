import * as THREE from 'three';
import { ShadowMapViewer } from 'three/addons/utils/ShadowMapViewer.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
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
    soundAmbient: THREE.Audio | undefined;
    soundIntro: THREE.Audio | undefined;
    collisionMap = new THREE.Object3D();
    helper: OctreeHelper | undefined;
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

    async loadScene(worldScene: WorldScene = new WorldSceneMoonEarth): Promise<THREE.Scene> {
        //clean scene
        this.cleanScene();

        //load scene
        this.worldScene = worldScene;
        
        if (!this.worldScene) throw new Error("worldScene not found");
        
        this.worldScene.addEventListener("success", () => {
            this.dispatchEvent({ type: "levelUp" } as WorldLevelUpEvent);
        });

        this.collisionMap = await this.worldScene.build(this);

        this.scene.add(this.worldScene);

        //build collision octree
        this.rebuildOctree();
        const helper = new OctreeHelper(this.worldOctree);
        helper.visible = false;
        this.scene.add(helper);
        this.helper = helper;

        return this.scene;
    }

    private cleanScene() {
        if(!this.worldScene) return;

        const objectsToRemove: THREE.Object3D[] = [];
        this.worldScene.traverse(child => {
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

    getLevel() {
        return 1;
    }

    update(deltaTime: number, player: Player) {

        if(this.worldScene) this.worldScene.update(deltaTime, this, player);

    }

    rebuildOctree() {
        if (this.collisionMap) {
            this.worldOctree.clear().fromGraphNode(this.collisionMap);
        }
    }
}
World.initialize();