import { Player } from "./player";
import { World } from "./world";

export interface WorldScene {
    build(world: World): Promise<{ collisionMap: THREE.Object3D, scene: THREE.Object3D}>;
    update(deltaTime: number, world: World, player: Player): void;
}