import * as THREE from 'three';
import * as TWEEN from 'three/examples/jsm/libs/tween.module.js';
import { World } from './world';
import { Capsule } from 'three/addons/math/Capsule.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ThreeMFLoader } from 'three/examples/jsm/Addons.js';

export class Player extends THREE.Object3D implements DamageableObject {
    static debug = false;
    static model: Promise<any>;
    static smokeTexture: Promise<THREE.Texture>;

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
    collisionVelocity: number = 0;
    tweens: TWEEN.Tween<THREE.Euler>[] = [];
    smoke= new THREE.Object3D();

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

        const textureLoader = new THREE.TextureLoader();
        Player.smokeTexture = textureLoader.loadAsync('./textures/smoke.png');

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

        this.loadModel();

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

    async loadModel() {
        const landerModel = await Player.model;

        this.model = landerModel.scene;
        if(!this.model) return;

        this.tweens.push(new TWEEN.Tween(this.model.rotation)
            .to({ x: this.model.rotation.x, y: 0.05 , z: this.model.rotation.z }, 2000)
            .easing(TWEEN.Easing.Quadratic.InOut)
            .yoyo(true)
            .repeat(Infinity)
            .start());

        this.model.layers.enable(1); //bloom layer
        this.add(this.model);

        this.smoke.visible = false;
        const smokeTexture = await Player.smokeTexture;
        const smokeMaterial = new THREE.MeshBasicMaterial({ map: smokeTexture, color: 0xcccccc, fog: true, opacity: 0.5, transparent: true });

        for(let i = 0; i < 7; i++) {
            const smokeSize = Math.random() * 3 + 7;
            const smokeParticleGeo = new THREE.PlaneGeometry(smokeSize, smokeSize);
            const smokeParticle = new THREE.Mesh(smokeParticleGeo, smokeMaterial);
            smokeParticle.lookAt(0, 1, 0);

            const xpos = Math.random() * 6 - 2;
            const ypos = Math.random() * 1 - 0.7;
            const zpos = Math.random() * 7 - 4;

            smokeParticle.position.set(xpos, ypos, zpos);

            this.tweens.push(new TWEEN.Tween(smokeParticle.rotation)
                .to({ x: smokeParticle.rotation.x, y:smokeParticle.rotation.y , z: 2 * Math.PI }, 500 + Math.random() * 500)
                .repeat(Infinity)
                .start())
                this.smoke.add(smokeParticle);
        }
        this.model.add(this.smoke);

    }

    reset() {
        this.health = 100;
        this.score = 0;
    }

    rotate(x: number, y: number) {
        let rotate: THREE.Object3D = this;
        if(this.onFloor) {
            rotate = this.camera;
        }
        rotate.rotation.y -= x;
        rotate.rotation.x -= y;
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
    collisions(world: World): void {
        const result = world.worldOctree.capsuleIntersect(this.collider);

        this.onFloor = false;

        if (result) {
            this.onFloor = result.normal.y > 0;

            if (!this.onFloor) {
                this.velocity.addScaledVector(result.normal, - result.normal.dot(this.velocity));
            } else {
                this.collisionVelocity = this.velocity.length();
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

        this.collisions(world);

        this.position.copy(this.collider.end);
        this.position.y -= this.collider.radius;

        if(this.effectMesh && this.effectMesh.visible) {
            this.effectMesh.rotation.z += 2*deltaTime;
        }

        this.colliderMesh.visible = Player.debug;
        if(this.mixer) this.mixer.update(deltaTime);
        TWEEN.update();
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