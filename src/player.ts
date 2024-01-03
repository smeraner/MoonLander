import * as THREE from 'three';
import { World } from './world';
import { Capsule } from 'three/addons/math/Capsule.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class Player extends THREE.Object3D implements DamageableObject {
    static debug = false;
    static model: Promise<any>;
    static starsTexture: Promise<THREE.Texture>;

    mixer: THREE.AnimationMixer | undefined;
    model: THREE.Object3D<THREE.Object3DEventMap> | undefined;
    gravity = 0;
    speedOnFloor = 15;
    speedInAir = 10;
    jumpHeight = 4;
    onFloor = false;

    colliderHeight = .3;
    collider = new Capsule(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, this.colliderHeight, 0), 0.5);

    velocity = new THREE.Vector3();
    direction = new THREE.Vector3();
    scene: THREE.Scene;
    colliderMesh: THREE.Mesh<THREE.CapsuleGeometry, THREE.MeshBasicMaterial, THREE.Object3DEventMap>;
    health: number = 100;
    damageMultiplyer: number = 1;
    camera: THREE.Camera;
    runAction: THREE.AnimationAction | undefined;
    actions: THREE.AnimationAction[] | undefined;
    score: number = 0;
    effectMesh: THREE.Mesh | undefined;

    static initialize() {
        //load model     
        const gltfLoader = new GLTFLoader();
        Player.model = gltfLoader.loadAsync('./models/lander.glb').then(gltf => {
            gltf.scene.scale.set(0.2, 0.2, 0.2);
            gltf.scene.position.y = 0.7;
            gltf.scene.rotation.x = -Math.PI / 2;
            gltf.scene.traverse(child => {
                const mesh = child as THREE.Mesh;
                mesh.castShadow = true;
                mesh.receiveShadow = true;
            });
            return gltf;
        });

    }

    /**
     * @param {THREE.Scene} scene
     * @param {Promise<THREE.AudioListener>} audioListenerPromise
     * @param {number} gravity
     */
    constructor(scene: THREE.Scene, camera: THREE.Camera) {
        super();

        this.scene = scene;
        this.camera = camera;

        this.rotation.order = 'YXZ';

        Player.model.then(gltf => {
            this.model = gltf.scene;
            if(!this.model) return;
            this.add(this.model);
        });

        this.camera.position.set(1, 0.8, -2);
        this.camera.lookAt(1, 0.8, 0);
        this.add(camera)

        //collider
        const capsuleGeometry = new THREE.CapsuleGeometry(this.collider.radius, this.collider.end.y - this.collider.start.y);
        const capsuleMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true });
        const colliderMesh = new THREE.Mesh(capsuleGeometry, capsuleMaterial);
        colliderMesh.userData.obj = this;
        colliderMesh.position.copy(this.collider.start);
        this.colliderMesh = colliderMesh;
        this.scene.add(colliderMesh);
        this.colliderMesh.visible = Player.debug;
    }

    reset() {
        this.health = 100;
        this.score = 0;
    }

    jump(): void {
        if (this.onFloor) {
            this.velocity.y = this.jumpHeight;
        }
    }

    /**
     * Process inbound damage
     * @param {number} amount
     */
    damage(amount: number) {
        if(this.health === 0) return;
        
        this.health -= amount * this.damageMultiplyer;
        //this.dispatchEvent({type: "damaged", health: this.health} as ActorDamageEvent);
        if (this.health <= 0) {
            this.health = 0;
            //this.dispatchEvent({type: "dead"} as ActorDeadEvent);
            //this.blendDie();
        } else {
            //this.blendHit();
        }
        if(this.effectMesh) {
            this.effectMesh.visible = true;
            setTimeout(() => {
                if(this.effectMesh) this.effectMesh.visible = false;
            }, 1000);
        }
    }

    /**
     * 
     * @param {World} world 
     */
    collitions(world: World): void {
        const result = world.worldOctree.capsuleIntersect(this.collider);

        this.onFloor = false;

        if (result) {
            this.onFloor = result.normal.y > 0;

            if (!this.onFloor) {
                this.velocity.addScaledVector(result.normal, - result.normal.dot(this.velocity));
            } else {
                this.velocity.multiplyScalar(0);
            }
            this.collider.translate(result.normal.multiplyScalar(result.depth));
            this.colliderMesh.position.copy(this.collider.start);
        }
    }

    /***
     * @param {number} deltaTime
     */
    update(deltaTime: number, world: World): void {

        let damping = 0//Math.exp(- 4 * deltaTime) - 1;
        // if (!this.onFloor) {
        //     this.velocity.y -= this.gravity * deltaTime;
        //     damping *= 0.1; // small air resistance
        // }
        this.velocity.addScaledVector(this.velocity, damping);

        const deltaPosition = this.velocity.clone().multiplyScalar(deltaTime);
        this.collider.translate(deltaPosition);

        this.collitions(world);

        this.position.copy(this.collider.end);
        this.position.y -= this.collider.radius;

        if(this.effectMesh && this.effectMesh.visible) {
            this.effectMesh.rotation.z += 2*deltaTime;
        }

        this.colliderMesh.visible = Player.debug;
        if(this.mixer) this.mixer.update(deltaTime);
    }

    teleport(position: THREE.Vector3): void {
        this.position.copy(position);
        this.collider.start.copy(position);
        this.collider.end.copy(position);
        this.collider.end.y += this.colliderHeight;
        this.colliderMesh.position.copy(this.collider.start);

        this.velocity.set(0, 0, 0);
        this.onFloor = true;

    }

    getForwardVector(): THREE.Vector3 {
        this.camera.getWorldDirection(this.direction);
        this.direction.y = 0;
        this.direction.normalize();

        return this.direction;

    }

    getSideVector(): THREE.Vector3 {

        this.camera.getWorldDirection(this.direction);
        this.direction.y = 0;
        this.direction.normalize();
        this.direction.cross(this.camera.up);

        return this.direction;

    }
}
Player.initialize();