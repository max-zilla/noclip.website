import { NamedArrayBufferSlice } from "../DataFetcher";


// Adapted from https://opentomb.github.io/TRosettaStone3/trosettastone.html

export interface TextureVertex {
    x: number, y: number
}

export interface Vertex {
    x: number, y: number, z: number
}

export interface TR1Vertex {
    x: number, y: number, z: number,
    lighting: number
}

export interface TR1Textile8 {
    pixels: Uint8Array // 256 * 256 8-bit color palette indices
}

export interface TR1Textile16 {
    pixels: Uint16Array // 256 * 256 16-bit color palette indices
}

export interface TR1ObjectTexture {
    attribute: number,
    tileAndFlag: number,
    vertices: TextureVertex[] 
}

export interface Face {
    vertices: number[],    // vertex IDs; can be Tri or Quad
    texture: number      // texture index, or palette indices if untextured
}

export interface TR1Face {
    vertices: number[],       // vertex IDs; can be Tri or Quad
    texture: number         // texture index, or palette indices if untextured
}

export interface TR1Sprite {
    vertex: number, // vertex ID
    texture: number // index of sprite texture list
}

export interface TR1StaticMesh {
    position: Vertex,
    rotation: number,
    intensity: number,  // 0 (bright) to 0x1FFF (dark)
    meshID: number      // which StaticMesh to draw
}

export interface TR1Portal {
    adjoiningRoom: number,
    normal: Vertex,
    vertices: Vertex[]  // vertex IDs; RHR wrt. normal
}

export interface TR1Sector {
    floorDataIndex: number, // index of floorData, for sector flags, triggers, params
    boxIndex: number,       // index of boxes (-1 if none), mostly for AI pathfinding
    roomBelow: number,      // 255 is none
    floor: number,          // abs height of floor
    roomAbove: number,      // 255 is none
    ceiling: number         // abs height of ceiling
}

export interface TR1Light {
    position: Vertex,
    intensity: number,
    fade: number
}

export interface TR1Room {
    position: { 
        x: number, 
        z: number, 
        yBottom: number, 
        yTop: number 
    },
    vertices: TR1Vertex[],
    rectangles: TR1Face[],
    triangles: TR1Face[], 
    sprites: TR1Sprite[],
    portals: TR1Portal[], // TODO: necessary?
    sectors: TR1Sector[], // TODO: necessary?
    ambientIntensity: number, lights: TR1Light[],
    staticMeshes: TR1StaticMesh[],
    alternateRoom: number, flags: number
}

export interface TR1Mesh {
    center: Vertex,
    collisionRadius: number,
    vertices: Vertex[],
    normals: Vertex[],
    lights: number[],
    textured: {
        rectangles: Face[],
        triangles: Face[]
    },
    colored: {
        rectangles: Face[],
        triangles: Face[]
    },
    dummy: Boolean
}

export interface TR1Level {
    name: string,
    textile8: TR1Textile8[],
    rooms: TR1Room[],
    meshes: TR1Mesh[]
}

export function parsePHD(buffer: NamedArrayBufferSlice): TR1Level {
    const view = buffer.createDataView();
    const name = buffer.name.split('/').pop()!;
    let pos = 0;

    let version = view.getUint32(pos, true); pos += 0x4;

    // Extract textiles
    let numTextiles = view.getUint32(pos, true); pos += 0x4;
    let textile8: TR1Textile8[] = [];
    for (let i = 0; i < numTextiles; i++) {
        let pixels = buffer.createTypedArray(Uint8Array, pos, 256 * 256);
        textile8.push({pixels});
        pos += 0x10000;
    }
    pos += 0x4; // unused

    // Extract rooms
    let numRooms = view.getUint16(pos, true); pos += 0x2;
    let rooms: TR1Room[] = [];
    for (let i = 0; i < numRooms; i++) {
        let roomdata = parseRoom(buffer, view, pos);
        rooms.push(roomdata[0]);
        pos = roomdata[1];
    }

    // UNUSED: Extract floor data (gameplay triggers)
    let numFloorData = view.getUint32(pos, true); pos += 0x4;
    pos += 0x2 * numFloorData;

    // Skip the mesh data and read the pointers to get  mesh count first, then go back and extract meshes
    let numMeshData = view.getUint32(pos, true); pos += 0x4;
    let meshPos = pos; pos += numMeshData * 2;
    let numMeshPointers = view.getUint32(pos, true); pos += 0x4;
    let meshPointers = buffer.createTypedArray(Uint32Array, pos, numMeshPointers);
    let animPos = pos;
    let meshes: TR1Mesh[] = [];
    for (let i = 0; i < numMeshPointers; i++) {
        pos = meshPos + meshPointers[i];
        let dummy = meshPointers[i] == 0;
        let meshdata = parseMesh(buffer, view, pos, dummy);
        meshes.push(meshdata[0]);
    }
    pos = animPos;

    /** 
    // UNUSED: Extract animation data
    let numAnimations = view.getUint32(pos, true); pos += 0x4;
    pos += 0x20 * numAnimations;
    let numStateChanges = view.getUint32(pos, true); pos += 0x4;
    pos += 0x6 * numStateChanges;
    let numAnimDispatches = view.getUint32(pos, true); pos += 0x4;
    pos += 0x8 * numAnimDispatches;
    let numAnimCommands = view.getUint32(pos, true); pos += 0x4;
    pos += 0x2 * numAnimCommands;
    let numMeshTrees = view.getUint32(pos, true); pos += 0x4;
    pos += 0x4 * numMeshTrees;
    let numFrames = view.getUint32(pos, true); pos += 0x4;
    pos += 0x2 * numFrames;

    // Extract model data
    let numModels = view.getUint32(pos, true); pos += 0x4;
    pos += 0x12 * numModels;
    let numStaticMeshes = view.getUint32(pos, true); pos += 0x4;
    pos += 0x20 * numStaticMeshes;

    // Extract texture data
    let numObjectTextures = view.getUint32(pos, true); pos += 0x4;
    pos += 0x14 * numObjectTextures;
    let numSpriteTextures = view.getUint32(pos, true); pos += 0x4;
    pos += 0x10 * numSpriteTextures;
    let numSpriteSequences = view.getUint32(pos, true); pos += 0x4;
    pos += 0x8 * numSpriteSequences;
    */
   
    return {
        name,
        textile8,
        rooms,
        meshes
    };
}

