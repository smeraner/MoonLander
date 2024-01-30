import * as THREE from 'three';
import * as TWEEN from 'three/examples/jsm/libs/tween.module.js';
import * as CANNON from 'cannon-es';
import { World } from './world';
import { Capsule } from 'three/addons/math/Capsule.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AutoCannonWorld, AutoBody } from 'auto-cannon-world';

export interface PlyerEventMap extends THREE.Object3DEventMap {
    dead: PlayerDeadEvent;
    damaged: PlayerDamageEvent;
}

export interface PlayerDeadEvent extends THREE.Event {
    type: "dead";
}

export interface PlayerDamageEvent extends THREE.Event {
    type: "damaged";
}

export class Player extends THREE.Object3D<PlyerEventMap> implements DamageableObject {
    static debug = false;
    static model: Promise<any>;
    static smokeTexture: Promise<THREE.Texture>;
    static soundBufferEngine: Promise<AudioBuffer>;

    model: THREE.Object3D<THREE.Object3DEventMap> | undefined;
    gravity = 0;
    speedOnFloor = 10;
    speedInAir = 7;
    currentSpeed = 0;
    onFloor = false;

    colliderHeight = .3;
    collider = new Capsule(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, this.colliderHeight, 0), 0.5);
    colliderMesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial, THREE.Object3DEventMap>;
    collisionVelocity: number = 0;

    velocity: CANNON.Vec3
    direction = new THREE.Vector3();
    scene: THREE.Scene;
    camera: THREE.Camera;
    
    health: number = 100;
    fuel: number = 100;
    damageMultiplyer: number = 1;
    score: number = 0;
    
    tweens: TWEEN.Tween<THREE.Euler>[] = [];
    smoke= new THREE.Object3D();
    soundEngine: THREE.PositionalAudio | undefined;

    cannonWorld= AutoCannonWorld.getWorld();
    body: AutoBody;

    static initialize() {
        //load model     
        const gltfLoader = new GLTFLoader();
        Player.model = gltfLoader.loadAsync('./models/lander.glb').then(gltf => {
            gltf.scene.scale.set(0.2, 0.2, 0.2);
            gltf.scene.position.y = 0.7;
            gltf.scene.rotation.x = Math.PI / 2;
            gltf.scene.traverse(child => {
                const mesh = child as THREE.Mesh;
                mesh.castShadow = true;
                mesh.receiveShadow = true;
            });
            return gltf;
        });

        //load audio
        const audioLoader = new THREE.AudioLoader();
        Player.soundBufferEngine = audioLoader.loadAsync('./sounds/engine.ogg');;

        const textureLoader = new THREE.TextureLoader();
        Player.smokeTexture = textureLoader.loadAsync('./textures/smoke.png');

    }

    /**
     * @param {THREE.Scene} scene
     * @param {Promise<THREE.AudioListener>} audioListenerPromise
     * @param {number} gravity
     */
    constructor(scene: THREE.Scene, audioListenerPromise: Promise<THREE.AudioListener> ,camera: THREE.Camera) {
        super();

        this.scene = scene;
        this.camera = camera;

        this.loadModel();
        this.initAudio(audioListenerPromise);

        camera.rotation.order = "YXZ";
        this.add(camera);

        this.rotation.order = "YXZ";

        //collider
        //const capsuleGeometry = new THREE.CapsuleGeometry(this.collider.radius, this.collider.end.y - this.collider.start.y);
        const boxGeometry = new THREE.BoxGeometry(2, 2, 2);
        const capsuleMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true });
        const colliderMesh = new THREE.Mesh(boxGeometry, capsuleMaterial);
        colliderMesh.rotation.y = Math.PI;
        colliderMesh.userData.obj = this;
        colliderMesh.position.copy(this.collider.start);
        this.colliderMesh = colliderMesh;
        this.scene.add(colliderMesh);
        this.colliderMesh.visible = Player.debug;

        this.body = this.cannonWorld.attachMesh(colliderMesh, { mass: 500 });
        this.body.addEventListener("collide", (event: any) => {
            const contact = event.contact;
            const maxImpulse = 4;
            const impulse = contact.getImpactVelocityAlongNormal()// * contact.getContactDistance();
            this.body.angularDamping = 0.5;
            
            this.onFloor = true;
            this.smoke.visible = false;
            this.tweens.forEach(tween => tween.stop());

            if (impulse > maxImpulse) {
                this.damage(impulse*3);
            }

        }); 
        this.velocity = this.body.velocity;
    }

    async initAudio(audioListenerPromise: Promise<THREE.AudioListener>) {
        const audioListener = await audioListenerPromise;
        const soundBufferEngine = await Player.soundBufferEngine;
        this.soundEngine = new THREE.PositionalAudio(audioListener);
        this.soundEngine.setBuffer(soundBufferEngine);
        this.soundEngine.setVolume(1);
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
        if(this.onFloor) {
            this.camera.rotation.y -= x;
            this.camera.rotation.x += y;
        } else {
            //this.body.angularVelocity.set(-y*10, -x*10, 0)
            this.body.angularVelocity.x -= y;
            this.body.angularVelocity.y -= x;
        }
    }

    useEngine(forwardVectorMultiplier: number | null, sideVectorMultiplyer: number | null) {
        if(this.fuel <= 0) {
            this.fuel = 0;
            return;
        }

        if(this.soundEngine && !this.soundEngine.isPlaying) {
            this.soundEngine.play();
        }
        if(sideVectorMultiplyer !== null) {
            this.body.velocity.x -= sideVectorMultiplyer;
            this.fuel -= Math.abs(sideVectorMultiplyer);
        }
        if(forwardVectorMultiplier !== null) {
            this.body.velocity.z += forwardVectorMultiplier * 1.5;
            this.fuel -= 2*Math.abs(forwardVectorMultiplier);
        }
    }

    /**
     * Process inbound damage
     * @param {number} amount
     */
    damage(amount: number) {
        if(this.health === 0) return;
        
        this.health -= amount * this.damageMultiplyer;
        this.dispatchEvent({type: "damaged"} as PlayerDamageEvent);
        if (this.health <= 0) {
            this.health = 0;
            this.fuel = 0;
            this.dispatchEvent({type: "dead"} as PlayerDeadEvent);
            //this.blendDie();
        } else {
            //this.blendHit();
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
            this.onFloor = true;

            this.collisionVelocity = this.velocity.length();
            this.velocity.set(0, 0, 0);

            this.collider.translate(result.normal.multiplyScalar(result.depth));
            //this.colliderMesh.position.copy(this.collider.start);
        }
    }

    /***
     * @param {number} deltaTime
     */
    update(deltaTime: number, world: World): void {

        this.currentSpeed = this.velocity.length();

        this.position.copy(this.colliderMesh.position);
        this.rotation.copy(this.colliderMesh.rotation);

        this.colliderMesh.visible = Player.debug;
        TWEEN.update();
    }

    teleport(position: THREE.Vector3): void {
        this.position.copy(position);
        this.rotation.set(0, Math.PI, 0);
        this.collider.start.copy(position);
        this.collider.end.copy(position);
        this.collider.end.y += this.colliderHeight;
        this.colliderMesh.position.copy(this.collider.start);
        this.body.position.copy(this.collider.start as any);

        this.velocity.set(0, 0, 0);
        this.camera.position.set(-0.7, 0.8, 2);
        this.camera.rotation.set(0, 0, 0);
        //todo: fix camera
        //this.camera.lookAt(1, 0.8, 0);
    }

    getForwardVector(): THREE.Vector3 {
        this.camera.getWorldDirection(this.direction);
        this.direction.normalize();

        return this.direction;
    }

    getSideVector(): THREE.Vector3 {
        this.camera.getWorldDirection(this.direction);
        this.direction.normalize();
        this.direction.cross(this.camera.up);

        return this.direction;
    }
}
Player.initialize();