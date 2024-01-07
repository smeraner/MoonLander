import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { ShaderToyConfiguration, ShaderToyMaterial } from './ShaderToyMaterial';
const clock = new THREE.Clock();

export class ShaderToyPass extends ShaderPass {

    constructor(renderer: THREE.WebGLRenderer, shaderConfig : ShaderToyConfiguration ){
        super( new ShaderToyMaterial(renderer,shaderConfig), 'iChannel0' );
        //this.needsSwap = true;
    }

    render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime: number, maskActive: boolean) {
        this.uniforms.iTime.value += clock.getDelta();
        super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    }

}