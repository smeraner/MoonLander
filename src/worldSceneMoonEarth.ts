import * as THREE from 'three';
import * as CANNON from 'cannon-es'
import { Player } from './player';
import { World } from './world';
import { WorldScene } from './worldScene';
import { WorldSceneStars, WorldSceneStarsSuccessEvent } from './worldSceneStars';
import { AutoCannonWorld } from './AutoCannonWorld';


export class WorldSceneMoonEarth extends WorldSceneStars implements WorldScene {


    static soundBufferAmbient: Promise<AudioBuffer>;
    static initialize() {
        //load audio     
        const audioLoader = new THREE.AudioLoader();
        WorldSceneMoonEarth.soundBufferAmbient = audioLoader.loadAsync('./sounds/ambient.ogg');

        // World.soundBufferIntro = audioLoader.loadAsync('./sounds/intro.ogg');
    }

    moon: THREE.Mesh | undefined;
    earth: THREE.Mesh | undefined;
    soundBufferAmbient: Promise<AudioBuffer>;

    cannonWorld= AutoCannonWorld.getWorld();

    constructor() {
        super();
        this.soundBufferAmbient = WorldSceneMoonEarth.soundBufferAmbient;

        this.cannonWorld.addNewtonGravity();
    }

    public async build(world: World) {
        const collisionMap = new THREE.Object3D();
        const textureLoader = new THREE.TextureLoader();
        const moonTexture = await textureLoader.loadAsync('./textures/moon.jpg');
        const moonNormalTexture = await textureLoader.loadAsync('./textures/moon_normal.jpg');

        const moonMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: moonTexture,
            displacementMap: moonTexture,
            displacementScale: 0.2,
            normalMap: moonNormalTexture,
            normalScale: new THREE.Vector2(0.3, 0.3)
        });

        const moonGeometry = new THREE.SphereGeometry(17, 64, 64); //1.737,4 km
        const moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
        moonMesh.castShadow = true;
        moonMesh.receiveShadow = true;
        this.moon = moonMesh;
        collisionMap.add(moonMesh);
        this.cannonWorld.attachMesh(moonMesh, { mass: 734767 });

        const cubeGeometry = new THREE.BoxGeometry(5, 5, 5);
        const cubeMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const addTestCube = (x: number, y: number, z: number) => {
            const cubeMesh = new THREE.Mesh(cubeGeometry, cubeMaterial);
            cubeMesh.position.set(x, y, z);
            collisionMap.add(cubeMesh);
            this.cannonWorld.attachMesh(cubeMesh, { mass: 50 });
        }
        addTestCube(0, 25, 0);
        addTestCube(0, -25, 0);
        addTestCube(25, 25, 0);
        addTestCube(-25, 25, 0);

        const earthTexture = await textureLoader.loadAsync('./textures/earth.jpg');
        const earthReflectionTexture = await textureLoader.loadAsync('./textures/earth_reflection.jpg');
        const earthCloudsTexture = await textureLoader.loadAsync('./textures/earth_clouds.jpg');
        const earthGeometry = new THREE.SphereGeometry(63, 64, 64); //6371 km
        const earthMaterial = new THREE.MeshStandardMaterial({ map: earthTexture, metalnessMap: earthReflectionTexture, roughness: 0.5, metalness: 0.5 });
        const earthAtmosphereMaterial = new THREE.MeshStandardMaterial({ map: earthCloudsTexture, transparent: true, opacity: 0.5 });
        const earthAtmosphere = new THREE.Mesh(earthGeometry.clone().scale(1.01, 1.01, 1.01), earthAtmosphereMaterial);
        const earth = new THREE.Mesh(earthGeometry, earthMaterial);
        earth.position.set(1800, 0, 700);
        earth.add(earthAtmosphere);
        this.earth = earth;
        collisionMap.add(earth);

        this.buildHemisphere();

        this.add(collisionMap);

        return collisionMap;
    }

    public update(deltaTime: number, world: World, player: Player) {
        if (!this.moon ||!this.earth) return;

        this.cannonWorld.step(1 / 60, deltaTime, 3);

        this.moon.rotation.y += 0.03 * deltaTime;

        this.earth.rotation.y += 0.01 * deltaTime;

        // gravity player to moon 1,62 m/s²
        const moonGlobalPosition = new THREE.Vector3();
        this.moon.getWorldPosition(moonGlobalPosition);
        const moonGravity = 1.62 * 50;
        const distanceToMoon = player.position.distanceTo(moonGlobalPosition);
        const gravityForce = moonGravity * (1 / distanceToMoon);
        player.velocity.addScaledVector(moonGlobalPosition.sub(player.position).normalize(), gravityForce * deltaTime);

        //check if player is on moon
        if(player.onFloor) {
            world.metersToLanding = 0;
            //first time player hits moon
            if(!world.playerHitMoon) {
                world.playerHitMoon = true;
                player.smoke.visible = false;
                player.tweens.forEach(tween => tween.stop());
                
                //attach player from sceen to moon                
                this.attachPlayerToMoon(player);

                const totalVelocity = player.collisionVelocity;
                console.log("playerHitMoon",totalVelocity);
                if(totalVelocity > 0.8) {
                    player.damage(totalVelocity*10);
                    setTimeout(() => { // wait for bounce animation
                        if(player.health > 0 && player.onFloor) {
                            this.detachPlayerFromMoon(player, world);
                            this.dispatchEvent({ type: "success" } as WorldSceneStarsSuccessEvent);
                        }
                    }, 2500);
                }
            }
        } else {
            world.metersToLanding = Number(((player.position.distanceTo(this.moon.position)-17) * 100)) - 44;

            //player left the moon
            if(world.playerHitMoon && world.scene) {
                world.playerHitMoon = false;
                player.tweens.forEach(tween => tween.start());

                //detach player from moon back to scene
                this.detachPlayerFromMoon(player, world);
            }
            if(world.metersToLanding < 200) {
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