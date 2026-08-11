struct SceneConfig {
    width: u32,
    height: u32,
};

@group(0) @binding(0) var<storage, read_write> heatMap: array<f32>;
@group(0) @binding(1) var<storage, read_write> nextHeat: array<f32>;
@group(0) @binding(2) var<storage, read_write> displacedHeat: array<f32>;
@group(0) @binding(3) var<storage, read> heatMv: array<vec2<f32>>;
@group(0) @binding(4) var<storage, read> fgBuffer: array<u32>; // Packed Uint16
@group(0) @binding(5) var<storage, read> bgBuffer: array<u32>; // Packed Uint8
@group(0) @binding(6) var<storage, read> fgStats: array<vec2<f32>>; // [ret, abs]
@group(0) @binding(7) var<storage, read> bgStats: array<vec2<f32>>; // [ret, abs]
@group(0) @binding(8) var<uniform> config: SceneConfig;

// Unpack 16-bit IDs from a u32 array
fn get_fg(idx: u32) -> u32 {
    let val = fgBuffer[idx / 2u];
    return select(val >> 16u, val & 0xFFFFu, idx % 2u == 0u);
}

// Unpack 8-bit IDs from a u32 array
fn get_bg(idx: u32) -> u32 {
    let val = bgBuffer[idx / 4u];
    let shift = (idx % 4u) * 8u;
    return (val >> shift) & 0xFFu;
}

fn get_cell_stats(idx: u32) -> vec2<f32> {
    // temp sanity bypass incase stuff don't work
    //return vec2<f32>(0.5, 0.5);
    let fg_id = get_fg(idx);
    if (fg_id != 0u) {
        return fgStats[fg_id];
    }
    return bgStats[get_bg(idx)];
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    // 1. Boundary check: Stop if we are outside the world map
    if (id.x >= config.width || id.y >= config.height) { return; }
    
    let idx = id.y * config.width + id.x;
    
    // 2. Process Displacement: Add moved heat and reset the displacement buffer
    let current_temp = heatMap[idx] + displacedHeat[idx];

    // 3. Get Center Stats
    let my_stats = get_cell_stats(idx);
    let my_retention = clamp(my_stats.x, 0.0, 1.0); // 0 = leaky, 1 = insulator
    let my_absorb = clamp(my_stats.y, 0.0, 1.0);    // 0 = ignores heat, 1 = pulls heat

    // 4. Neighbor directions
    let dirs = array<vec2<i32>, 8>(
        vec2<i32>(-1, 0), vec2<i32>(1, 0), vec2<i32>(0, -1), vec2<i32>(0, 1)
        // can be removed safely, but fits bc cells can slide out of diagonal gaps
        ,vec2<i32>(-1,-1),vec2<i32>(1,-1),vec2<i32>(1,1),vec2<i32>(-1,1)
    );

    let move_vec = heatMv[idx];
    var flow_sum = 0.0;

    // 5. Calculate FLOW for each neighbor
    for (var i = 0; i < 8; i++) {
        let nx = i32(id.x) + dirs[i].x;
        let ny = i32(id.y) + dirs[i].y;

        // Skip neighbors that are outside the map
        if (nx < 0 || nx >= i32(config.width) || ny < 0 || ny >= i32(config.height)) {
            continue;
        }

        let n_idx = u32(ny) * config.width + u32(nx);
        let n_temp = heatMap[n_idx];
        let n_stats = get_cell_stats(n_idx);
        
        let n_ret = clamp(n_stats.x, 0.0, 1.0);
        let n_abs = clamp(n_stats.y, 0.0, 1.0);

        // SYMMETRIC CONDUCTANCE (The Secret Sauce)
        // This value 'k' is identical when calculated by either neighbor.
        // It's the "Bridge" that heat travels across.
        let my_to_n = (1.0 - my_retention) * n_abs;
        let n_to_my = (1.0 - n_ret) * my_absorb;
        var k = (my_to_n + n_to_my) * 0.5;

        // Apply Fan/Wind Influence (Advection)
        let dir_f = vec2<f32>(f32(dirs[i].x), f32(dirs[i].y));
        let wind = dot(move_vec, dir_f);
        k *= (1.0 + wind);

        // Calculate flow: Positive = we lose heat, Negative = we gain heat.
        let flow = (current_temp - n_temp) * clamp(k, 0.0, 1.0) * 0.1; // 0.1 when 8 neighbors for 0.025 inprecision safe zone, use 0.2 for 4 neighbor for 0.05 buffer
        flow_sum += flow;
    }

    // 6. Final Write: Update the next frame buffer
    nextHeat[idx] = current_temp - flow_sum;
}