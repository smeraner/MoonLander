import * as THREE from 'three';
import { Player } from './player';
import { World } from './world';
import { WorldScene } from './worldScene';

export class WorldSceneMoonEarth implements WorldScene {

    moon: THREE.Mesh | undefined;
    earth: THREE.Mesh | undefined;

    public async build(world: World) {
        const collisionMap = new THREE.Object3D();
        const scene = new THREE.Object3D();
        
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
        const moon = new THREE.Mesh(moonGeometry, moonMaterial);
        moon.castShadow = true;
        moon.receiveShadow = true;
        moon.layers.enable(1); //bloom layer
        this.moon = moon;
        collisionMap.add(moon);

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

        world.buildHemisphere();

        return {collisionMap, scene};
    }

    public update(deltaTime: number, world: World, player: Player) {
        if (!this.moon ||!this.earth) return;

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
                player.position.copy(this.moon.worldToLocal(player.position));
                player.removeFromParent();
                this.moon.add(player);

                const totalVelocity = player.collisionVelocity;
                console.log("playerHitMoon",totalVelocity);
                if(totalVelocity > 0.8) {
                    player.damage(totalVelocity*10);
                }
            }
        } else {
            world.metersToLanding = Number(((player.position.distanceTo(this.moon.position)-17) * 100)) - 44;

            //player left the moon
            if(world.playerHitMoon && world.scene) {
                world.playerHitMoon = false;
                player.tweens.forEach(tween => tween.start());

                //detach player from moon back to scene
                player.position.copy(this.moon.localToWorld(player.position));
                player.removeFromParent();
                world.scene.add(player);
            }
            if(world.metersToLanding < 200) {
                player.smoke.visible = true;
            } else {
                player.smoke.visible = false;
            }
        }
    }
}