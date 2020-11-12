
import { vec3 } from 'gl-matrix';

import { DeviceProgram } from '../Program';
import * as Viewer from '../viewer';
import * as UI from '../ui';

import * as PHD from './phd';
import { colorNewFromRGBA } from "../Color";
import { GfxDevice, GfxBufferUsage, GfxBuffer, GfxInputState, GfxFormat, GfxInputLayout, GfxProgram, GfxBindingLayoutDescriptor, GfxRenderPass, GfxBindings, GfxHostAccessPass, GfxVertexBufferFrequency, GfxVertexAttributeDescriptor, GfxInputLayoutBufferDescriptor, GfxCullMode } from '../gfx/platform/GfxPlatform';
import { fillColor, fillMatrix4x4 } from '../gfx/helpers/UniformBufferHelpers';
import { BasicRenderTarget, standardFullClearRenderPassDescriptor } from '../gfx/helpers/RenderTargetHelpers';
import { makeStaticDataBuffer } from '../gfx/helpers/BufferHelpers';
import { GfxRenderHelper } from '../gfx/render/GfxRenderGraph';
import { GfxRenderInstManager } from '../gfx/render/GfxRenderer';
import { CameraController } from '../Camera';


class PHDProgram extends DeviceProgram {
    public static a_Position = 0;
    public static a_Normal = 1;

    // Here is where we can write some OpenGL shader code for vertices/frags/both.

    public static ub_SceneParams = 0;
    public static ub_ObjectParams = 1;

    public both = `
precision mediump float;

layout(std140) uniform ub_SceneParams {
    Mat4x4 u_Projection;
    Mat4x4 u_ModelView;
};

layout(std140) uniform ub_ObjectParams {
    vec4 u_Color;
};

varying vec2 v_LightIntensity;

#ifdef VERT
layout(location = ${PHDProgram.a_Position}) attribute vec3 a_Position;
layout(location = ${PHDProgram.a_Normal}) attribute vec3 a_Normal;

void mainVS() {
    const float t_ModelScale = 1.0;
    gl_Position = Mul(u_Projection, Mul(u_ModelView, vec4(a_Position * t_ModelScale, 1.0)));
    vec3 t_LightDirection = normalize(vec3(.2, -1, .5));
    float t_LightIntensityF = dot(-a_Normal, t_LightDirection);
    float t_LightIntensityB = dot( a_Normal, t_LightDirection);
    v_LightIntensity = vec2(t_LightIntensityF, t_LightIntensityB);
}
#endif

#ifdef FRAG
void mainPS() {
    float t_LightIntensity = gl_FrontFacing ? v_LightIntensity.x : v_LightIntensity.y;
    float t_LightTint = 0.3 * t_LightIntensity;
    gl_FragColor = u_Color + vec4(t_LightTint, t_LightTint, t_LightTint, 0.0);
}
#endif
`;
}

export class Room {
    public numVertices: number;
    public posBuffer: GfxBuffer;
    public nrmBuffer: GfxBuffer;
    public litBuffer: GfxBuffer;
    public inputState: GfxInputState;

