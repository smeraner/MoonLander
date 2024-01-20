import * as THREE from 'three';
import * as TWEEN from 'three/examples/jsm/libs/tween.module.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import Stats from 'three/addons/libs/stats.module.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { Player } from './player';
import { World } from './world';
import { ShaderToyPass } from './ShaderToyPass';
import { ShaderToyCrt } from './ShaderToyCrt';
import { WorldSceneMoonEarth } from './worldSceneMoonEarth';
import { WorldSceneWormhole } from './worldSceneWormhole';
import { WorldSceneDeepSpace } from './worldSceneDeepSpace';
import { WorldSceneClass } from './worldScene';

export class App {
    static BLOOM_SCENE = 1;

    static firstUserActionEvents = ['mousedown', 'touchstart', /*'mousemove','scroll',*/'keydown','gamepadconnected'];
    static firstUserAction = true;
    static gui: GUI = new GUI({ width: 200 });

    private darkMaterial = new THREE.MeshBasicMaterial( { color: 'black' } );
    private darkPointsMaterial = new THREE.PointsMaterial( { color: 'black', size: 0.1 } );
    private materials: any = {};

    private player: Player | undefined;
    private renderer: THREE.WebGLRenderer;
    private instructionText: any;
    private world: World | undefined;

    private keyStates: any = {};
    private clock: any;
    private STEPS_PER_FRAME = 5;
    private stats: Stats = new Stats();
    private scene: THREE.Scene | undefined;

    private audioListenerPromise: Promise<THREE.AudioListener>;
    private container: HTMLDivElement;
    public setAudioListener: any;
    private camera: THREE.PerspectiveCamera | undefined;
    private filterMesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial, THREE.Object3DEventMap> | undefined;
    private orbitVontrols: OrbitControls | undefined;
    private gamepad: Gamepad | null | undefined;
    private touchStartX= 0;
    private touchStartY= 0;
    private touchMoveX= 0;
    private touchMoveY= 0;
    private deferredInstallPrompt: any;
    private bloomComposer: EffectComposer | undefined;
    private finalComposer: EffectComposer | undefined;
    private bloomLayer = new THREE.Layers();

    onAfterFirstUserAction: () => void = () => {};

    constructor() {
        this.clock = new THREE.Clock();
        //App.gui.hide();
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

        this.container.appendChild( this.stats.dom );

        this.audioListenerPromise = new Promise<THREE.AudioListener>((resolve) => this.setAudioListener = resolve);


        this.init();
    }

    async init() {
       
        await this.initScene();

        App.firstUserActionEvents.forEach((event) => {
            document.addEventListener(event, this.onFirstUserAction.bind(this), { once: true });
        });

        window.addEventListener('beforeinstallprompt', (e) => {
            console.log('beforeinstallprompt Event fired');
            e.preventDefault();          
            // Stash the event so it can be triggered later.
            this.deferredInstallPrompt = e;
            
            return false;
          });

        window.addEventListener('resize', this.resize.bind(this));
        document.addEventListener('keydown', (event) => this.keyStates[event.code] = true);
        document.addEventListener('keyup', (event) => this.keyStates[event.code] = false);

        window.addEventListener("touchmove", (e) => this.hanldeTouch(e));
        window.addEventListener("touchstart", (e) => this.hanldeTouch(e));
        window.addEventListener("touchend", (e) => this.hanldeTouch(e));

        window.addEventListener('mousedown', () => this.renderer.domElement.requestPointerLock());
        window.addEventListener('mousemove', (e) => {
            if(!this.player) return;
            //check pointer lock
            if(document.pointerLockElement !== this.renderer.domElement) return;
            this.player.rotate(e.movementX * 0.001, e.movementY * -0.001);
            // this.player.rotation.y -= e.movementX * 0.001;
            // this.player.rotation.x += e.movementY * 0.001;
        });
        window.addEventListener("gamepadconnected", (e) => {
            this.gamepad = e.gamepad;
            console.log("Gamepad connected at index %d: %s. %d buttons, %d axes.",
            this.gamepad.index, this.gamepad.id,
            this.gamepad.buttons.length, this.gamepad.axes.length);
        });

    }

