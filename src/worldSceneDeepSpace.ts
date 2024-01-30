import * as THREE from 'three';
import * as TWEEN from 'three/examples/jsm/libs/tween.module.js';
import { Player } from './player';
import { World } from './world';
import { WorldScene } from './worldScene';
import { WorldSceneStars, WorldSceneStarsSuccessEvent } from './worldSceneStars';


export class WorldSceneDeepSpace extends WorldSceneStars implements WorldScene {

    static soundBufferAmbient: Promise<AudioBuffer>;
    static initialize() {
        //load audio     
        const audioLoader = new THREE.AudioLoader();
        WorldSceneDeepSpace.soundBufferAmbient = audioLoader.loadAsync('./sounds/dark-ambient.mp3');

        // World.soundBufferIntro = audioLoader.loadAsync('./sounds/intro.ogg');
    }
    soundBufferAmbient: Promise<AudioBuffer>;
    planeMeshBackground: THREE.Mesh | undefined;

    constructor() {
        super();
        this.soundBufferAmbient = WorldSceneDeepSpace.soundBufferAmbient;
    }

    public async build(world: World, player: Player) {
        const collisionMap = new THREE.Object3D();
 
        this.buildHemisphere();

        //load texture
        const textureLoader = new THREE.TextureLoader();
        const bgTexture = await textureLoader.loadAsync('./textures/bg_evil.png');

        const planeGeometry = new THREE.PlaneGeometry(100, 100, 1, 1);
        const planeMaterial = new THREE.MeshBasicMaterial({
            map: bgTexture,
            opacity: 0,
            transparent: true
        })
        this.planeMeshBackground = new THREE.Mesh(planeGeometry, planeMaterial);
        this.planeMeshBackground.rotation.y = Math.PI;
        this.planeMeshBackground.position.set(0, 0, 100);
        this.add(this.planeMeshBackground);

        world.scene.background = new THREE.Color(0xff0000);
        const fadeFromRed = new TWEEN.Tween(world.scene.background)
            .to({ r: 0, g: 0, b: 0 }, 6000)
            .easing(TWEEN.Easing.Quadratic.Out)
            .onComplete(() => {
                fadeBg.start();
                moveBg.start();
            });
        const fadeBg = new TWEEN.Tween(planeMaterial)
            .to({opacity: 0.5}, 1500)
            .easing(TWEEN.Easing.Exponential.In);
        const moveBg = new TWEEN.Tween(this.planeMeshBackground.position)
            .to({z: -200, y:25}, 2000)
            .easing(TWEEN.Easing.Exponential.In)
            .onComplete(() => {
                this.dispatchEvent({ type: "success" } as WorldSceneStarsSuccessEvent);
            });

        fadeFromRed.start();

        this.add(collisionMap);

        return collisionMap;
    }

    public update(deltaTime: number, world: World, player: Player) {
  
        super.update(deltaTime, world, player);
        TWEEN.update();
    }

}
WorldSceneDeepSpace.initialize();