import * as THREE from 'three';
import * as TWEEN from 'three/examples/jsm/libs/tween.module.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import Stats from 'three/addons/libs/stats.module.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { Player, PlayerCameraShakeEvent } from './player';
import { World } from './world';
import { ShaderToyCrt } from './ShaderToyCrt';
import { WorldSceneMoonEarth } from './worldSceneMoonEarth';
import { WorldSceneWormhole } from './worldSceneWormhole';
import { WorldSceneDeepSpace } from './worldSceneDeepSpace';
import { WorldSceneClass } from './worldScene';

export class App {
    static BLOOM_SCENE = 1;

    static firstUserActionEvents = ['mousedown', 'touchstart', 'keydown', 'gamepadconnected'];
    static firstUserAction = true;
    static gui: GUI = new GUI({ width: 200 });

    private darkMaterial = new THREE.MeshBasicMaterial({ color: 'black' });
    private darkPointsMaterial = new THREE.PointsMaterial({ color: 'black', size: 0.1 });
    private materials: Record<string, THREE.Material | THREE.Material[]> = {};

    private player: Player | undefined;
    private renderer: THREE.WebGLRenderer;
    private world: World | undefined;

    private keyStates: Record<string, boolean> = {};
    private clock: THREE.Clock;
    private STEPS_PER_FRAME = 5;
    private stats: Stats = new Stats();
    private scene: THREE.Scene | undefined;

    private audioListenerPromise: Promise<THREE.AudioListener>;
    private container: HTMLDivElement;
    public setAudioListener: ((listener: THREE.AudioListener) => void) | undefined;
    private camera: THREE.PerspectiveCamera | undefined;
    private filterMesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> | undefined;
    private orbitControls: OrbitControls | undefined;
    private gamepad: Gamepad | null | undefined;
    private touchStartX = 0;
    private touchStartY = 0;
    private touchMoveX = 0;
    private touchMoveY = 0;
    private deferredInstallPrompt: any;
    private bloomComposer: EffectComposer | undefined;
    private finalComposer: EffectComposer | undefined;
    private bloomLayer = new THREE.Layers();
    private isPaused = false;

    // Camera shake state
    private cameraShakeIntensity = 0;
    private cameraShakeDecay = 5;
    private cameraOriginalPosition = new THREE.Vector3();

    onAfterFirstUserAction: () => void = () => {};

    constructor() {
        this.clock = new THREE.Clock();
        this.initDebugGui();

        this.container = document.createElement('div');
        document.body.appendChild(this.container);

        this.renderer = new THREE.WebGLRenderer({
            antialias: window.devicePixelRatio <= 1,
            powerPreference: "high-performance"
        });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.container.appendChild(this.renderer.domElement);

        this.container.appendChild(this.stats.dom);

        this.audioListenerPromise = new Promise<THREE.AudioListener>((resolve) => this.setAudioListener = resolve);

        this.init();
    }