    constructor(device: GfxDevice, public room: PHD.TR1Room, private inputLayout: GfxInputLayout) {
        const t = vec3.create();

        this.numVertices = (room.triangles.length * 3) + (room.rectangles.length * 6);
        const posData = new Float32Array(this.numVertices * 3);
        const nrmData = new Float32Array(this.numVertices * 3);

        // Add the triangles
        for ( var j = 0; j < room.triangles.length; j ++ ) {
            let v0 = room.vertices[room.triangles[j].vertices[0]]
            let v1 = room.vertices[room.triangles[j].vertices[2]]
            let v2 = room.vertices[room.triangles[j].vertices[1]]

            vec3.cross(t, [v0.x - v1.x, v0.y - v1.y, v0.z - v1.z], [v0.x - v2.x, v0.y - v2.y, v0.z - v2.z]);
            vec3.normalize(t, t);

            let startPos = j * 9;
            posData[startPos]     = v0.x;
            posData[startPos + 1] = v0.y;
            posData[startPos + 2] = v0.z;
            posData[startPos + 3] = v1.x;
            posData[startPos + 4] = v1.y;
            posData[startPos + 5] = v1.z;
            posData[startPos + 6] = v2.x;
            posData[startPos + 7] = v2.y;
            posData[startPos + 8] = v2.z;

            nrmData[startPos]     = t[0];
            nrmData[startPos + 1] = t[1];
            nrmData[startPos + 2] = t[2];
            nrmData[startPos + 3] = t[0];
            nrmData[startPos + 4] = t[1];
            nrmData[startPos + 5] = t[2];
            nrmData[startPos + 6] = t[0];
            nrmData[startPos + 7] = t[1];
            nrmData[startPos + 8] = t[2];
        }

        // Add the quads, converted to triangles
        let offset = (room.triangles.length * 9);
        for ( var j = 0; j < room.rectangles.length; j ++ ) {
            let newTriangles = [[
                room.vertices[room.rectangles[j].vertices[0]], 
                room.vertices[room.rectangles[j].vertices[2]],
                room.vertices[room.rectangles[j].vertices[1]]
            ],[
                room.vertices[room.rectangles[j].vertices[2]], 
                room.vertices[room.rectangles[j].vertices[0]],
                room.vertices[room.rectangles[j].vertices[3]]
            ]];

            for ( var k = 0; k < newTriangles.length; k ++ ) {
                let v0 = newTriangles[k][0]; 
                let v1 = newTriangles[k][1];  
                let v2 = newTriangles[k][2];

                vec3.cross(t, [v0.x - v1.x, v0.y - v1.y, v0.z - v1.z], [v0.x - v2.x, v0.y - v2.y, v0.z - v2.z]);
                vec3.normalize(t, t);

                let startPos = offset + (j * 6 + k * 3 + 0) * 3;
                posData[startPos]     = v0.x;
                posData[startPos + 1] = v0.y;
                posData[startPos + 2] = v0.z;
                posData[startPos + 3] = v1.x;
                posData[startPos + 4] = v1.y;
                posData[startPos + 5] = v1.z;
                posData[startPos + 6] = v2.x;
                posData[startPos + 7] = v2.y;
                posData[startPos + 8] = v2.z;

                nrmData[startPos]     = t[0];
                nrmData[startPos + 1] = t[1];
                nrmData[startPos + 2] = t[2];
                nrmData[startPos + 3] = t[0];
                nrmData[startPos + 4] = t[1];
                nrmData[startPos + 5] = t[2];
                nrmData[startPos + 6] = t[0];
                nrmData[startPos + 7] = t[1];
                nrmData[startPos + 8] = t[2];
            }  
        }

        this.posBuffer = makeStaticDataBuffer(device, GfxBufferUsage.VERTEX, posData.buffer);
        this.nrmBuffer = makeStaticDataBuffer(device, GfxBufferUsage.VERTEX, nrmData.buffer);

        this.inputState = device.createInputState(inputLayout, [
            { buffer: this.posBuffer, byteOffset: 0 },
            { buffer: this.nrmBuffer, byteOffset: 0 }
        ], null);

        
    }

    public prepareToRender(renderInstManager: GfxRenderInstManager): void {
        const renderInst = renderInstManager.newRenderInst();
        renderInst.setInputLayoutAndState(this.inputLayout, this.inputState);
        renderInst.drawPrimitives(this.numVertices);
        renderInstManager.submitRenderInst(renderInst);
    }

    public destroy(device: GfxDevice): void {
        device.destroyBuffer(this.posBuffer);
        device.destroyBuffer(this.nrmBuffer);
        device.destroyInputState(this.inputState);
    }
}

export class PHDRenderer {
    public visible: boolean = true;
    public name: string;

    private rooms: Room[];

    constructor(device: GfxDevice, public phd: PHD.TR1Level, inputLayout: GfxInputLayout) {
        this.name = phd.name;
    
        this.rooms = this.phd.rooms.map((room) => new Room(device, room, inputLayout));
    }

    public setVisible(v: boolean) {
        this.visible = v;
    }

    public prepareToRender(renderInstManager: GfxRenderInstManager): void {
        if (!this.visible)
            return;

        const templateRenderInst = renderInstManager.pushTemplateRenderInst();

        let offs = templateRenderInst.allocateUniformBuffer(PHDProgram.ub_ObjectParams, 4);
        const d = templateRenderInst.mapUniformBufferF32(PHDProgram.ub_ObjectParams);
        offs += fillColor(d, offs, colorNewFromRGBA(255, 0, 0));

        for (let i = 0; i < this.rooms.length; i++) {
            this.rooms[i].prepareToRender(renderInstManager);
        }
            

        renderInstManager.popTemplateRenderInst();
    }

