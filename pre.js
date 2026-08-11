/** @typedef {import('../corelib/entry.electron.js')} */
// have to make wgsl into text and json is easiest way to share straight to worker
const root = `${fluxloaderAPI.getModsPath()}/heatstuf/`;
const code = fs.readFileSync(`${root}/engine.wgsl`, "utf-8");
const object = {code};
fs.writeFileSync(`${root}/engine.json`, JSON.stringify(object));
// also gotta have an api to add your own elem stats and stuff, before this the first 4 lines were the only electron code
const stats = {soils:{}, pxs:{}};
// internal lazy/quick setup
// (1 - retention) * n_absorb
function base(id, retention, absorb, pixels = true) {
    const type = pixels ? "pxs" : "soils";
    stats[type][id] = {
        retention,
        absorb,
    };
}
// tempted to try to change so retention isn't limited to 1, but it sorta works
base("Empty", 0.05, 0.1, false); // doesn't keep heat but not at cooling
/*

          (function (e) {
            (e[(e.Empty = 0)] = "Empty"), V
              (e[(e.Element = 1)] = "Element"),
              (e[(e.SandSoil = 2)] = "SandSoil"),
              (e[(e.SporeSoil = 3)] = "SporeSoil"),
              (e[(e.Fog = 4)] = "Fog"),
              (e[(e.FogJetpackBlock = 5)] = "FogJetpackBlock"),
              (e[(e.FogWater = 6)] = "FogWater"),
              (e[(e.FreezingIceSoil = 7)] = "FreezingIceSoil"),
              (e[(e.Divider = 8)] = "Divider"),
              (e[(e.Grass = 9)] = "Grass"),
              (e[(e.Moss = 10)] = "Moss"),
              (e[(e.GoldSoil = 11)] = "GoldSoil"),
              (e[(e.Petal = 12)] = "Petal"),
              (e[(e.FogLava = 13)] = "FogLava"),
              (e[(e.Fluxite = 14)] = "Fluxite"),
              (e[(e.Block = 15)] = "Block"),
              (e[(e.SlidingBlock = 16)] = "SlidingBlock"),
              (e[(e.SlidingBlockLeft = 17)] = "SlidingBlockLeft"),
              (e[(e.SlidingBlockRight = 18)] = "SlidingBlockRight"),
              (e[(e.ConveyorLeft = 19)] = "ConveyorLeft"),
              (e[(e.ConveyorRight = 20)] = "ConveyorRight"),
              (e[(e.ShakerLeft = 21)] = "ShakerLeft"),
              (e[(e.ShakerRight = 22)] = "ShakerRight"),
              (e[(e.Bedrock = 23)] = "Bedrock"),
              (e[(e.VelocitySoaker = 24)] = "VelocitySoaker"),
              (e[(e.Ice = 25)] = "Ice"),
              (e[(e.Grower = 26)] = "Grower"),
              (e[(e.NascentWater = 27)] = "NascentWater"),
              (e[(e.SandiumSoil = 28)] = "SandiumSoil"),
              (e[(e.Obsidian = 29)] = "Obsidian"),
              (e[(e.Crackstone = 30)] = "Crackstone");
          })(r || (r = {})),
          (function (e) {
            (e[(e.Sand = 1)] = "Sand"),V 
              (e[(e.Particle = 2)] = "Particle"), V
              (e[(e.Water = 3)] = "Water"), V
              (e[(e.WetSand = 4)] = "WetSand"), V
              (e[(e.Sandium = 5)] = "Sandium"), V
              (e[(e.Slag = 6)] = "Slag"),
              (e[(e.Gold = 7)] = "Gold"), V
              (e[(e.Gloom = 8)] = "Gloom"),
              (e[(e.Shake = 9)] = "Shake"), V
              (e[(e.Steam = 10)] = "Steam"), V
              (e[(e.Fire = 11)] = "Fire"), V
              (e[(e.FreezingIce = 12)] = "FreezingIce"), V
              (e[(e.Flame = 13)] = "Flame"), V
              (e[(e.BurntSlag = 14)] = "BurntSlag"),
              (e[(e.Spore = 15)] = "Spore"), V
              (e[(e.WetSpore = 16)] = "WetSpore"), V
              (e[(e.Seed = 17)] = "Seed"),
              (e[(e.Petalium = 18)] = "Petalium"), V
              (e[(e.Lava = 19)] = "Lava"), V
              (e[(e.Basalt = 20)] = "Basalt"); V
          })(a || (a = {})),
*/
// gotta go through adding all the base game elements
const massbase = [
    ["Sand", 0.65, 0.4], // insulator
    ["Water", 0.2, 0.85], // good coolant
    ["WetSand", 0.775, 0.65], // absorbs a bit faster
    ["Particle", 0.5, 0.5], // general stats cus its a temporary inbetween
    ["Sandium", 0.65, 0.5], // bit better an insulator
    ["Spore", 0.4, 0.7], // prolly gonna make it able to burn
    ["WetSpore", 0.5, 0.7], // again will prolly have dryable
    ["Basalt", 0.85, 0.3],
    ["Lava", 0.95, 0.9], // takes heat and doesn't like giving it
    ["Shake", 0.5, 0.5], // again placeholder
    ["FreezingIce", 0.4, 0.875], // quickly absorbs to melt
    ["Flame", 0.01, 0.1],
    ["Fire", 0.01, 0.1],
    ["Gold", 0.2, 0.999], // ai gave me the idea for super conductive
    ["Gloom", 0.1, 0.999], // a better superconductor
    ["f", 0, 0],
    ["f", 0, 0],
    ["f", 0, 0],
    ["f", 0, 0],
    ["f", 0, 0],
    ["f", 0, 0],
];
const masssoil = [
    ["Ice", 0.5, 0.9],
    ["FreezingIceSoil", 0.4, 0.875],
    ["f", 0, 0],
    ["f", 0, 0],
    ["f", 0, 0],
    ["f", 0, 0],
    ["f", 0, 0],
    ["f", 0, 0],
    ["f", 0, 0],
    ["f", 0, 0],
    ["f", 0, 0],
    ["f", 0, 0],
    ["f", 0, 0],
    ["f", 0, 0],
    ["f", 0, 0],
];
inert(["Bedrock", "Fog", "FogWater", "FogLava"]);
function inert(arr) {
    for (let name of arr) {
        masssoil.push([name, 1, 0]);
    }
}
for (const set of massbase) {
    base(...set, true);
}
for (const set of masssoil) {
    base(...set, false);
}
const basecfg = { // example
    retention: 0.5, // priority for keeping heat
    absorb: 0.5, // priority for taking heat
};
globalThis.setHeatStat = (type, id, cfg) => {
    if (!["soils", "pxs"].includes(type)) throw new TypeError(`Expected type 'soils' or 'pxs' but got '${type}'`);
    for (let key in basecfg) {
        if (!cfg[key]) throw new ReferenceError(`Config for '${type}' '${id}' is missing property '${key}'`);
    }
    stats[type][id] = cfg;
};
fluxloaderAPI.events.on("fl:all-mods-loaded", () => {
    fs.writeFileSync(`${root}/stats.json`, JSON.stringify(stats));
});
// patch for rendering
fluxloaderAPI.setPatch("js/bundle.js", "heatstuf:RenderHook", {
    type: "replace",
    from: "r.pixi.app.renderer.render(r.pixi.app.stage)",
    to: "globalThis.heatstufRender(n.session.rendering.overlayContext, n.session.camera, n.session.input.mouse),$",
    token: "$"
});
// I just wanna say some words I won't leave in a mod, and this is a screw you
fluxloaderAPI.setPatch("js/546.bundle.js", "heatstuf:expose", {
    type: "replace",
    from: "n(3734)",
    to: "(globalThis.heatstufexpose=$)",
    token: "$",
    expectedMatches: 27 // this is the screw you
});
// give manager an onmessage what the hell
fluxloaderAPI.setPatch("js/bundle.js", "heatstuf:mgrHook", {
    type: "replace",
    from: 'console.log("initializing workers"),',
    to: "globalThis.heatstufmgrmsg(s.environment.multithreading.simulation),$",
    token: "$"
});
// hook sim worker at dur
fluxloaderAPI.setPatch("js/336.bundle.js", "heatstuf:durHook", {
    type: "replace",
    from: "A(e,t,r,a)",
    to: "globalThis.hsdurHook(e,t,r);$",
    token: "$"
})
// ahhh I gotta make a metric ton of hooks for moving pixels

