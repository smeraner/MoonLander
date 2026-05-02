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

        const moonGeometry = new THREE.SphereGeometry(MOON_RADIUS, 64, 64);
        const moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
        moonMesh.castShadow = true;
        moonMesh.receiveShadow = true;
        this.moon = moonMesh;
        collisionMap.add(moonMesh);
        const moonbody = this.cannonWorld.attachMesh(moonMesh, { mass: 7.3483e16 });
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
        } else {
            const distanceFromSurface = player.position.distanceTo(this.moon.position) - MOON_RADIUS;
            world.metersToLanding = distanceFromSurface * DISTANCE_SCALE - SURFACE_OFFSET;

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