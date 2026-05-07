import * as THREE from 'three';
import * as TWEEN from 'three/examples/jsm/libs/tween.module.js';
import * as CANNON from 'cannon-es';
import { World } from './world';
import { Capsule } from 'three/addons/math/Capsule.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AutoCannonWorld, AutoBody } from 'auto-cannon-world';

export interface PlayerEventMap extends THREE.Object3DEventMap {
    dead: PlayerDeadEvent;
    damaged: PlayerDamageEvent;
    landed: PlayerLandedEvent;
    cameraShake: PlayerCameraShakeEvent;
}

export interface PlayerDeadEvent extends THREE.Event {
    type: "dead";
}

export interface PlayerDamageEvent extends THREE.Event {
    type: "damaged";
}

export interface PlayerLandedEvent extends THREE.Event {
    type: "landed";
}

export interface PlayerCameraShakeEvent extends THREE.Event {
    type: "cameraShake";
    intensity: number;
}

export class Player extends THREE.Object3D<PlayerEventMap> implements DamageableObject {
    static debug = false;
    static model: Promise<any>;
    static smokeTexture: Promise<THREE.Texture>;
    static soundBufferEngine: Promise<AudioBuffer>;

    model: THREE.Object3D<THREE.Object3DEventMap> | undefined;
    speedOnFloor = 10;
    speedInAir = 7;
    currentSpeed = 0;
    verticalSpeed = 0;
    onFloor = false;