    hanldeTouch(e: TouchEvent) {
        var touch = e.touches[0] || e.changedTouches[0];
        if(!touch) return;
        const x = touch.pageX;
        const y = touch.pageY;

        if(e.type === "touchstart") {
            this.touchStartX = x;
            this.touchStartY = y;
            this.touchMoveX = 0;
            this.touchMoveY = 0;
        } else if(e.type === "touchend") {
            this.touchMoveX = 0;
            this.touchMoveY = 0;
        } else if(e.type === "touchmove") {
            this.touchMoveX = 4*(x - this.touchStartX)/window.innerWidth;
            this.touchMoveY = 4*(y - this.touchStartY)/window.innerHeight;
        }
    }

    initDebugGui() {
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
    }


    /**
     * Executes actions when the user performs their first interaction.
     * Plays audio and adds a light saber to the player's scene.
     */
    onFirstUserAction() {
        if(App.firstUserAction === false) return;
        App.firstUserAction = false;

        App.firstUserActionEvents.forEach((event) => {
            document.removeEventListener(event, this.onFirstUserAction);
        });

        document.getElementById('loading')?.remove();

        //init audio
        const listener = new THREE.AudioListener();
        if (this.setAudioListener) {
            this.setAudioListener(listener);
        }

        window.addEventListener('blur', () => listener.context.suspend());
        window.addEventListener('focus', () => listener.context.resume());
        
        //start game loop
        this.renderer.setAnimationLoop(this.update.bind(this));

        this.onAfterFirstUserAction();
    }