    async init() {
        await this.initScene();

        App.firstUserActionEvents.forEach((event) => {
            document.addEventListener(event, this.onFirstUserAction.bind(this), { once: true });
        });

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredInstallPrompt = e;
            return false;
        });

        window.addEventListener('resize', this.resize.bind(this));
        document.addEventListener('keydown', (event) => {
            this.keyStates[event.code] = true;

            // ESC for pause
            if (event.code === 'Escape') {
                this.togglePause();
            }
        });
        document.addEventListener('keyup', (event) => this.keyStates[event.code] = false);

        window.addEventListener("touchmove", (e) => this.handleTouch(e));
        window.addEventListener("touchstart", (e) => this.handleTouch(e));
        window.addEventListener("touchend", (e) => this.handleTouch(e));

        this.renderer.domElement.addEventListener('mousedown', async () => {
            if (this.isPaused) return;
            if (document.pointerLockElement === this.renderer.domElement) return;
            try {
                await this.renderer.domElement.requestPointerLock();
            } catch (e) {
                console.log("requestPointerLock failed", e);
            }
        });
        window.addEventListener('mousemove', (e) => {
            if (!this.player) return;
            if (document.pointerLockElement !== this.renderer.domElement) return;
            this.player.rotate(e.movementX * 0.001, e.movementY * 0.001);
        });
        window.addEventListener("gamepadconnected", (e) => {
            this.gamepad = e.gamepad;
            console.log("Gamepad connected at index %d: %s. %d buttons, %d axes.",
                this.gamepad.index, this.gamepad.id,
                this.gamepad.buttons.length, this.gamepad.axes.length);
        });

        // Overlay buttons
        document.getElementById('restart-btn')?.addEventListener('click', () => this.restartGame());
        document.getElementById('resume-btn')?.addEventListener('click', () => this.togglePause());
        document.getElementById('restart-pause-btn')?.addEventListener('click', () => {
            this.isPaused = false;
            this.restartGame();
        });
    }

    handleTouch(e: TouchEvent) {
        var touch = e.touches[0] || e.changedTouches[0];
        if (!touch) return;
        const x = touch.pageX;
        const y = touch.pageY;

        if (e.type === "touchstart") {
            this.touchStartX = x;
            this.touchStartY = y;
            this.touchMoveX = 0;
            this.touchMoveY = 0;
        } else if (e.type === "touchend") {
            this.touchMoveX = 0;
            this.touchMoveY = 0;
        } else if (e.type === "touchmove") {
            this.touchMoveX = 4 * (x - this.touchStartX) / window.innerWidth;
            this.touchMoveY = 4 * (y - this.touchStartY) / window.innerHeight;
        }
    }

    initDebugGui() {
        const axesHelper = new THREE.AxesHelper(5);
        axesHelper.visible = false;

        App.gui.add({ debugPlayer: false }, 'debugPlayer')
            .onChange(function (value) {
                Player.debug = value;
            });
        App.gui.add({ debugWorld: false }, 'debugWorld')
            .onChange((value: boolean) => {
                if (this.world && this.world.helper) {
                    this.world.helper.visible = value;
                }
            });
        App.gui.add({ showAxesHelper: false }, 'showAxesHelper')
            .onChange((value: boolean) => {
                axesHelper.removeFromParent();
                this.player?.add(axesHelper);
                axesHelper.visible = value;
            });
    }

    /**
     * Executes actions when the user performs their first interaction.
     */
    onFirstUserAction() {
        if (App.firstUserAction === false) return;
        App.firstUserAction = false;

        App.firstUserActionEvents.forEach((event) => {
            document.removeEventListener(event, this.onFirstUserAction);
        });

        document.getElementById('loading')?.remove();

        // Init audio
        const listener = new THREE.AudioListener();
        if (this.setAudioListener) {
            this.setAudioListener(listener);
        }

        window.addEventListener('blur', () => listener.context.suspend());
        window.addEventListener('focus', () => listener.context.resume());

        // Start game loop
        this.renderer.setAnimationLoop(this.update.bind(this));

        this.onAfterFirstUserAction();
    }

    askInstallPWA() {
        if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any)["standalone"] === true) {
            return;
        }
        if (this.deferredInstallPrompt) this.deferredInstallPrompt.prompt();
    }

    async initScene() {
        // Init world
        this.world = new World(this.audioListenerPromise, App.gui);
        this.world.addEventListener('needHudUpdate', () => this.updateHud());
        this.world.addEventListener('levelUp', () => this.levelUp());
        this.scene = this.world.scene;

        let fov = 70;
        this.camera = new THREE.PerspectiveCamera(
            fov,
            window.innerWidth / window.innerHeight,
        );

        let filterGeometry = new THREE.SphereGeometry(0.5, 15, 32);
        let filterMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.35, side: THREE.BackSide });
        let filterMesh = new THREE.Mesh(filterGeometry, filterMaterial);
        filterMesh.visible = false;
        this.camera.add(filterMesh);
        this.filterMesh = filterMesh;

        // Init player
        this.player = new Player(this.scene, this.audioListenerPromise, this.camera);
        this.player.teleport(this.world.playerSpawnPoint);
        this.player.addEventListener('dead', () => {
            this.vibrate(1000);
            this.updateHud();
            if (!this.world || !this.player) return;
            this.world.allLightsOff();

            // Show game-over overlay
            const gameOverEl = document.getElementById('game-over');
            if (gameOverEl) gameOverEl.style.display = 'flex';
            document.exitPointerLock();
        });
        this.player.addEventListener('damaged', () => {
            this.vibrate(100);
            this.fadeHit();
            this.updateHud();
        });
        this.player.addEventListener('cameraShake', (event: PlayerCameraShakeEvent) => {
            this.triggerCameraShake(event.intensity);
        });
        this.scene.add(this.player);
        this.updateHud();

        const crtPass = new ShaderToyCrt(this.renderer, { warp: { value: 0 }, scan: { value: 0 } });
        const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0, 0.4, 0.85);
        bloom.enabled = false; // Disabled until needed — saves GPU

        const renderScene = new RenderPass(this.scene, this.camera);
        const outputPass = new OutputPass();
        this.finalComposer = new EffectComposer(this.renderer);
        this.finalComposer.addPass(renderScene);
        this.finalComposer.addPass(bloom);
        this.finalComposer.addPass(crtPass);
        this.finalComposer.addPass(outputPass);

        this.onAfterFirstUserAction = async () => { this.levelUp(); };

        this.resize();
    }

    async levelUp(nextWorldScene: WorldSceneClass<any> | undefined = undefined) {
        if (!this.world || !this.player) return;

        if (!nextWorldScene) {
            if (!this.world.worldScene) {
                nextWorldScene = WorldSceneMoonEarth;
            } else if (this.world.worldScene instanceof WorldSceneMoonEarth) {
                nextWorldScene = WorldSceneWormhole;
            } else if (this.world.worldScene instanceof WorldSceneWormhole) {
                nextWorldScene = WorldSceneDeepSpace;
            }
        }

        if (nextWorldScene === WorldSceneMoonEarth) {
            const pass = this.finalComposer?.passes.find((p) => p instanceof ShaderToyCrt) as ShaderToyCrt;
            if (pass) {
                pass.enabled = true;
                pass.uniforms.warp.value = 0.95;
                pass.uniforms.scan.value = 0.95;
                new TWEEN.Tween(pass.uniforms)
                    .to({ warp: { value: 0 }, scan: { value: 0 } }, 5000)
                    .onComplete(() => { if (pass) pass.enabled = false; })
                    .delay(5000)
                    .start();
            }
            this.world.loadScene(new WorldSceneMoonEarth(), this.player);
            this.player.teleport(this.world.playerSpawnPoint);
            this.fadeClear(2000, 0xffffff);

        } else if (nextWorldScene === WorldSceneWormhole) {
            await this.fadeBlack(500);
            this.world.stopWorldAudio();
            this.vibrate(8000);
            this.world.loadScene(new WorldSceneWormhole(), this.player);
            this.fadeClear(500, 0xffffff);

            const pass = this.finalComposer?.passes.find((p) => p instanceof UnrealBloomPass) as UnrealBloomPass;
            if (pass) {
                pass.enabled = true;
                pass.strength = 1.5;
            }

        } else if (nextWorldScene === WorldSceneDeepSpace) {
            this.fade(0xffffff, 0, 500);
            this.world.stopWorldAudio();
            this.player.teleport(this.world.playerSpawnPoint);
            this.world.allLightsOff();
            this.world.loadScene(new WorldSceneDeepSpace(), this.player);
            this.fadeClear();

            const pass = this.finalComposer?.passes.find((p) => p instanceof UnrealBloomPass) as UnrealBloomPass;
            if (pass) {
                pass.enabled = true;
                pass.strength = 0.5;
            }
            return;
        } else if (nextWorldScene === undefined) {
            const pass = this.finalComposer?.passes.find((p) => p instanceof ShaderToyCrt) as ShaderToyCrt;
            if (pass) {
                pass.enabled = true;
                pass.uniforms.warp.value = 0;
                pass.uniforms.scan.value = 0;
                new TWEEN.Tween(pass.uniforms)
                    .to({ warp: { value: 0.95 }, scan: { value: 0.95 } }, 1000)
                    .start();
            }
            this.vibrate(1000);
            this.player.damage(100);
            this.fadeDie();
            return;
        }
    }

    enableOrbitControls() {
        if (!this.camera || !this.renderer) return;
        this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    }

    /**
     * Full restart: reset player, world, HUD, and hide overlays.
     */
    restartGame() {
        if (!this.world || !this.player) return;

        // Hide overlays
        const gameOverEl = document.getElementById('game-over');
        if (gameOverEl) gameOverEl.style.display = 'none';
        const pauseEl = document.getElementById('pause-menu');
        if (pauseEl) pauseEl.style.display = 'none';
        this.isPaused = false;

        // Reset player and world
        this.player.teleport(this.world.playerSpawnPoint);
        this.player.reset();
        this.world.reset();
        this.world.allLightsOn();
        this.fadeClear(500);
        this.updateHud();

        // Re-request pointer lock
        try {
            this.renderer.domElement.requestPointerLock();
        } catch (e) { /* ignore */ }
    }

    togglePause() {
        if (!this.player || this.player.health === 0) return;

        this.isPaused = !this.isPaused;
        const pauseEl = document.getElementById('pause-menu');

        if (this.isPaused) {
            if (pauseEl) pauseEl.style.display = 'flex';
            document.exitPointerLock();
        } else {
            if (pauseEl) pauseEl.style.display = 'none';
            try {
                this.renderer.domElement.requestPointerLock();
            } catch (e) { /* ignore */ }
        }
    }

    vibrate(ms = 100) {
        if (navigator.vibrate) navigator.vibrate(ms);
        if (this.gamepad && this.gamepad.vibrationActuator) {
            this.gamepad.vibrationActuator.playEffect("dual-rumble", {
                startDelay: 0,
                duration: ms,
                weakMagnitude: 1,
                strongMagnitude: 1
            });
        }
    }

    triggerCameraShake(intensity: number) {
        this.cameraShakeIntensity = Math.min(intensity, 1);
    }

    private updateCameraShake(deltaTime: number) {
        if (!this.camera || this.cameraShakeIntensity <= 0.001) {
            this.cameraShakeIntensity = 0;
            return;
        }

        const shakeX = (Math.random() - 0.5) * 2 * this.cameraShakeIntensity * 0.15;
        const shakeY = (Math.random() - 0.5) * 2 * this.cameraShakeIntensity * 0.15;

        this.camera.position.x += shakeX;
        this.camera.position.y += shakeY;

        this.cameraShakeIntensity *= Math.max(0, 1 - this.cameraShakeDecay * deltaTime);
    }

    async fadeHit() {
        return this.fade(0xff0000, 0, 200);
    }

    async fadeDie() {
        return this.fade(0xff0000, 1, 1000);
    }

    async fadeBlack(ms = 1000) {
        return this.fade(0x000000, 1, ms);
    }

    async fadeClear(ms = 1000, from = 0x00000000) {
        return this.fade(from, 0, ms);
    }

    fade(color = 0x000000, direction = 1, ms = 1000) {
        if (!this.filterMesh) return;
        this.filterMesh.material.color.setHex(color);
        this.filterMesh.material.opacity = direction ? 0 : 1;
        this.filterMesh.visible = true;
        return new Promise((resolve) => {
            if (this.filterMesh)
                new TWEEN.Tween(this.filterMesh.material)
                    .to({ opacity: direction }, ms)
                    .onComplete(() => { if (this.filterMesh) this.filterMesh.visible = direction ? true : false; })
                    .onComplete(() => resolve(true))
                    .start();
        });
    }

    private resize(): void {
        if (!this.player || !this.camera) return;

        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.bloomComposer?.setSize(window.innerWidth, window.innerHeight);
        this.finalComposer?.setSize(window.innerWidth, window.innerHeight);
    }

    private controls(deltaTime: number): void {
        if (!this.player || this.isPaused) return;
        const speedDelta = deltaTime * (this.player.onFloor ? this.player.speedOnFloor : this.player.speedInAir);

        // Keyboard controls
        if (this.keyStates['KeyW']) {
            this.player.useEngine(speedDelta, null);
        }

        if (this.keyStates['KeyS']) {
            this.player.useEngine(-speedDelta, null);
        }

        if (this.keyStates['KeyA']) {
            this.player.useEngine(null, -speedDelta);
        }

        if (this.keyStates['KeyD']) {
            this.player.useEngine(null, speedDelta);
        }

        // Touch move — fixed: use !== 0 to allow all directions
        if (this.touchMoveX !== 0 || this.touchMoveY !== 0) {
            this.player.useEngine(-this.touchMoveY * speedDelta, this.touchMoveX * speedDelta);
        }

        // Gamepad controls
        if (this.gamepad) {
            this.gamepad = navigator.getGamepads()[this.gamepad.index];
            if (!this.gamepad) return;
            if (this.gamepad.axes[1] !== 0 || this.gamepad.axes[0] !== 0) {
                this.player.useEngine(-this.gamepad.axes[1] * speedDelta, this.gamepad.axes[0] * speedDelta);
            }
            this.player.rotate(this.gamepad.axes[2] * 0.001, this.gamepad.axes[3] * -0.001);
            if (this.gamepad.buttons[0].pressed) {
                this.restartGame();
            }
        }
    }

    private updateHud() {
        if (!this.player || !this.world) return;

        const healthBar = document.getElementById('health-bar');
        const healthValue = document.getElementById('health-value');
        const fuelBar = document.getElementById('fuel-bar');
        const fuelValue = document.getElementById('fuel-value');
        const speedValue = document.getElementById('speed-value');
        const vspeedValue = document.getElementById('vspeed-value');
        const altitudeValue = document.getElementById('altitude-value');

        if (healthBar) healthBar.style.width = `${this.player.health}%`;
        if (healthValue) {
            healthValue.textContent = this.player.health.toFixed(0);
            healthValue.className = 'hud-value' +
                (this.player.health < 25 ? ' critical' : this.player.health < 50 ? ' warning' : '');
        }

        if (fuelBar) fuelBar.style.width = `${Math.max(0, this.player.fuel)}%`;
        if (fuelValue) {
            fuelValue.textContent = `${this.player.fuel.toFixed(0)}%`;
            fuelValue.className = 'hud-value' +
                (this.player.fuel < 10 ? ' critical' : this.player.fuel < 25 ? ' warning' : '');
        }

        if (speedValue) speedValue.textContent = this.player.currentSpeed.toFixed(1);
        if (vspeedValue) {
            const vs = this.player.verticalSpeed;
            vspeedValue.textContent = (vs >= 0 ? '+' : '') + vs.toFixed(1);
            vspeedValue.className = 'hud-value' +
                (Math.abs(vs) > 8 ? ' critical' : Math.abs(vs) > 5 ? ' warning' : '');
        }
        if (altitudeValue) altitudeValue.textContent = Math.max(0, this.world.metersToLanding).toFixed(0);
    }

    private teleportPlayerIfOob(): void {
        if (!this.player || !this.world) return;
        if (this.world && this.player.position.y <= -25) {
            this.player.teleport(this.world.playerSpawnPoint);
        }
    }

    public update(): void {
        if (!this.player || !this.scene || !this.world || !this.camera) return;

        if (this.isPaused) {
            // Still render but don't advance game state
            this.render();
            return;
        }

        const deltaTime = Math.min(0.05, this.clock.getDelta()) / this.STEPS_PER_FRAME;

        for (let i = 0; i < this.STEPS_PER_FRAME; i++) {
            this.controls(deltaTime);

            this.player.update(deltaTime, this.world);
            this.world.update(deltaTime, this.player);

            this.teleportPlayerIfOob();
        }

        this.orbitControls?.update(deltaTime);
        this.updateCameraShake(deltaTime * this.STEPS_PER_FRAME);

        // Single TWEEN.update per frame
        TWEEN.update();
        this.stats.update();

        this.render();
    }

    render() {
        if (!this.scene || !this.camera) return;

        if (!this.finalComposer) {
            this.renderer.render(this.scene, this.camera);
            return;
        }

        this.finalComposer.render();
    }

    darkenNonBloomed(obj: THREE.Object3D) {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh && this.bloomLayer.test(obj.layers) === false) {
            this.materials[obj.uuid] = mesh.material;
            mesh.material = this.darkMaterial;
        } else if ((obj as THREE.Points).isPoints && this.bloomLayer.test(obj.layers) === false) {
            this.materials[obj.uuid] = mesh.material;
            mesh.material = this.darkPointsMaterial;
        }
    }

    restoreMaterial(obj: THREE.Object3D) {
        const mesh = obj as THREE.Mesh;
        if (this.materials[obj.uuid]) {
            mesh.material = this.materials[obj.uuid];
            delete this.materials[obj.uuid];
        }
    }
}
