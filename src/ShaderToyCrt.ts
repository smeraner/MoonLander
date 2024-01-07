import * as THREE from 'three';
import { ShaderToyPass } from "./ShaderToyPass";
const clock = new THREE.Clock();

export class ShaderToyCrtUniforms {
    warp= { value: 0.85 };
    scan= { value: 0.85 };
};

export class ShaderToyCrt extends ShaderToyPass {

    constructor(renderer: THREE.WebGLRenderer, uniforms: ShaderToyCrtUniforms ){
        super(renderer, {
            uniforms: {
                ...uniforms
            },
            //https://www.shadertoy.com/view/Ms23DR
            fragmentShader: /* glsl */`
            uniform float warp; // simulate curvature of CRT monitor
            uniform float scan; // simulate darkness between scanlines
            
            void mainImage(out vec4 fragColor,in vec2 fragCoord)
                {
                // squared distance from center
                vec2 uv = fragCoord/iResolution.xy;
                vec2 dc = abs(0.5-uv);
                dc *= dc;
                
                // warp the fragment coordinates
                uv.x -= 0.5; uv.x *= 1.0+(dc.y*(0.3*warp)); uv.x += 0.5;
                uv.y -= 0.5; uv.y *= 1.0+(dc.x*(0.4*warp)); uv.y += 0.5;
            
                // sample inside boundaries, otherwise set to black
                if (uv.y > 1.0 || uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0)
                    fragColor = vec4(0.0,0.0,0.0,1.0);
                else
                    {
                    // determine if we are drawing in a scanline
                    float apply = abs(sin(fragCoord.y)*0.5*scan);
                    // sample the texture
                    fragColor = vec4(mix(texture(iChannel0,uv).rgb,vec3(0.0),apply),1.0);
                    }
                }
                `
            });
    }

    render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime: number, maskActive: boolean) {
        this.uniforms.iTime.value += clock.getDelta();
        super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    }
}