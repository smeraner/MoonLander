import { Player } from "./player";
import { World } from "./world";

export interface WorldScene extends THREE.Object3D {
    build(world: World): Promise<THREE.Object3D>;
    update(deltaTime: number, world: World, player: Player): void;
    soundBufferAmbient: Promise<AudioBuffer>;
}