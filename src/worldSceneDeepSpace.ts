import * as THREE from 'three';
import { Player } from './player';
import { World } from './world';
import { WorldScene } from './worldScene';
import { WorldSceneStars } from './worldSceneStars';


export class WorldSceneDeepSpace extends WorldSceneStars implements WorldScene {

    static soundBufferAmbient: Promise<AudioBuffer>;
    static initialize() {
        //load audio     
        const audioLoader = new THREE.AudioLoader();
        WorldSceneDeepSpace.soundBufferAmbient = audioLoader.loadAsync('./sounds/dark-ambient.mp3');

        // World.soundBufferIntro = audioLoader.loadAsync('./sounds/intro.ogg');
    }
    soundBufferAmbient: Promise<AudioBuffer>;

    constructor() {
        super();
        this.soundBufferAmbient = WorldSceneDeepSpace.soundBufferAmbient;
    }

    public async build(world: World) {
        const collisionMap = new THREE.Object3D();
 
        this.buildHemisphere();

        this.add(collisionMap);

        return collisionMap;
    }

    public update(deltaTime: number, world: World, player: Player) {
  
        super.update(deltaTime, world, player);
    }

}
WorldSceneDeepSpace.initialize();