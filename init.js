// game REFUSES to let you draw anything on its canvas's
const canvas = document.createElement("canvas");
canvas.id = "heat-draw";
const ctx = canvas.getContext("2d");
Object.assign(canvas.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100vw',
    height: '100vh',
    pointerEvents: 'none',
    zIndex: '9999',
    imageRendering: 'pixelated' 
});
document.body.appendChild(canvas);
/*window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});*/
canvas.width = 1920//window.innerWidth;
canvas.height = 1088//window.innerHeight;




// errors
fluxloaderAPI.listenWorkerMessage("heatstuf:err", (msg, stack, src, l, c) => {
    alert(`Worker error:'${msg}', from '${src}', line: ${l}, col: ${c}, stack:${stack}`);
});
fluxloaderAPI.listenWorkerMessage("heatstuf:say", (msg) => {
    alert(`Worker:${msg}`);
});

//alert(`gpu is: ${navigator.gpu}`);
//alert(`Adapter is: ${await navigator.gpu.requestAdapter()}`);

let heatMap;
let disHeat;
let heatMv;
let wsize;
let rsabs;
fluxloaderAPI.listenWorkerMessage("heatstuf:GiveSABs", (sabs) => {
    heatMap = new Float32Array(sabs.heatS);
    globalThis.hsMap = heatMap;
    // load the saved data
    const {state} = fluxloaderAPI.gameInstance;
    if (state.store.hsData) {
        fromb64(state.store.hsData, sabs.heatS);
    }
    disHeat = new Float32Array(sabs.disHeatS);
    heatMv = new Float32Array(sabs.heatMvS); // should be refilled if we're loading a save
    rsabs = sabs;
    // define this here aswell just cus
    wsize = state.store.world.size;
});
// __debug.state.environment.multithreading.simulation.manager
globalThis.heatstufmgrmsg = (sim) => {
    // incase somebody tries doing this themselves
    const base = sim.manager.onmessage;
    sim.manager.onmessage = (e) => {
        // I use fluxloader's already stuff so this is quicker :/
        if (e.data[0] == "fluxloaderMessage") {
            globalThis.fluxloaderOnWorkerMessage(e);
        }
        base?.();
    };
};
let simFetchR;
let simGot = 0;
let simTotal;
fluxloaderAPI.listenWorkerMessage("heatstuf:simGotSabs", () => {
    simGot++;
    if (simGot == simTotal) simFetchR();
});
fluxloaderAPI.listenWorkerMessage("heatstuf:getDatas", async () => {
    // bc we can here, lazy shoving this here but it works
    const simFetchP = new Promise((r) => simFetchR = r);
    simTotal = globalThis.__debug.state.environment.multithreading.simulation.threads.length;
    fluxloaderAPI.sendWorkerMessage("heatstuf:giveSimSabs", rsabs);
    await simFetchP;
    const {shared} = globalThis.__debug.state;
    const map = shared.mapData.data.buffer;
    const wall = shared.wallData.data.buffer;
    fluxloaderAPI.sendWorkerMessage("heatstuf:gotDatas", map, wall);
});
function getHeat(x, y) {
    return heatMap[y * wsize.width + x];
}
// snap to grid
function gridify(n) {
    return Math.floor(n/4) * 4;
}

// define these both here
function tob64(bytes) {
    // btoa makes it safe for stringify
    return btoa(Array.from(bytes, String.fromCharCode).join(""));
}

function fromb64(raw, sab) {
    const binStr = atob(raw);
    const bytes = new Uint8Array(sab);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = binStr.charCodeAt(i);
    }
}


globalThis.hsSave = (store) => {
    if (!heatMap) return;
    // make a Uint8 version to save as base64 (not using Buffer despite node integration for reasons)
    const tempView = new Uint8Array(rsabs.heatS);
    store.hsData = tob64(tempView);
};


// EXTREMELY LAZY draw
const drad = 45; // draw radius
let mref; // lazy
globalThis.heatstufRender = (ctx, camera, mouse) => {
    if (!heatMap) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    mref = mouse;
    const cpos = mouse.cellPosition;
    // this is relative to screen bc worldPosition is camera + this
    const mpos = mouse.position;
    for (let i = -drad; i < drad; i++) {
        for (let j = -drad; j < drad; j++) {
            const dx = gridify(mpos.x) + i * 4;
            const dy = gridify(mpos.y) + j * 4;
            const rx = cpos.x + i;
            const ry = cpos.y + j;
            if (rx < 0 || rx > wsize.width || ry < 0 || ry > wsize.height) continue;
            const temp = getHeat(rx, ry);
            const dtemp = temp + 30; // arbitrary add for drawing
            const alpha = 0.5//Math.min(temp/50, 0.7);
            let r = 0;
            let g = 0;
            let b = 0;
            if (dtemp < 0) {
                b = Math.max(100, 255 + dtemp);
            } else if (dtemp < (255 / 3)) {
                b = 255;
                r = dtemp * 3;
            } else if (dtemp < ((255 / 4) * 3)) {
                r = 255;
                const s = 255 / 3;
                const e = ((255 / 4) * 3) - s;
                const c = (dtemp - s) / e;
                b = 255 * (1 - c);
                g = 255 * c;
            } else if (dtemp < (255 * 1.5)) {
                b = 0;
                r = 255;
                const s = (255 / 4) * 3;
                const e = (255 * 1.5) - s;
                const c = (dtemp - s) / e;
                g = 255 * (1 - c);
            } else r = 255;
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
            ctx.fillRect(dx, dy, 4, 4);
            // debug text
            ctx.fillStyle = "black";
            ctx.fontSize = 10;
            const multi = 5;
            const tx = (i + drad) * multi + multi;
            const ty = (j + drad) * multi + multi;
            //ctx.fillText(Math.round(temp), tx, ty);
        }
    }
};

function queueHeat(idx, val) {
    fluxloaderAPI.sendWorkerMessage("heatstuf:queue", idx, val);
}
// was gonna make a bounce function but no need since workers block the manager from running


const sDis = 3;
const spawnKeys = {
    z: "FreezingIce",
    x: "WetSpore",
    n: "Water",
    m: "Lava",
    l: "WetSand",
    y: "hsLevelerU",
    u: "hsLevelerD",
};


// also lazy test
const readDis = 5;
window.addEventListener("keydown", (e) => {
    if (!heatMap) return;
    const cell = fluxloaderAPI.gameInstance.state.session.input.mouse.cellPosition;
    const idx = cell.y * wsize.width + cell.x;
    if (e.key == "j") {
        queueHeat(idx, Math.pow(10, 5));
    } else if (e.key == "k") {
        queueHeat(idx, -Math.pow(10, 6));
    } else if (e.key == "h") {
        queueHeat(idx, Math.pow(10, 20));
    } else if (e.key == "b") {
        if (!mref) return;
        let vals = [];
        const cpos = mref.cellPosition;
        for (let i = -readDis; i < readDis; i++) {
            let local = [];
            for (let j = -readDis; j < readDis; j++) {
                const x = cpos.x + i;
                const y = cpos.y + j;
                const val = getHeat(x, y);
                local.push(val.toFixed(2));
            }
            vals.push(local.join(","));
        }
        navigator.clipboard.writeText(vals.join("\n"));
    } else if (spawnKeys[e.key]) {
        const label = spawnKeys[e.key];
        const target = corelib.exposed.named.particles[label];
        for (let i = -sDis; i < sDis; i++) {
            for (let j = -sDis; j < sDis; j++) {
                corelib.simulation.spawnElement({x:cell.x + i, y:cell.y + j, id:target});
            }
        }
    }
});