    askInstallPWA() {
        //already pwa
        if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any)["standalone"] === true) {
            return;
        }

        if(this.deferredInstallPrompt) this.deferredInstallPrompt.prompt();
    }

    /***
     * @returns {Promise}
     */
    async initScene() {

        //init world
        this.world = new World(this.audioListenerPromise, App.gui);
        this.world.addEventListener('needHudUpdate', () => this.updateHud());
        this.world.addEventListener('levelUp', () => this.levelUp());
        this.scene = this.world.scene;

        let fov = 70;
        this.camera = new THREE.PerspectiveCamera(
            fov,
            window.innerWidth / window.innerHeight,
        )

        let filterGeometry = new THREE.SphereGeometry(0.5, 15, 32); // camera near is 0.1, camera goes inside this sphere
        let filterMaterial = new THREE.MeshBasicMaterial({color: 0xff0000, transparent: true, opacity: 0.35, side: THREE.BackSide});
        let filterMesh = new THREE.Mesh(filterGeometry, filterMaterial);
        filterMesh.visible = false;
        this.camera.add(filterMesh);
        this.filterMesh = filterMesh;

        //init player
        this.player = new Player(this.scene, this.audioListenerPromise, this.camera);
        this.player.teleport(this.world.playerSpawnPoint);
        this.player.addEventListener('dead', () => {
            this.vibrate(1000);
            this.updateHud();
            if(!this.world || !this.player) return;
            this.world.allLightsOff();
            
            // this.world.stopWorldAudio();
            // this.player.teleport(this.world.playerSpawnPoint);

            // setTimeout(() => {
            //     this.restart();
            // }, 3000);
        });
        this.player.addEventListener('damaged', () => {
            this.vibrate(100);
            this.fadeHit();
            this.updateHud();
        });
        this.scene.add(this.player);
        this.updateHud();

        //this.onAfterFirstUserAction = async () => { this.levelUp(); }

        const crtPass = new ShaderToyCrt(this.renderer, { warp: { value: 0 }, scan: { value: 0 } });
        const bloom = new UnrealBloomPass( new THREE.Vector2( window.innerWidth, window.innerHeight ), 0, 0.4, 0.85 );
        //const interStellarPass = new ShaderToyInterstellar(this.renderer);

        const renderScene = new RenderPass( this.scene, this.camera );
        const outputPass = new OutputPass();
        this.finalComposer = new EffectComposer( this.renderer );
        this.finalComposer.addPass( renderScene );
        this.finalComposer.addPass( bloom );
        this.finalComposer.addPass( crtPass );
        //this.finalComposer.addPass( interStellarPass );
        this.finalComposer.addPass( outputPass );

        //this.enableOrbitControls();
        this.onAfterFirstUserAction = async () => { this.levelUp(WorldSceneWormhole); }

        this.resize();
    }

    async levelUp(nextWorldScene: WorldSceneClass<any> | undefined = undefined) {
        if(!this.world || !this.player) return;

        if(!nextWorldScene) {
            if(!this.world.worldScene) {
                nextWorldScene = WorldSceneMoonEarth;
            } else if(this.world.worldScene instanceof WorldSceneMoonEarth) {
                nextWorldScene = WorldSceneWormhole;
            } else if(this.world.worldScene instanceof WorldSceneWormhole) {
                nextWorldScene = WorldSceneDeepSpace;
            }
        }

        if(nextWorldScene === WorldSceneMoonEarth) {
            const pass = this.finalComposer?.passes.find((p)=>p instanceof ShaderToyCrt) as ShaderToyCrt;
            if(pass) {
                pass.uniforms.warp.value = 0.95;
                pass.uniforms.scan.value = 0.95;
                new TWEEN.Tween(pass.uniforms)
                    .to({warp:{value: 0}, scan:{value:0}}, 5000)
                    .onComplete(() => { if(pass) pass.enabled = false;})
                    .delay(5000)
                    .start();
            }
            this.world.loadScene(new WorldSceneMoonEarth()); 
            this.fadeClear(2000, 0xffffff);

        } else if(nextWorldScene === WorldSceneWormhole) {
            await this.fadeBlack(500);
            this.world.stopWorldAudio();
            this.vibrate(8000);
            this.world.loadScene(new WorldSceneWormhole()); 
            this.fadeClear(500, 0xffffff);

            const pass = this.finalComposer?.passes.find((p)=>p instanceof UnrealBloomPass) as UnrealBloomPass;
            if(pass) {
                pass.strength = 1.5;
                new TWEEN.Tween(pass)
                    .to({strength:0}, 1000)
                    .onComplete(() => { if(pass) pass.enabled = false;})
                    .delay(7000)
                    .start();
            }

        } else if(nextWorldScene === WorldSceneDeepSpace) {
            this.fade(0xffffff, 0, 500);
            this.world.stopWorldAudio();
            this.player.teleport(this.world.playerSpawnPoint);
            this.world.allLightsOff();
            this.world.loadScene(new WorldSceneDeepSpace());
            this.fadeClear();
            return;
        } else if(nextWorldScene === undefined) {
            this.vibrate(1000);
            this.fadeDie();
            this.world.stopWorldAudio();
            return;
        }
        
    }

    enableOrbitControls() {
        if(!this.camera || !this.renderer) return;
        this.orbitVontrols = new OrbitControls( this.camera, this.renderer.domElement );
    }

    restart() {
        if(!this.world || !this.player) return;
        this.player.teleport(this.world.playerSpawnPoint);
        this.player.reset();
        this.world.reset();
        this.updateHud();
    }

    vibrate(ms = 100) {
        if(navigator.vibrate) navigator.vibrate(ms);
        if(this.gamepad && this.gamepad.vibrationActuator) {
            this.gamepad.vibrationActuator.playEffect("dual-rumble", {
                startDelay: 0,
                duration: ms,
                weakMagnitude: 1,
                strongMagnitude: 1
            });
        } 
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
        if(!this.filterMesh) return;
        this.filterMesh.material.color.setHex(color);
        this.filterMesh.material.opacity = direction? 0 : 1;
        this.filterMesh.visible = true;
        return new Promise((resolve) => {
            if(this.filterMesh)
                new TWEEN.Tween(this.filterMesh.material)
                .to({opacity: direction}, ms)
                .onComplete(() => { if(this.filterMesh) this.filterMesh.visible = direction? true : false;})
                .onComplete(() => resolve(true))
                .start();
        });
    }

    displayWinMessage() {
        if(!this.player || !this.world) return;
        this.fadeBlack();
        this.updateInstructionText("You win! Reload to restart.");
        this.world.allLightsOff();
        this.world.stopWorldAudio();
    }

    private resize(): void {
        if(!this.player || !this.camera) return;

        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.bloomComposer?.setSize(window.innerWidth, window.innerHeight);
        this.finalComposer?.setSize(window.innerWidth, window.innerHeight);
    }

    private controls(deltaTime: number): void {
        if(!this.player) return;       
        const speedDelta = deltaTime * (this.player.onFloor ? this.player.speedOnFloor : this.player.speedInAir);

        //keyboard controls
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

        if (this.keyStates['Space']) {
            //this.player.jump();
        }

        //touch move
        if(this.touchMoveX > 0 || this.touchMoveY > 0) {
            this.player.useEngine(-this.touchMoveY * speedDelta, this.touchMoveX * speedDelta);
        }

        //gamepad controls
        if(this.gamepad) {
            this.gamepad = navigator.getGamepads()[this.gamepad.index];
            if(!this.gamepad) return;
            if(this.gamepad.axes[1] !== 0 || this.gamepad.axes[0] !== 0) {
                this.player.useEngine(-this.gamepad.axes[1] * speedDelta, this.gamepad.axes[0] * speedDelta);
            }
            this.player.rotate(this.gamepad.axes[2] * 0.001, this.gamepad.axes[3] * -0.001);
            if(this.gamepad.buttons[0].pressed) {
                this.restart();
            }
        }

    }

    private updateHud(){
        if(!this.player || !this.world) return;

        let hudText = ``;
        if(this.player.health === 0) {
            hudText = " ☠ Game over. Refresh to restart.";
        } else {
            hudText += ` ♥ ${this.player.health.toFixed(0)}`;
            hudText += ` -> ${this.player.currentSpeed.toFixed(0)} m/s`;
            hudText += ` 🞖 ${this.world.metersToLanding.toFixed(1)} m`;
            hudText += ` ⛽ ${this.player.fuel.toFixed(1)} %`;
        }

        this.updateInstructionText(hudText);
    }

    private updateInstructionText(text: string): void {
        const hud = document.getElementById('hud');
        if(hud) hud.innerHTML = text;
        // if(!this.player || !this.camera) return;

        // this.camera.remove(this.instructionText);
        // this.instructionText = createText(text, 0.04);
        // this.instructionText.position.set(0,0.1,-0.2);
        // this.instructionText.scale.set(0.3,0.3,0.3);
        // this.camera.add(this.instructionText);
    }

    private teleportPlayerIfOob(): void {
        if(!this.player || !this.world) return;
        if (this.world && this.player.position.y <= -25) {
            this.player.teleport(this.world.playerSpawnPoint);
        }
    }

    public update(): void {
        if(!this.player || !this.scene || !this.world || !this.camera) return;

        const deltaTime = Math.min(0.05, this.clock.getDelta()) / this.STEPS_PER_FRAME;

        for (let i = 0; i < this.STEPS_PER_FRAME; i++) {
            this.controls(deltaTime);

            this.player.update(deltaTime, this.world);
            this.world.update(deltaTime, this.player);

            this.teleportPlayerIfOob();
        }

        this.orbitVontrols?.update(deltaTime);
        TWEEN.update();
        this.stats.update();

        this.render();
    }

    render() {
        if(!this.scene || !this.camera) return;

        if(!this.finalComposer){
            this.renderer.render(this.scene, this.camera);
            return;
        }

        // this.scene.traverse( this.darkenNonBloomed.bind(this) );
        // this.bloomComposer.render();
        // this.scene.traverse( this.restoreMaterial.bind(this) );

        // render the entire scene, then render bloom scene on top
        this.finalComposer.render();
    }

    darkenNonBloomed( obj: THREE.Object3D ) {
        const mesh = obj as THREE.Mesh;
        if ( mesh.isMesh && this.bloomLayer.test( obj.layers ) === false ) {
            this.materials[ obj.uuid ] = mesh.material;
            mesh.material = this.darkMaterial;
        } else if ( (obj as THREE.Points).isPoints && this.bloomLayer.test( obj.layers ) === false ) {
            this.materials[ obj.uuid ] = mesh.material;
            mesh.material = this.darkPointsMaterial;
        }
    }

    restoreMaterial( obj: THREE.Object3D ) {
        const mesh = obj as THREE.Mesh;
         if ( this.materials[ obj.uuid ] ) {
            mesh.material = this.materials[ obj.uuid ];
            delete this.materials[ obj.uuid ];
        }
    }
}
