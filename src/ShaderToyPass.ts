import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export interface ShaderToyPassConfiguration {
    uniforms: { [name: string]: { value: any; }; };

    /**
     * The fragment shader code from ShaderToy.
     */
    fragmentShader: string;
}

export class ShaderToyPass extends ShaderPass {

    constructor(renderer: THREE.WebGLRenderer, shaderConfig : ShaderToyPassConfiguration ){
        super( new THREE.ShaderMaterial( {
            uniforms: {
                iResolution: { value: new THREE.Vector3(renderer.domElement.width,renderer.domElement.height,1) },
                iTime: { value: 0.0 },
                iTimeDelta: { value: 0.0 },
                iFrame: { value: 0.0 },
                iFrameRate: { value: 0.0 },
                iChannelTime: { value: [0.0, 0.0, 0.0, 0.0] },
                iChannelResolution: { value: [new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,0)] },
                iMouse: { value: new THREE.Vector4(0.0, 0.0, 0.0, 0.0) },
                iChannel0: { value: null },
                iChannel1: { value: null },
                iDate: { value: new THREE.Vector4(0.0, 0.0, 0.0, 0.0) },
                iSampleRate: { value: 0.0 },
                ...shaderConfig.uniforms
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
                }`,
            fragmentShader: /* glsl */`
uniform vec3 iResolution;
uniform sampler2D iChannel0;

uniform float iTime;
uniform float iTimeDelta;
uniform int iFrame;
uniform float iFrameRate;
uniform float iChannelTime[4];
uniform vec3 iChannelResolution[4];
uniform vec4 iMouse;

uniform vec4 iDate;
uniform vec4 iSampleRate;

varying vec2 vUv;

${shaderConfig.fragmentShader}

void main() {
    vec4 color = vec4(0.0,0.0,0.0,1.0);
    mainImage( color, vUv * iResolution.xy );
    color.w = 1.0;
    gl_FragColor = color;
}`,
        }), 'iChannel0' );
        this.needsSwap = true;
    }

}