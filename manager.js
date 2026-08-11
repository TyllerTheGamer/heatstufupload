function handleError(e) {
    fluxloaderAPI.sendGameMessage("heatstuf:err", e.message);
}
// not working
self.onerror = function(message, source, lineno, colno, error) {
    fluxloaderAPI.sendGameMessage("heatstuf:err", message, error?.stack, source, lineno, colno);
    /*
    self.postMessage({
        type: 'WORKER_ERROR',
        error: {
            message: message,
            stack: error ? error.stack : null,
            file: source,
            line: lineno
        }
    });*/
};

//fluxloaderAPI.sendGameMessage("heatstuf:say", "HI");

const statList = ["retention", "absorb"];
const defaultStat = {
    retention: 0.5,
    absorb: 0.5
};
const soilDefaultStat = {
    retention: 0.8,
    absorb: 0.3
}
function makeStats(table, lkup, useSoil) {
    let total = Math.max(...Object.values(lkup).filter((v) => typeof v == "number"));
    total++; // add one since 0 based index
    const data = new Float32Array(total * statList.length);
    for (let i = 0; i < total; i++) {
        const id = lkup[i];
        let cfg = table[id];
        if (!cfg) cfg = useSoil ? soilDefaultStat : defaultStat;
        const o = i * statList.length;
        // electron verified the props exist before writing em
        for (const ind in statList) {
            const prop = statList[ind];
            data[o + parseInt(ind)] = cfg[prop];
        }
    }
    return data;
}
// sim hooks for element moving

function hidx(x, y) {
    return y * fluxloaderAPI.gameInstanceState.store.world.size.width + x;
}
function ohidx(o) {
    return hidx(o.x, o.y);
}
let hmap;
// heat stuf swap... yes (used to be heatstufs)
globalThis.hss = (x1, y1, x2, y2) => {
    if (!hmap) return;
    if (x1 === undefined || y1 == undefined) return; // only x1 and y1 can be undefined, well both would be if its setting a soil/not element, bc then it has no x y and isn't moving from somewhere
    const old = hmap[hidx(x2, y2)];
    hmap[hidx(x2, y2)] = hmap[hidx(x1,y1)];
    // from this, I have determined to check if ANYTHING is undefined, then DONT DO ANYTHING BC WE, oh wait, it was frm setting static cells... but yeah just fi anything undefined save to cancel
    //console.log(`Swap vals ${old} at ${x2}, ${y2} and ${hmap[hidx(x1,y1)]} at ${x1}, ${y1}`);
    hmap[hidx(x1,y1)] = old;
};

// gotta make this read from data and add that registration in pre
const inters = {
    Lava: [{t:"heat",v:4},{t:"trans",v:-150,o:"Basalt",less:true}],
    Fire: [{t:"heat",v:1.5}],
    Flame: [{t:"heat",v:8.5}], // thinking cus it's very actively burning out?? ehh not sure on this and lava
    FreezingIce: [{t:"heat",v:-0.25}],
    Water: [{t:"trans",v:175,o:"Steam"},{t:"trans",v:-100,o:"FreezingIce",less:true}],
    Steam: [{t:"trans",v:-5,o:"Water"}],
    Basalt: [{t:"trans",v:300,o:"Lava"}],
    WetSand: [{t:"trans",v:175,o:"Sand"}],
    WetSpore: [{t:"trans",v:80,o:"Spore"}],
    // we do some funny stuff
    Spore: [{t:"trans",v:180,o:"Flame"}],
    Petalium: [{t:"trans",v:200,o:"Flame"}],
    Slag: [{t:"trans",v:170,o:[[0,"Slag"],[0.75,"Flame"]]}], // so upper 0.25 is Flame, p sure it's only Fire in game but oh well :P
    Sand: [{t:"trans",v:300,o:"Slag"}], // trolls bc no gold
    hsLeveler: [{t:"trans",v:335,o:"hsLevelerU",less:true}],//,{t:"trans",v:365,o:"hsLevelerD"}],
    hsLevelerU: [{t:"heat",v:100}],//,{t:"trans",v:345,o:"hsLeveler"}],
    hsLevelerD: [{t:"heat",v:-100}],//,{t:"trans",v:355,o:"hsLeveler",less:true}],
};
let eenum; // elem enum