const postSwap = "$globalThis.hss(E[2].x,E[2].y,E[0],E[1]);";
const mvPatches = [
    ["(0,u.Bp)(M)){", postSwap], // swap element
    ["&&(0,D.C)(W,E[0],E[1],E[2]))break;", postSwap],
/*    ["", ""],
    ["", ""],
    ["", ""],
    ["", ""],
    ["", ""],
    ["", ""],
    ["", ""],
    ["", ""],
    ["", ""],
    ["", ""],*/
];
for (let idx in mvPatches) {
    const patch = mvPatches[idx];
    fluxloaderAPI.setPatch("js/336.bundle.js", `heatstuf:mvPatch:${idx}`, {
        type: "replace",
        from: patch[0],
        to: patch[1],
        token: "$"
    })
}

// enable hiding the forced pretext on hints
fluxloaderAPI.setPatch("js/bundle.js", "heatstuf:fullHints", {
    type: "replace",
    from: `["Interacts with: ",n.interactions.join(" ")]`,
    to: "n.interactions[0]=='@RAWHINT'?[n.interactions.join(' ').substring(9)]:$", // 9 is e in "@RAWHINT e"
    token: "$",
});

// hook saving for heatmap
fluxloaderAPI.setPatch("js/bundle.js", "heatstuf:saveHook", {
    type: "replace",
    from: "r=e.session.saving.name",
    to: "globalThis.hsSave(e.store),$",
    token: "$"
});