    public destroy(device: GfxDevice): void {
        this.rooms.forEach((room) => room.destroy(device));
    }
}

const bindingLayouts: GfxBindingLayoutDescriptor[] = [
    { numUniformBuffers: 2, numSamplers: 0 }, // ub_SceneParams
];

export class Scene implements Viewer.SceneGfx {
    private inputLayout: GfxInputLayout;
    private program: GfxProgram;
    private renderTarget = new BasicRenderTarget();
    private phdRenderers: PHDRenderer[] = [];
    private renderHelper: GfxRenderHelper;

    constructor(device: GfxDevice, public phds: PHD.TR1Level[]) {
        this.program = device.createProgram(new PHDProgram());

        // TODO: What to do with textiles and objectTexture coordinates?

        const vertexAttributeDescriptors: GfxVertexAttributeDescriptor[] = [
            { location: PHDProgram.a_Position, bufferIndex: 0, bufferByteOffset: 0, format: GfxFormat.F32_RGB, },
            { location: PHDProgram.a_Normal,   bufferIndex: 1, bufferByteOffset: 0, format: GfxFormat.F32_RGB, }
        ];
        const vertexBufferDescriptors: GfxInputLayoutBufferDescriptor[] = [
            { byteStride: 3*0x4, frequency: GfxVertexBufferFrequency.PER_VERTEX, },
            { byteStride: 3*0x4, frequency: GfxVertexBufferFrequency.PER_VERTEX, },
        ];
        const indexBufferFormat: GfxFormat | null = null;
        this.inputLayout = device.createInputLayout({ vertexAttributeDescriptors, vertexBufferDescriptors, indexBufferFormat });

        this.phdRenderers = this.phds.map((phd) => {
            return new PHDRenderer(device, phd, this.inputLayout);
        });

        this.renderHelper = new GfxRenderHelper(device);
    }

    public adjustCameraController(c: CameraController) {
        c.setSceneMoveSpeedMult(16/60);
    }

    private prepareToRender(device: GfxDevice, hostAccessPass: GfxHostAccessPass, viewerInput: Viewer.ViewerRenderInput): void {
        const template = this.renderHelper.pushTemplateRenderInst();
        template.setBindingLayouts(bindingLayouts);
        template.setGfxProgram(this.program);
        template.setMegaStateFlags({ cullMode: GfxCullMode.BACK });

        let offs = template.allocateUniformBuffer(PHDProgram.ub_SceneParams, 32);
        const mapped = template.mapUniformBufferF32(PHDProgram.ub_SceneParams);
        offs += fillMatrix4x4(mapped, offs, viewerInput.camera.projectionMatrix);
        offs += fillMatrix4x4(mapped, offs, viewerInput.camera.viewMatrix);

        for (let i = 0; i < this.phdRenderers.length; i++)
            this.phdRenderers[i].prepareToRender(this.renderHelper.renderInstManager);

        this.renderHelper.renderInstManager.popTemplateRenderInst();
        this.renderHelper.prepareToRender(device, hostAccessPass);
    }

    public render(device: GfxDevice, viewerInput: Viewer.ViewerRenderInput): GfxRenderPass {
        const hostAccessPass = device.createHostAccessPass();
        this.prepareToRender(device, hostAccessPass, viewerInput);
        device.submitPass(hostAccessPass);

        this.renderTarget.setParameters(device, viewerInput.backbufferWidth, viewerInput.backbufferHeight);
        const passRenderer = this.renderTarget.createRenderPass(device, viewerInput.viewport, standardFullClearRenderPassDescriptor);
        this.renderHelper.renderInstManager.drawOnPassRenderer(device, passRenderer);
        this.renderHelper.renderInstManager.resetRenderInsts();
        return passRenderer;
    }

    public destroy(device: GfxDevice): void {
        device.destroyInputLayout(this.inputLayout);
        device.destroyProgram(this.program);
        this.phdRenderers.forEach((r) => r.destroy(device));
        this.renderHelper.destroy(device);
        this.renderTarget.destroy(device);
    }

    public createPanels(): UI.Panel[] {
        const layersPanel = new UI.LayerPanel();
        layersPanel.setLayers(this.phdRenderers);
        return [layersPanel];
    }
}