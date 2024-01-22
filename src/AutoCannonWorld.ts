import * as THREE from 'three';
import * as CANNON from 'cannon-es'

export class AutoCannonWorld extends CANNON.World {
    private static oneWorld: AutoCannonWorld | undefined;
    static getWorld() {
        if (!AutoCannonWorld.oneWorld) {
            AutoCannonWorld.oneWorld = new AutoCannonWorld();
        }
        return AutoCannonWorld.oneWorld;
    }

    addNewtonGravity() {
        this.addEventListener('preStep', () => {
            this.bodies.forEach(body => {
                this.bodies.forEach(bodyB => {
                    if (body !== bodyB) {
                        const distance = body.position.distanceTo(bodyB.position);
                        if (distance < 100) {
                            const force = new CANNON.Vec3();
                            body.position.vsub(bodyB.position, force);
                            force.normalize();
                            force.scale(body.mass / Math.pow(distance, 2), force);
                            bodyB.force.vadd(force, bodyB.force);
                        }
                    }
                })
            })
          });
    }

    attachMesh(mesh: THREE.Mesh, bodyOptions: CANNON.BodyOptions = { mass: 1 }): AutoBody {
        const body = new AutoBody(bodyOptions);

        if(mesh.geometry instanceof THREE.SphereGeometry) {
            const shape = new CANNON.Sphere(mesh.geometry.parameters.radius);
            body.addShape(shape);
        } else if(mesh.geometry instanceof THREE.BoxGeometry) {
            const shape = new CANNON.Box(new CANNON.Vec3(mesh.geometry.parameters.width / 2, mesh.geometry.parameters.height / 2, mesh.geometry.parameters.depth / 2));
            body.addShape(shape);
        } else {
            throw new Error(`AutoCannonWorld: ${mesh.geometry.constructor.name} not implemented`);
        }
        //adjust position and rotation
        body.position.copy((mesh.parent?.localToWorld(mesh.position) || mesh.position) as any);
        body.quaternion.copy(mesh.quaternion as any);

        //link body to mesh
        //mesh.userData.cannonBody = body;
        body.threeMesh = mesh;

        //add to world
        this.addBody(body);

        return body;
    }

    updateMeshes() {
        this.bodies.forEach(body=> {
            const autoBody = body as AutoBody;
            if(autoBody.threeMesh) {
                const threeVec = new THREE.Vector3(body.position.x, body.position.y, body.position.z);
                autoBody.threeMesh.position.copy(autoBody.threeMesh.parent?.worldToLocal(threeVec) || threeVec);
                autoBody.threeMesh.quaternion.copy(body.quaternion as any);
            }
        });
    }

    step(dt: number, timeSinceLastCalled?: number | undefined, maxSubSteps?: number | undefined): void {
        super.step(dt, timeSinceLastCalled, maxSubSteps);
        this.updateMeshes();
    }
}

export class AutoBody extends CANNON.Body {
    threeMesh: THREE.Mesh | undefined;
}