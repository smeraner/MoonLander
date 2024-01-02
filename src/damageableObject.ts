interface DamageableObject extends THREE.Object3D {
    damage: (damage: number) => void;
}