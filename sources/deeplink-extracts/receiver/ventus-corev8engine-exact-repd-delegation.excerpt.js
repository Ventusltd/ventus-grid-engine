/*
 * PROVENANCE (excerpt)
 * source_repo: gridatlas
 * source_path: atlas/parts/202609040229-ventus-corev8engine-exact-repd-delegation.js
 * head_sha (gridatlas): 2d8cc7bacf80a3f20ecfb96ea24548fcea43a19d (repo HEAD
 *   64268fd06a0da54ddffbcdaaaee382e314e829f7, file unchanged since)
 * lines: 61-90 and 796-840 (two ranges from the same file, concatenated)
 *
 * Carried into the LIVE cartridge "substation-intelligence" (current.json
 * generation 202609041330, v9.111) as its 'carried_shell_script', replacing
 * ventus-corev8engine.js -- the THIRD script the shell loads.
 *
 * Range 1 (lines 61-90): REPD_IDS -- the engine's OWN real layer-id vocabulary.
 * Note it has 'wind' but neither 'wind_onshore' nor 'wind_offshore', and no
 * 'other' -- this is WHY the sld-sandbox bucket-to-layer-id mapping table exists
 * (see receiver/sld-sandbox-technology-vocabulary.excerpt.js).
 *
 * Range 2 (lines 796-840): focusCanonicalProjectDeepLink() -- this engine's own
 * former deep-link handler. As of v9.101/v9.102 it no longer fetches or acts on
 * anything; it parses repd_ref/technology only to publish
 * window.__GRIDATLAS_V8_DEEP_LINK__ = { status: 'DEFERRED_TO_EXACT_REPD_RECEIVER', ... }
 * and returns -- all real handling belongs to the search cartridge (identity) and
 * the sld-sandbox cartridge (measurement, layers, card). Called once from
 * initVentusMap at line 1495 of this same file, during engine boot.
 */
    const layerConfigById = new Map(
        GRID_CONFIG.flatMap(g => g.layers).map(l => [l.id, l])
    );

    // Removed naei_co2 from here so it gets its own dedicated source
    const REPD_IDS    = ['solar','solar_operational','solar_roof','wind','wind_onshore_operational','wind_offshore_operational','bess','bess_operational','biomass','tidal','hydrogen','hydro','flywheel','act','geothermal','caes'];
    const TRANSIT_IDS = ['elizabeth','lu','dlr','metro','tram','hs2'];
    const TRANSIT_SOURCE_MAP = { 'elizabeth':'src-elizabeth','lu':'src-lu','dlr':'src-metros','metro':'src-metros','tram':'src-metros','hs2':'src-hs2' };
    const TRANSIT_URLS = { 'src-elizabeth':'/elizabeth_line.geojson','src-lu':'/london_underground.geojson','src-metros':'/uk_metros_trams.geojson','src-hs2':'/hs2.geojson' };

    const SEARCH_THRESHOLD = {
        'solar':50,'solar_roof':0.5,'wind':50,'bess':50,'biomass':50,
        'tidal':10,'hydrogen':10,'hydro':10,'flywheel':1,'act':10,'geothermal':1,'caes':1
    };

    const TECH_TERMS = new Map([
        ['solar','solar farm'],['solar_roof','rooftop solar'],['wind','wind farm'],
        ['bess','battery storage'],['biomass','biomass plant'],['tidal','tidal energy'],
        ['hydrogen','hydrogen plant'],['hydro','hydro power'],['flywheel','flywheel storage'],
        ['act','advanced conversion energy'],['geothermal','geothermal energy'],['caes','compressed air energy storage']
    ]);

    const TECH_COLOURS = new Map([
        ['solar','#ffff00'],['solar_roof','#ffcc00'],['wind','#00ffff'],['bess','#ffae00'],
        ['biomass','#39ff14'],['tidal','#00bfff'],['hydrogen','#ffffff'],['hydro','#00aaff'],
        ['flywheel','#ff69b4'],['act','#ff6600'],['geothermal','#ff3300'],['caes','#88aaff']
    ]);

    const STATUS_COLOURS = {
        'operational':'#00ff88','under construction':'#ffcc00','awaiting construction':'#ffaa00',

/* --- range 2, lines 796-840 --- */
    // V9 canonical project deep links. Identity is resolved only by official REPD Ref;
    // URL names and coordinates are never used to manufacture a match.
    async function focusCanonicalProjectDeepLink() {
        const params = new URLSearchParams(window.location.search);
        const repdRef = String(params.get('repd_ref') || '').trim();
        if (!/^[A-Za-z0-9-]{1,40}$/.test(repdRef)) return;

        try {
            const requestedTechnology = String(params.get('technology') || '').trim();
            const allowedTechnologies = new Set([
                'solar', 'solar_operational', 'solar_roof',
                'bess', 'bess_operational',
                'wind', 'wind_onshore', 'wind_onshore_operational',
                'wind_offshore', 'wind_offshore_operational',
                'biomass', 'tidal', 'hydrogen', 'hydro', 'flywheel',
                'act', 'geothermal', 'caes', 'other'
            ]);
            /* One exact identity owner. The search cartridge queries the pinned
               active-register product and publishes RESOLVED,
               NOT_IN_ACTIVE_REGISTER or FAILED. This carried V8 receiver used
               a site-relative /uk_renewables_pipeline path owned by another
               domain, so on GridAtlas Pages it issued a redundant 404 before
               falling back to the same supplied point. Delegate every REPD
               identity before any legacy fetch, including a ref-only arrival
               that legitimately supplies no technology. The measurement
               cartridge already uses valid supplied coordinates immediately
               and reconciles against the exact owner concurrently. */
            window.__GRIDATLAS_V8_DEEP_LINK__ = {
                status: 'DEFERRED_TO_EXACT_REPD_RECEIVER',
                repd_ref: repdRef,
                technology: requestedTechnology || null,
                technology_recognised: requestedTechnology
                    ? allowedTechnologies.has(requestedTechnology) : null,
                legacy_fetches: 0
            };
            return;
        } catch (error) {
            console.error('[V9 DEEP LINK FAILED]', error);
            const lon = Number(params.get('longitude'));
            const lat = Number(params.get('latitude'));
            if (Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90) {
                map.flyTo({ center: [lon, lat], zoom: 12, duration: 1800, essential: true });
            }
        }
    }