// manually do stuff at duration
globalThis.hsdurHook = (state, elem, delta) => {
    if (!hmap) return;
    if (!eenum) return; // should be fine
    const name = eenum[elem.type];
    const inter = inters[name];
    if (!inter) return;
    const pos = ohidx(elem);
    for (let act of inter) {
        switch (act.t) {
            case "heat":
                hmap[pos] = hmap[pos] + act.v * delta;
                break;
            case "trans":
                // not gonna support this rn
                //const type = act.g ?? "elem"; // elem or soil
                if (act.less ? hmap[pos] < act.v : hmap[pos] >= act.v) {
                    let out = act.o;
                    if (typeof act.o == "object") {
                        const roll = Math.random();
                        // higher the number the lower the chance, must be ordered least to greatest
                        for (const pair of act.o) {
                            if (pair[0] <= roll) out = pair[1];
                        }
                    }
                    if (typeof out == 'object') continue; // invalid setup
                    // corelib checks the enum for us when spawning
                    corelib.simulation.spawnParticle({x:elem.x, y:elem.y,id:out, delayUntilEmpty: false});
                    return; // new elem, don't run the rest
                }
                break;
            case "run":
                act.cb(state, elem, delta);
                break;
            default:
                break;
        }
    }
};




fluxloaderAPI.events.on("fl:worker-initialized", async () => {
    const g = fluxloaderAPI.gameInstanceState;
    const ctx = g.environment.context;
    if (ctx != 3) {
        // sim workers
        fluxloaderAPI.listenGameMessage("heatstuf:giveSimSabs", (sabs) => {
            hmap = new Float32Array(sabs.heatS);
            fluxloaderAPI.sendGameMessage("heatstuf:simGotSabs");
        });
        // grab this cus corelib actually expoes it to sim workers
        eenum = corelib.exposed.named.particles;
        return;
    }
    // define this only on the manager, gotta fetch these cus manager doesn't get em
    let mapData;
    let wallData;
    let fetchRes;
    fluxloaderAPI.listenGameMessage("heatstuf:gotDatas", (msab, wsab) => {
        mapData = new Uint16Array(msab);
        wallData = new Uint8Array(wsab);
        fetchRes();
    });
    const writeQueue = [];
    fluxloaderAPI.listenGameMessage("heatstuf:queue", (idx, val) => {
        writeQueue.push({idx, val});
    });
    // get the stats
    const stats = (await import("./stats.json", {with:{type:"json"}})).default;
    // spent so long figuring out whoever wrote worker expose decided that it was too much effort to do anything for the manager bc having code that works everywhere is bad apparently
    // RJ for elems and vZ for soils
    const elems = globalThis.heatstufexpose;
    const pxs = elems.RJ;
    const soils = elems.vZ;
    // convert stats
    const fgstats = makeStats(stats.pxs, pxs);
    const bgstats = makeStats(stats.soils, soils, true);
    // get our size consts
    // should be good
    const {size} = g.store.world;
    const mapSize = size.width * size.height;
    const bufferSize = mapSize * 4; // float32's all around
    // define the sabs, will send em to game and such
    const heatS = new SharedArrayBuffer(bufferSize); // base heat
    const disHeatS = new SharedArrayBuffer(bufferSize); // displaced heat
    const heatMvS = new SharedArrayBuffer(bufferSize * 2); // heat move, Vector2
    const heatMap = new Float32Array(heatS);
    const disHeat = new Float32Array(disHeatS);
    const heatMv = new Float32Array(heatMvS);
    // send em to game
    fluxloaderAPI.sendGameMessage("heatstuf:GiveSABs", {heatS, disHeatS, heatMvS});
    const dbg = (msg) => fluxloaderAPI.sendGameMessage("heatstuf:say", msg);
    //dbg("test");
    //dbg(`gpu is: ${navigator.gpu}`);
    // start the gpu worker here, simpler than transfering from main thread when it would never use it
    const adapter = await navigator.gpu.requestAdapter();
    //dbg(`Adapter is: ${adapter}`);
    const device = await adapter.requestDevice();
    const config = (await import("./engine.json",{with:{type:"json"}})).default;
    const shader = device.createShaderModule(config);
    // make our storage buffers now
    const {STORAGE, UNIFORM, COPY_DST, COPY_SRC, MAP_READ} = GPUBufferUsage;
    const makeBuffer = (usage, size = bufferSize) => device.createBuffer({size, usage});
    const readUse = STORAGE | COPY_DST;
    const bsize2 = bufferSize * 2;
    const hBuffer = makeBuffer(readUse | COPY_SRC); // main, displace heat buffer writes into and heat next reads
    const hnBuffer = makeBuffer(STORAGE | COPY_SRC); // heat next, just write
    const dhBuffer = makeBuffer(readUse); // just read, cpu wipes
    const mvBuffer = makeBuffer(readUse, bsize2); // vector2, read
    const sBuffer = makeBuffer(MAP_READ | COPY_DST); // for writing new heat map
    // map
    const fgBuffer = makeBuffer(readUse, bsize2); // foreground map
    const bgBuffer = makeBuffer(readUse, bsize2); // background buffer
    // map lkup
    const fglBuffer = makeBuffer(readUse);
    const bglBuffer = makeBuffer(readUse);
    // map data
    const mdBuffer = makeBuffer(UNIFORM | COPY_DST, 8);
    const pipeline = device.createComputePipeline({
        layout: "auto",
        compute: {
            module: shader,
            entryPoint: "main"
        }
    });
    const bgEntry = (binding, buffer) => ({binding,resource:{buffer}});
    const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            bgEntry(0, hBuffer),
            bgEntry(1, hnBuffer),
            bgEntry(2, dhBuffer),
            bgEntry(3, mvBuffer),
            // don't bind the staging bufferf
            bgEntry(4, fgBuffer),
            bgEntry(5, bgBuffer),
            bgEntry(6, fglBuffer),
            bgEntry(7, bglBuffer),
            bgEntry(8, mdBuffer),
        ]
    });
    // write the stat lkup tables
    device.queue.writeBuffer(fglBuffer, 0, fgstats);
    device.queue.writeBuffer(bglBuffer, 0, bgstats);
    // write the consts
    device.queue.writeBuffer(mdBuffer, 0, new Uint32Array([size.width, size.height]));
    // get the games world views
    const fetchP = new Promise((r) => fetchRes = r);
    fluxloaderAPI.sendGameMessage("heatstuf:getDatas");
    await fetchP;
    const fgview = mapData; // uint16
    const bgview = wallData; // uint8
    // define a function to quickly fork over data
    const writeBuffers = () => {
        device.queue.writeBuffer(hBuffer, 0, heatMap);
        device.queue.writeBuffer(dhBuffer, 0, disHeat);
        device.queue.writeBuffer(mvBuffer, 0, heatMv);
        // don't need to write next or staging bc the gpu overwrites em
        // gotta pass extra params since they're not uint32
        device.queue.writeBuffer(fgBuffer, 0, fgview.buffer, fgview.byteOffset, fgview.byteLength);
        device.queue.writeBuffer(bgBuffer, 0, bgview.buffer, bgview.byteOffset, bgview.byteLength);
    };
    // raf gives us so much time to run this
    const raf = requestAnimationFrame;
    globalThis.requestAnimationFrame = async (cb) => {
        // raf like this so if the gpu is for some reason taking extremely long it still works
        let rafResolver = undefined;
        const rafPromise = new Promise((r) => rafResolver = r);
        raf(async () => {
            // don't use the raf's time incase we delayed raf
            await rafPromise;
            cb(performance.now());
        });
        // do the queue
        while (writeQueue.length > 0) {
            const {idx, val} = writeQueue.shift();
            heatMap[idx] = val;
        }
        writeBuffers();
        const commE = device.createCommandEncoder();
        // run the maths
        const passE = commE.beginComputePass();
        passE.setPipeline(pipeline);
        passE.setBindGroup(0, bindGroup);
        passE.dispatchWorkgroups(Math.ceil(size.width / 8), Math.ceil(size.height / 8));
        passE.end();
        // copy next heat to staging
        commE.copyBufferToBuffer(hnBuffer, 0, sBuffer, 0, bufferSize);
        // run it
        device.queue.submit([commE.finish()]);
        // get staging buffer
        await sBuffer.mapAsync(GPUMapMode.READ);
        heatMap.set(new Float32Array(sBuffer.getMappedRange()));
        sBuffer.unmap();
        // pretty fast/should be good here
        disHeat.fill(0);
        // then the raf can go
        rafResolver();
    };
});