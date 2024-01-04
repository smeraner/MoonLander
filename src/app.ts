import * as THREE from 'three';
import * as TWEEN from 'three/examples/jsm/libs/tween.module.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import Stats from 'three/addons/libs/stats.module.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { createText } from 'three/addons/webxr/Text2D.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { Player } from './player';
import { World } from './world';

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
        this.renderer.shadowMap.type = THREE.VSMShadowMap;
        this.renderer.toneMapping = THREE.ReinhardToneMapping;
        this.container.appendChild(this.renderer.domElement);

        this.container.appendChild( this.stats.dom );

        this.audioListenerPromise = new Promise<THREE.AudioListener>((resolve) => {
            this.setAudioListener = resolve;
        });


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

        this.renderer.setAnimationLoop(this.update.bind(this));
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
            document.removeEventListener(event, this.onFirstUserAction.bind(this));
        });

        this.askInstallPWA();

        document.getElementById('loading')?.remove();

        //init audio
        const listener = new THREE.AudioListener();
        if (this.setAudioListener) {
            this.setAudioListener(listener);
        }

        window.addEventListener('blur', () => listener.context.suspend());
        window.addEventListener('focus', () => listener.context.resume());
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
        this.world.addEventListener('collect', () => {
            this.vibrate(100);
        });
        this.scene = await this.world.loadScene();

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
            this.player.teleport(this.world.playerSpawnPoint);
            this.world.allLightsOff();
            this.world.stopWorldAudio();

            setTimeout(() => {
                this.restart();
            }, 3000);
        });
        this.player.addEventListener('damaged', () => {
            this.vibrate(100);
            this.blendHit();
            this.updateHud();
        });
        this.scene.add(this.player);
        this.updateHud();

        /*
        this.bloomLayer.set( App.BLOOM_SCENE );
        const renderScene = new RenderPass( this.scene, this.camera );

        const bloomPass = new UnrealBloomPass( new THREE.Vector2( window.innerWidth, window.innerHeight ), 1.5, 0.4, 0.85 );
        bloomPass.threshold = 0;
        bloomPass.strength = 0.4;
        bloomPass.radius = 1;

        this.bloomComposer = new EffectComposer( this.renderer );
        this.bloomComposer.renderToScreen = false;
        this.bloomComposer.addPass( renderScene );
        this.bloomComposer.addPass( bloomPass );

        const mixPass = new ShaderPass(
            new THREE.ShaderMaterial( {
                uniforms: {
                    baseTexture: { value: null },
                    bloomTexture: { value: this.bloomComposer.renderTarget2.texture }
                },
                vertexShader: `
                    varying vec2 vUv;
                    void main() {
                        vUv = uv;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
                    }`,
                fragmentShader: `
                    uniform sampler2D baseTexture;
                    uniform sampler2D bloomTexture;
        
                    varying vec2 vUv;
        
                    void main() {
        
                        gl_FragColor = ( texture2D( baseTexture, vUv ) + vec4( 1.0 ) * texture2D( bloomTexture, vUv ) );
        
                    }`,
                defines: {}
            } ), 'baseTexture'
        );
        mixPass.needsSwap = true;

        const outputPass = new OutputPass();

        this.finalComposer = new EffectComposer( this.renderer );
        this.finalComposer.addPass( renderScene );
        this.finalComposer.addPass( mixPass );
        this.finalComposer.addPass( outputPass );*/

        //this.enableOrbitControls();

        this.resize();
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

    blendHit() {
        if(!this.filterMesh) return;
        this.filterMesh.material.color.setHex(0xff0000);
        this.filterMesh.material.opacity = 0.35;
        this.filterMesh.visible = true;
        setTimeout(() => {
            if(!this.filterMesh) return;
            this.filterMesh.visible = false;
        }, 200);
    }

    blendDie() {
        if(!this.filterMesh) return;
        this.filterMesh.material.color.setHex(0xff0000);
        this.filterMesh.material.opacity = 1;
        this.filterMesh.visible = true;
    }

    blendBlack() {
        if(!this.filterMesh) return;
        this.filterMesh.material.color.setHex(0x000000);
        this.filterMesh.material.opacity = 1;
        this.filterMesh.visible = true;
    }

    blendClear() {
        if(!this.filterMesh) return;
        this.filterMesh.visible = false;
    }

    displayWinMessage() {
        if(!this.player || !this.world) return;
        this.blendBlack();
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
        if(!this.player) return;

        let hudText = `-> ${this.player.currentSpeed.toFixed(0)}`;
        if(this.player.health === 0) {
            hudText = " ☠ Game over. Refresh to restart.";
        } else {
            hudText += ` ♥ ${this.player.health.toFixed(0)}`;
        }
        hudText += ` 🞖 ${this.world?.metersToLanding.toFixed(1)} m`;

        this.updateInstructionText(hudText);
    }

    private updateInstructionText(text: string): void {
        if(!this.player || !this.camera) return;

        this.camera.remove(this.instructionText);
        this.instructionText = createText(text, 0.04);
        this.instructionText.position.set(0,0.1,-0.2);
        this.instructionText.scale.set(0.3,0.3,0.3);
        this.camera.add(this.instructionText);
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
        TWEEN.update(deltaTime);
        this.stats.update();

        this.render();
    }

    render() {
        if(!this.scene || !this.camera) return;

        if(!this.bloomComposer || !this.finalComposer){
            this.renderer.render(this.scene, this.camera);
            return;
        }

        this.scene.traverse( this.darkenNonBloomed.bind(this) );
        this.bloomComposer.render();
        this.scene.traverse( this.restoreMaterial.bind(this) );

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
