import * as THREE from 'three';
import { Player } from './player';
import { World } from './world';
import { WorldScene } from './worldScene';
import { WorldSceneStars } from './worldSceneStars';


export class WorldSceneDeepSpace extends WorldSceneStars implements WorldScene {

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