import * as THREE from 'three';
import { Player } from './player';
import { World } from './world';
import { WorldScene } from './worldScene';
import { WorldSceneStars, WorldSceneStarsSuccessEvent } from './worldSceneStars';
import { AutoCannonWorld } from 'auto-cannon-world';

const MOON_RADIUS = 100;
const DISTANCE_SCALE = 100;
const SURFACE_OFFSET = 44;

export class WorldSceneMoonEarth extends WorldSceneStars implements WorldScene {

    static soundBufferAmbient: Promise<AudioBuffer>;
    static initialize() {
        const audioLoader = new THREE.AudioLoader();
        WorldSceneMoonEarth.soundBufferAmbient = audioLoader.loadAsync('./sounds/ambient.ogg');
    }

    moon: THREE.Mesh | undefined;
    moonUniforms: any;
    earth: THREE.Mesh | undefined;
    soundBufferAmbient: Promise<AudioBuffer>;

    cannonWorld = AutoCannonWorld.getWorld();

    constructor() {
        super();
        this.soundBufferAmbient = WorldSceneMoonEarth.soundBufferAmbient;
        this.cannonWorld.maxDistanceNewtonGravity = 1000;
    }

    public async build(world: World, player: Player) {
        const collisionMap = new THREE.Object3D();
        const textureLoader = new THREE.TextureLoader();

        // Load all textures in parallel
        const [moonTexture, moonNormalTexture, earthTexture, earthReflectionTexture, earthCloudsTexture] = await Promise.all([
            textureLoader.loadAsync('./textures/moon.jpg'),
            textureLoader.loadAsync('./textures/moon_normal.jpg'),
            textureLoader.loadAsync('./textures/earth.jpg'),
            textureLoader.loadAsync('./textures/earth_reflection.jpg'),
            textureLoader.loadAsync('./textures/earth_clouds.jpg'),
        ]);

        // Moon
        const moonMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: moonTexture,
            displacementMap: moonTexture,
            displacementScale: 0.2,
            normalMap: moonNormalTexture,
            normalScale: new THREE.Vector2(0.3, 0.3)
        });

        moonMaterial.onBeforeCompile = (shader) => {
            shader.uniforms.detailOpacity = { value: 0 };
            this.moonUniforms = shader.uniforms;

            shader.fragmentShader = `
                uniform float detailOpacity;
                
                float hash(vec2 p) {
                    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
                }

                float noise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);
                    return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), f.x),
                               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
                }

                float fbm(vec2 p) {
                    float v = 0.0;
                    float a = 0.5;
                    for (int i = 0; i < 4; i++) {
                        v += a * noise(p);
                        p *= 2.0;
                        a *= 0.5;
                    }
                    return v;
                }
                
                ${shader.fragmentShader}
            `.replace(
                '#include <map_fragment>',
                `
                #include <map_fragment>
                float n = fbm(vMapUv * 15000.0);
                vec3 detailColor = vec3(0.5 + n * 0.5);
                diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * detailColor, detailOpacity);
                `
            );
        };

        const moonGeometry = new THREE.SphereGeometry(MOON_RADIUS, 64, 64);
        const moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
        moonMesh.castShadow = true;
        moonMesh.receiveShadow = true;
        this.moon = moonMesh;
        collisionMap.add(moonMesh);
        const moonbody = this.cannonWorld.attachMesh(moonMesh, { mass: 1.5e17 });
        moonbody.angularVelocity.set(0, 0.01, 0);

        // Earth
        const earthGeometry = new THREE.SphereGeometry(63, 64, 64);
        const earthMaterial = new THREE.MeshStandardMaterial({ map: earthTexture, metalnessMap: earthReflectionTexture, roughness: 0.5, metalness: 0.5 });
        const earthAtmosphereMaterial = new THREE.MeshStandardMaterial({ map: earthCloudsTexture, transparent: true, opacity: 0.5 });
        const earthAtmosphere = new THREE.Mesh(earthGeometry.clone().scale(1.01, 1.01, 1.01), earthAtmosphereMaterial);
        const earth = new THREE.Mesh(earthGeometry, earthMaterial);
        earth.position.set(1800, 0, 700);
        earth.add(earthAtmosphere);
        this.earth = earth;
        collisionMap.add(earth);

        this.buildHemisphere();

        player.addEventListener("landed", () => {
            this.dispatchEvent({ type: "success" } as WorldSceneStarsSuccessEvent);
        });

        this.add(collisionMap);

        return collisionMap;
    }

    public update(deltaTime: number, world: World, player: Player) {
        if (!this.moon || !this.earth) return;

        this.cannonWorld.step(1 / 60, deltaTime, 3);

        this.earth.rotation.y += 0.01 * deltaTime;

        // Check if player is on moon
        if (player.onFloor) {
            world.metersToLanding = 0;
            if (this.moonUniforms) this.moonUniforms.detailOpacity.value = 1.0;
        } else {
            const distanceFromSurface = player.position.distanceTo(this.moon.position) - MOON_RADIUS;
            world.metersToLanding = distanceFromSurface * DISTANCE_SCALE - SURFACE_OFFSET;

            if (this.moonUniforms) {
                // Fade in from 150 units away down to 0 units
                let targetOpacity = 1.0 - (distanceFromSurface / 150);
                this.moonUniforms.detailOpacity.value = Math.max(0, Math.min(1, targetOpacity));
            }

            if (world.metersToLanding < 200) {
                player.smoke.visible = true;
            } else {
                player.smoke.visible = false;
            }
        }

        super.update(deltaTime, world, player);
    }

    private detachPlayerFromMoon(player: Player, world: World) {
        if (!this.moon) return;
        player.position.copy(this.moon.localToWorld(player.position));
        player.removeFromParent();
        world.scene.add(player);
    }

    private attachPlayerToMoon(player: Player) {
        if (!this.moon) return;
        player.position.copy(this.moon.worldToLocal(player.position));
        player.removeFromParent();
        this.moon.add(player);
    }
}
WorldSceneMoonEarth.initialize();