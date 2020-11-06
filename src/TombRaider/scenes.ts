import { parsePHD } from './phd';
import { Scene } from './render';

import * as Viewer from '../viewer';
import { GfxDevice } from '../gfx/platform/GfxPlatform';
import { SceneContext } from '../SceneBase';


class SceneDesc implements Viewer.SceneDesc {
    constructor(public id: string, public name: string) {
    }

    public async createScene(device: GfxDevice, context: SceneContext): Promise<Viewer.SceneGfx> {
        const dataFetcher = context.dataFetcher;
        const buffer = await dataFetcher.fetchData(`${pathBase}/${this.id}`);
        const level = parsePHD(buffer);
        console.log(level);
        return new Scene(device, [level]);
    }
}

const id = 'tombraider';
const name = 'Tomb Raider';
const pathBase = 'tombraider';

const sceneDescs: SceneDesc[] = [
    new SceneDesc("00-Laras-Home.PHD", "Lara's Home"),
    new SceneDesc("01-Caves.PHD", "Caves")
]

export const sceneGroup: Viewer.SceneGroup = { id, name, sceneDescs };