    colliderHeight = .3;
    collider = new Capsule(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, this.colliderHeight, 0), 0.5);
    colliderMesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial, THREE.Object3DEventMap>;
    collisionVelocity: number = 0;

    velocity: CANNON.Vec3;
    direction = new THREE.Vector3();
    scene: THREE.Scene;
    camera: THREE.Camera;
    
    health: number = 100;
    fuel: number = 100;
    damageMultiplyer: number = 1;
    score: number = 0;
    
    isThrusting: boolean = false;
    private radialVector = new THREE.Vector3();
    private velocityVector = new THREE.Vector3();
    private readonly homePosition = new THREE.Vector3(-0.7, 0.8, 2);
    private landingTimer: number = 0;
    private readonly LANDING_CONFIRM_TIME: number = 1.5;
    private static readonly MAX_SAFE_IMPULSE: number = 4;
    private static readonly LANDING_ANGLE_TOLERANCE: number = 0.7; // cos(~45°)
    private static readonly FUEL_COST_RATE: number = 4.5;

    tweens: TWEEN.Tween<THREE.Euler>[] = [];
    smoke = new THREE.Object3D();
    soundEngine: THREE.PositionalAudio | undefined;

    cannonWorld = AutoCannonWorld.getWorld();
    body: AutoBody;

    private _localThrust = new CANNON.Vec3();
    private _worldThrust = new CANNON.Vec3();
    private _localDelta = new CANNON.Vec3();
    private _worldDelta = new CANNON.Vec3();
    private _contactNormal = new CANNON.Vec3();
    private _localUp = new CANNON.Vec3(0, 0, 1);
    private _landerUp = new CANNON.Vec3();

    static initialize() {
        // Load model     
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

        // Load audio
        const audioLoader = new THREE.AudioLoader();
        Player.soundBufferEngine = audioLoader.loadAsync('./sounds/engine.ogg');

        const textureLoader = new THREE.TextureLoader();
        Player.smokeTexture = textureLoader.loadAsync('./textures/smoke.png');
    }

    constructor(scene: THREE.Scene, audioListenerPromise: Promise<THREE.AudioListener>, camera: THREE.Camera) {
        super();

        this.scene = scene;
        this.camera = camera;

        this.loadModel();
        this.initAudio(audioListenerPromise);

        camera.rotation.order = "YXZ";
        this.add(camera);

        this.rotation.order = "YXZ";

        // Collider
        const boxGeometry = new THREE.BoxGeometry(2, 2, 2);
        const capsuleMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true });
        const colliderMesh = new THREE.Mesh(boxGeometry, capsuleMaterial);
        colliderMesh.userData.obj = this;
        colliderMesh.position.copy(this.collider.start);
        this.colliderMesh = colliderMesh;
        this.scene.add(colliderMesh);
        this.colliderMesh.visible = Player.debug;

        this.body = this.cannonWorld.attachMesh(colliderMesh, { mass: 800 });
        this.body.angularDamping = 0.5;
        this.body.linearDamping = 0;
        this.body.addEventListener("collide", (event: any) => {
            const contact = event.contact;
            const impulse = Math.abs(contact.getImpactVelocityAlongNormal());
            
            this.onFloor = true;
            this.collisionVelocity = this.velocity.length();
            this.body.velocity.set(0, 0, 0);
            this.body.angularVelocity.set(0, 0, 0);

            this.smoke.visible = false;
            this.stopEngine();
            this.tweens.forEach(tween => tween.stop());

            // Hard crash — take damage
            if (impulse > Player.MAX_SAFE_IMPULSE) {
                this.damage(impulse * 8);
                this.dispatchEvent({ type: "cameraShake", intensity: impulse / 10 } as PlayerCameraShakeEvent);
                return;
            }

            // Check landing angle: lander's up should align with surface normal
            if (contact.bi === this.body) {
                contact.ni.negate(this._contactNormal);
            } else {
                this._contactNormal.copy(contact.ni);
            }

            this.body.quaternion.vmult(this._localUp, this._landerUp);
            const alignment = this._landerUp.dot(this._contactNormal);

            if (alignment < Player.LANDING_ANGLE_TOLERANCE) {
                // Tipped over landing
                this.damage(20);
                this.dispatchEvent({ type: "cameraShake", intensity: 0.3 } as PlayerCameraShakeEvent);
                return;
            }

            // Soft landing at good angle — start confirmation timer
            this.landingTimer = this.LANDING_CONFIRM_TIME;
            this.dispatchEvent({ type: "cameraShake", intensity: impulse / 20 } as PlayerCameraShakeEvent);
        }); 
        this.velocity = this.body.velocity;
    }

    async initAudio(audioListenerPromise: Promise<THREE.AudioListener>) {
        const audioListener = await audioListenerPromise;
        const soundBufferEngine = await Player.soundBufferEngine;
        this.soundEngine = new THREE.PositionalAudio(audioListener);
        this.soundEngine.setBuffer(soundBufferEngine);
        this.soundEngine.setVolume(1);
        this.soundEngine.setLoop(true);
    }

    async loadModel() {
        const landerModel = await Player.model;

        this.model = landerModel.scene;
        if (!this.model) return;

        this.tweens.push(new TWEEN.Tween(this.model.rotation)
            .to({ x: this.model.rotation.x, y: 0.05, z: this.model.rotation.z }, 2000)
            .easing(TWEEN.Easing.Quadratic.InOut)
            .yoyo(true)
            .repeat(Infinity)
            .start());

        this.model.layers.enable(1); // bloom layer
        this.add(this.model);

        this.smoke.visible = false;
        const smokeTexture = await Player.smokeTexture;
        const smokeMaterial = new THREE.MeshBasicMaterial({ map: smokeTexture, color: 0xcccccc, fog: true, opacity: 0.5, transparent: true });

        const smokeParticleGeo = new THREE.PlaneGeometry(1, 1);
        for (let i = 0; i < 7; i++) {
            const smokeSize = Math.random() * 3 + 7;
            const smokeParticle = new THREE.Mesh(smokeParticleGeo, smokeMaterial);
            smokeParticle.scale.set(smokeSize, smokeSize, 1);
            smokeParticle.lookAt(0, 1, 0);

            const xpos = Math.random() * 6 - 2;
            const ypos = Math.random() * 1 - 0.7;
            const zpos = Math.random() * 7 - 4;

            smokeParticle.position.set(xpos, ypos, zpos);

            this.tweens.push(new TWEEN.Tween(smokeParticle.rotation)
                .to({ x: smokeParticle.rotation.x, y: smokeParticle.rotation.y, z: 2 * Math.PI }, 500 + Math.random() * 500)
                .repeat(Infinity)
                .start());
            this.smoke.add(smokeParticle);
        }
        this.model.add(this.smoke);
    }

    reset() {
        this.health = 100;
        this.fuel = 100;
        this.score = 0;
        this.landingTimer = 0;
        this.isThrusting = false;
        this.onFloor = false;
    }

    angleY = 0;
    angleX = 0;
    rotate(x: number, y: number) {
        if (this.onFloor) {
            this.camera.rotation.y -= x;
            this.camera.rotation.x += y;
        } else {
            this._localDelta.set(y, x, 0);
            this.body.quaternion.vmult(this._localDelta, this._worldDelta);
            this.body.angularVelocity.x -= this._worldDelta.x;
            this.body.angularVelocity.y -= this._worldDelta.y;
            this.body.angularVelocity.z -= this._worldDelta.z;
        }
    }

    /**
     * Apply thrust in body-local space with unified fuel cost.
     */
    useEngine(forwardVectorMultiplier: number | null, sideVectorMultiplyer: number | null) {
        if (this.fuel <= 0) {
            this.fuel = 0;
            return;
        }

        this.isThrusting = true;

        if (this.soundEngine && !this.soundEngine.isPlaying) {
            this.soundEngine.play();
        }

        // Build thrust vector in body-local space
        this._localThrust.set(
            (sideVectorMultiplyer ?? 0),
            0,
            -(forwardVectorMultiplier ?? 0) * 1.5
        );

        // Transform to world space using body orientation
        this.body.quaternion.vmult(this._localThrust, this._worldThrust);
        this.body.velocity.vadd(this._worldThrust, this.body.velocity);

        // Unified fuel cost
        const totalThrust = Math.abs(sideVectorMultiplyer ?? 0) + Math.abs(forwardVectorMultiplier ?? 0);
        this.fuel -= totalThrust * Player.FUEL_COST_RATE;
    }

    /**
     * Stop the engine sound when not thrusting.
     */
    stopEngine() {
        if (this.soundEngine && this.soundEngine.isPlaying) {
            this.soundEngine.stop();
        }
        this.isThrusting = false;
    }

    /**
     * Process inbound damage.
     */
    damage(amount: number) {
        if (this.health === 0) return;
        
        this.health -= amount * this.damageMultiplyer;
        this.dispatchEvent({ type: "damaged" } as PlayerDamageEvent);
        if (this.health <= 0) {
            this.health = 0;
            this.fuel = 0;
            this.dispatchEvent({ type: "dead" } as PlayerDeadEvent);
        }
    }

    update(deltaTime: number, world: World): void {
        this.currentSpeed = this.velocity.length();
        
        // Calculate vertical speed relative to the moon (origin)
        // A negative value means moving towards the moon
        this.radialVector.copy(this.position).normalize();
        this.velocityVector.set(this.velocity.x, this.velocity.y, this.velocity.z);
        this.verticalSpeed = this.velocityVector.dot(this.radialVector);

        this.position.copy(this.colliderMesh.position);
        this.rotation.copy(this.colliderMesh.rotation);

        this.colliderMesh.visible = Player.debug;

        // Stop engine sound if not thrusting this frame
        if (!this.isThrusting && this.soundEngine && this.soundEngine.isPlaying) {
            this.stopEngine();
        }
        // Jitter camera when thrusting for engine realism
        if (this.isThrusting) {
            const jitterIntensity = 0.005;
            this.camera.position.x = this.homePosition.x + (Math.random() - 0.5) * jitterIntensity;
            this.camera.position.y = this.homePosition.y + (Math.random() - 0.5) * jitterIntensity;
            this.camera.position.z = this.homePosition.z + (Math.random() - 0.5) * jitterIntensity;
        } else {
            // Smoothly return camera to home position
            this.camera.position.lerp(this.homePosition, 0.1);
        }

        // Reset thrust flag each frame — controls() sets it if active
        this.isThrusting = false;

        // Frame-based landing confirmation
        if (this.landingTimer > 0 && this.onFloor) {
            this.landingTimer -= deltaTime;
            if (this.landingTimer <= 0 && this.health > 0) {
                this.dispatchEvent({ type: "landed" } as PlayerLandedEvent);
                this.landingTimer = 0;
            }
        } else if (!this.onFloor) {
            this.landingTimer = 0;
        }
    }

    teleport(position: THREE.Vector3, lookAtTarget?: THREE.Vector3): void {
        this.position.copy(position);
        
        const target = lookAtTarget || new THREE.Vector3(0, 0, 0);
        const tempCam = new THREE.PerspectiveCamera();
        tempCam.position.copy(position);
        tempCam.lookAt(target);
        
        this.rotation.copy(tempCam.rotation);
        this.colliderMesh.quaternion.copy(tempCam.quaternion);
        this.body.quaternion.set(tempCam.quaternion.x, tempCam.quaternion.y, tempCam.quaternion.z, tempCam.quaternion.w);

        this.collider.start.copy(position);
        this.collider.end.copy(position);
        this.collider.end.y += this.colliderHeight;
        this.colliderMesh.position.copy(this.collider.start);
        this.body.position.copy(this.collider.start as any);

        this.velocity.set(0, 0, 0);
        this.onFloor = false;
        this.landingTimer = 0;
        this.camera.position.set(-0.7, 0.8, 2);
        this.camera.rotation.set(0, 0, 0);
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