// cus I ran out of things to add so gonna make some custom elements

// do this bc fluxloader is allergic to not being verbose

class e {
    constructor(id, name, matterType, density, colors) {
        colors.push(255); // cus corelib gets mad if you don't have rgba full
        colors = [colors];
        corelib.elements.registerElement({id,name,matterType,density,colors});
    }
}
class s {
    constructor(id, name ) {

    }
}

// [string, number, string, number], being id, chance
function _nest(arr) {
    if (!Array.isArray(arr)) return arr;
    const out = [];
    for (let i = 0; i < arr.length; i += 2) {
        out.push([arr[i], arr[i + 1]]);
    }
    return out;
}

function basic(in1, in2, out1, out2) {
    corelib.recipes.registerBasicRecipe({inputTop:in1,inputBottom:in2,outputTop:out1,outputBottom:out2});
}
function shaker(in1, out1, out2) {
    corelib.recipes.registerShakerRecipe({input:in1, outputAbove:_nest(out1),outputBelow:_nest(out2)});
}
function sauth(elem) {
    corelib.recipes.registerShakerAllows(elem);
}
function gauth(elem) {
    corelib.recipes.registerGrowerAllows(elem);
}
function bignore(elem) {
    corelib.recipes.registerConveyorBeltIgnores(elem);
}
function press(in1, out, speed) {
    corelib.recipes.registerPressRecipe({input:in1,requiredVelocity:speed,outputs:_nest(out)});
}
function grow(in1, out) {
    corelib.recipes.registerGrowerRecipe({input:in1, output:out});
}






new e("hsLeveler", "Heater (Inactive)", "Static", 70, [135,135,0]);
new e("hsLevelerU", "Heater (Heating)", "Static", 80, [195, 47, 0]);
new e("hsLevelerD", "Heater (Cooling)", "Static", 60, [0, 64, 238]);