// Translate bytes to a TR1Room object and return ending file position
export function parseRoom(buffer: NamedArrayBufferSlice, view: DataView, pos: number): [TR1Room, number] {
    let position = {
        x: view.getInt32(pos, true),
        z: view.getInt32(pos + 0x4, true),
        yBottom: view.getInt32(pos + 0x8, true),
        yTop:  view.getInt32(pos + 0xC, true)
    };
    pos += 0x14; // numDataWords is unused

    let numVertices = view.getUint16(pos, true); pos += 0x2;
    let vertices: TR1Vertex[] = [];
    for (let j = 0; j < numVertices; j ++) {
        vertices.push({
            x: position.x + view.getInt16(pos, true),
            y: -view.getInt16(pos + 0x2, true),
            z: -(position.z + view.getInt16(pos + 0x4, true)),
            lighting: view.getUint16(pos + 0x6, true)
        });
        pos += 0x8;
    }  

    let numRectangles = view.getUint16(pos, true); pos += 0x2;
    let rectangles: TR1Face[] = [];
    for (let j = 0; j < numRectangles; j ++) {
        rectangles.push({
            vertices: [
                view.getUint16(pos, true),
                view.getUint16(pos + 0x2, true),
                view.getUint16(pos + 0x4, true),
                view.getUint16(pos + 0x6, true)
            ],
            texture: view.getUint16(pos + 0x8, true)
        });
        pos += 0xA;
    }

    let numTriangles = view.getUint16(pos, true); pos += 0x2;
    let triangles: TR1Face[] = [];
    for (let j = 0; j < numTriangles; j ++) {
        triangles.push({
            vertices: [
                view.getUint16(pos, true),
                view.getUint16(pos + 0x2, true),
                view.getUint16(pos + 0x4, true)
            ],
            texture: view.getUint16(pos + 0x6, true)
        });
        pos += 0x8;
    }

    let numSprites = view.getUint16(pos, true); pos += 0x2;
    let sprites: TR1Sprite[] = [];
    for (let j = 0; j < numSprites; j ++) {
        sprites.push({
            vertex: view.getInt16(pos, true),
            texture: view.getUint16(pos + 0x2, true)
        });
        pos += 0x4;
    }

    let numPortals = view.getUint16(pos, true); pos += 0x2;
    let portals: TR1Portal[] = [];
    for (let j = 0; j < numPortals; j ++) {
        let adjoiningRoom = view.getUint16(pos, true);
        let normal = {
            x: view.getInt16(pos + 0x2, true),
            y: view.getInt16(pos + 0x4, true),
            z: view.getInt16(pos + 0x6, true)
        };
        let vertices: Vertex[] = [];
        for (let k = 0; k < 4; k ++) {
            vertices.push({
                x: view.getInt16(pos + 0x8 + (0x6 * k), true), 
                y: view.getInt16(pos + 0xA + (0x6 * k), true), 
                z: view.getInt16(pos + 0xC + (0x6 * k), true)
            });
        }
        portals.push({adjoiningRoom, normal, vertices});
        pos += 0x20;
    }

    let numZSectors = view.getUint16(pos, true); pos += 0x2;
    let numXSectors = view.getUint16(pos, true); pos += 0x2;
    let sectors: TR1Sector[] = [];
    for (let j = 0; j < (numXSectors * numZSectors); j ++) {
        sectors.push({
            floorDataIndex: view.getUint16(pos, true),
            boxIndex: view.getUint16(pos + 0x2, true),
            roomBelow: view.getUint8(pos + 0x4),
            floor: view.getInt8(pos + 0x5),
            roomAbove: view.getUint8(pos + 0x6),
            ceiling: view.getInt8(pos + 0x7),
        });
        pos += 0x8;
    }

    let ambientIntensity = view.getInt16(pos, true); pos += 0x2;
    let numLights = view.getUint16(pos, true); pos += 0x2;
    let lights: TR1Light[] = [];
    for (let j = 0; j < numLights; j ++) {
        lights.push({
            position: {
                x: view.getInt32(pos, true),
                y: view.getInt32(pos + 0x4, true),
                z: view.getInt32(pos + 0x8, true)
            },
            intensity: view.getUint16(pos + 0xC, true),
            fade: view.getUint32(pos + 0xE, true)
        });
        pos += 0x12;
    }

    let numStaticMeshes = view.getUint16(pos, true); pos += 0x02;
    let staticMeshes: TR1StaticMesh[] = [];
    for (let j = 0; j < numStaticMeshes; j ++) {
        staticMeshes.push({
            position: {
                x: view.getInt32(pos, true),
                y: view.getInt32(pos + 0x4, true),
                z: view.getInt32(pos + 0x8, true)
            },
            rotation: view.getUint16(pos + 0xC, true),
            intensity: view.getUint16(pos + 0xE, true),
            meshID: view.getUint16(pos + 0x10, true)
        });
        pos += 0x12;
    }

    let alternateRoom = view.getInt16(pos, true); pos += 0x02;
    let flags = view.getInt16(pos, true); pos += 0x02;

    return [{
        position,
        vertices, rectangles, triangles, sprites,
        portals, sectors,
        ambientIntensity, lights,
        staticMeshes,
        alternateRoom, flags
    }, pos];
}

