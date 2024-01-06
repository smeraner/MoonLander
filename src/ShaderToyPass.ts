import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { ShaderToyConfiguration, ShaderToyMaterial } from './ShaderToyMaterial';

export class ShaderToyPass extends ShaderPass {

    constructor(renderer: THREE.WebGLRenderer, shaderConfig : ShaderToyConfiguration ){
        super( new ShaderToyMaterial(renderer,shaderConfig), 'iChannel0' );
        //this.needsSwap = true;
    }

}