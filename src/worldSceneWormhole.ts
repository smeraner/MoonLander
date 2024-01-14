import * as THREE from 'three';
import { Player } from "./player";
import { World } from "./world";
import { WorldScene } from "./worldScene";
import { TorusKnot } from "three/examples/jsm/curves/CurveExtras.js";

export interface WorldSceneWormholeEventMap extends THREE.Object3DEventMap {
    success: WorldSceneWormholeSuccessEvent;
}

export interface WorldSceneWormholeSuccessEvent extends THREE.Event {
    type: "success";
}

export class WorldSceneWormhole extends THREE.Object3D<WorldSceneWormholeEventMap> implements WorldScene {

    playerPositionIndex: number = 0;
    speed: number = 4500;
    torusKnotpath = new TorusKnot();

    async build(world: World) {
        const collisionMap = new THREE.Object3D();

        //load texture
        const textureLoader = new THREE.TextureLoader();
        const wormholeTexture = await textureLoader.loadAsync('./textures/wormhole.jpg');
        wormholeTexture.wrapS = THREE.RepeatWrapping;
        wormholeTexture.wrapT = THREE.MirroredRepeatWrapping;
        wormholeTexture.repeat.set(10, 3);

        const wormholeMaterial = new THREE.MeshBasicMaterial({
            map: wormholeTexture,
            side: THREE.BackSide,
        })
        const wormholeGeometry = new THREE.TubeGeometry(this.torusKnotpath, 800, 5, 12, true);
        const wormholeTubeMesh = new THREE.Mesh( wormholeGeometry, wormholeMaterial );
        this.add(wormholeTubeMesh);

        //directional light
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(-800, 0, 0);
        this.add(directionalLight);

        //world.buildHemisphere();
        setTimeout(() => { // wait for bounce animation
            this.dispatchEvent({ type: "success" } as WorldSceneWormholeSuccessEvent);
        }, 7000);

        return collisionMap;
    }


    update(deltaTime: number, world: World, player: Player): void {
        this.playerPositionIndex++;
        //console.log(this.playerPositionIndex);

        const wormholeCameraPosition = this.torusKnotpath.getPoint(this.playerPositionIndex / this.speed)
        player.position.x = wormholeCameraPosition.x
        player.position.y = wormholeCameraPosition.y
        player.position.z = wormholeCameraPosition.z

        player.lookAt(this.torusKnotpath.getPoint((this.playerPositionIndex + 1) / this.speed))
    }

}