// Translate bytes to a TR1Mesh object and return ending file position
export function parseMesh(buffer: NamedArrayBufferSlice, view: DataView, pos: number, dummy: Boolean): [TR1Mesh, number] {
    let center = {
        x: view.getInt16(pos, true),
        y: view.getInt16(pos + 0x2, true),
        z: view.getInt16(pos + 0x4, true)
    };
    let collisionRadius = view.getInt32(pos + 0x6, true); 
    pos += 0xA;

    let numVertices = view.getInt16(pos, true); pos += 0x2;
    let vertices: Vertex[] = [];
    for (let j = 0; j < numVertices; j ++) {
        vertices.push({
            x: view.getInt16(pos, true),
            y: view.getInt16(pos + 0x2, true),
            z: view.getInt16(pos + 0x4, true)
        });
        pos += 0x6;
    }

    let numNormals = view.getInt16(pos, true); pos += 0x2;
    let normals: Vertex[] = [];
    for (let j = 0; j < numNormals; j ++) {
        vertices.push({
            x: view.getInt16(pos, true),
            y: view.getInt16(pos + 0x2, true),
            z: view.getInt16(pos + 0x4, true)
        });
        pos += 0x6;
    }

    let lights: number[] = [];
    if (numNormals < 0) {
        let numLights = -numNormals
        for (let j = 0; j < numLights; j ++) {
            lights.push(view.getInt16(pos, true));
        }
        pos += 0x2 * numLights;
    }

    let numTexturedRectangles = view.getInt16(pos, true); pos += 0x2;
    let texturedRectangles: Face[] = [];
    for (let j = 0; j < numTexturedRectangles; j ++) {
        texturedRectangles.push({
            vertices: [
                view.getUint16(pos, true),
                view.getUint16(pos + 0x2, true),
                view.getUint16(pos + 0x4, true),
                view.getUint16(pos + 0x6, true)
            ],
            texture: view.getUint16(pos + 0x8, true)
        });
        pos += 0xA;
    }

    let numTexturedTriangles = view.getInt16(pos, true); pos += 0x2;
    let texturedTriangles: Face[] = [];
    for (let j = 0; j < numTexturedTriangles; j ++) {
        texturedTriangles.push({
            vertices: [
                view.getUint16(pos, true),
                view.getUint16(pos + 0x2, true),
                view.getUint16(pos + 0x4, true)
            ],
            texture: view.getUint16(pos + 0x6, true)
        });
        pos += 0x8;
    }

    let numColoredRectangles = view.getInt16(pos, true); pos += 0x2;
    let coloredRectangles: Face[] = [];
    for (let j = 0; j < numColoredRectangles; j ++) {
        coloredRectangles.push({
            vertices: [
                view.getUint16(pos, true),
                view.getUint16(pos + 0x2, true),
                view.getUint16(pos + 0x4, true),
                view.getUint16(pos + 0x6, true)
            ],
            texture: view.getUint16(pos + 0x8, true)
        });
        pos += 0xA;
    }

    let numColoredTriangles = view.getInt16(pos, true); pos += 0x2;
    let coloredTriangles: Face[] = [];
    for (let j = 0; j < numColoredTriangles; j ++) {
        coloredTriangles.push({
            vertices: [
                view.getUint16(pos, true),
                view.getUint16(pos + 0x2, true),
                view.getUint16(pos + 0x4, true)
            ],
            texture: view.getUint16(pos + 0x6, true)
        });
        pos += 0x8;
    }

    return[{center, collisionRadius, vertices, normals, lights, 
        textured: {rectangles: texturedRectangles, triangles: texturedTriangles}, 
        colored:  {rectangles: coloredRectangles, triangles: coloredTriangles},
        dummy}, pos];
}
