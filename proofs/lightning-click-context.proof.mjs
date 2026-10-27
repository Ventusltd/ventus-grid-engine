/**
 * Fail-closed PROOF of light-flash geographic context, not a numerical risk model.
 * Run: node proofs/lightning-click-context.proof.mjs
 * Uses one frozen authentic EUMETSAT event and clearly SYNTHETIC substation/
 * solar fixtures; does not pretend the mock sites are actual infrastructure.
 */
import assert from 'node:assert/strict';
import {createLightningContextEngine,lightningElectricalScenario,postEventDiligence,
  solarMarkerRadiusPx,lightningMarker,caveat} from '../engine/lightning-click-context.js';
import {parseDeepLink} from '../deeplink/contract.js';
import {distanceKm} from '../engine/v9-geodesy.js';

let checks=0;
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++};
const yes=(a,label)=>{assert.ok(a,label);checks++};
const refuses=(fn,rx,label)=>{assert.throws(fn,rx,label);checks++};

// Real source event; 25 Oct 2026, from the actual archived seven-day public feed.
const flash={
  type:'Feature',
  id:'W_XX-EUMETSAT-Darmstadt,IMG+SAT,MTI1+LI-2-LFL--FD--x-x--ARC-x_C_EUMT_20261025033353_L2PF_OPE_20261025032009_20261025033009_N__O_0021_0000:1133',
  geometry:{type:'Point',coordinates:[-4.212,55.374302]},
  properties:{observation_kind:'optical_lightning_flash',time_utc:'2026-10-25T03:28:34.229Z'}
};
const substations=[
  {name:'SYNTHETIC-nearest',code:'MOCK1',voltages_kv:[132,400],location:{lon:-4.20,lat:55.36}},
  {name:'SYNTHETIC-farther',code:'MOCK2',voltages_kv:[275],location:{lon:-4.9,lat:55.8}},
  {name:'SYNTHETIC-unlocated',code:'MOCK3',voltages_kv:[400],location:null},
  {name:'SYNTHETIC-no-voltage',code:'MOCK4',voltages_kv:[],location:{lon:-4.211,lat:55.374}}
];
const solarProjects=[
  {repd_ref:'6502',name:'SYNTHETIC-near-solar',technology:'Solar Photovoltaics',
    capacity_mw:373,latitude:55.37,longitude:-4.22,geometry_status:'valid'},
  {repd_ref:'23',name:'SYNTHETIC-small-solar',technology:'solar',
    capacity_mw:5,latitude:55.4,longitude:-4.28,geometry_status:'valid'},
  {repd_ref:'900',name:'SYNTHETIC-out-of-range',technology:'solar',
    capacity_mw:10,latitude:51.5,longitude:-0.1,geometry_status:'valid'},
  {repd_ref:'xx',name:'SYNTHETIC-nonnumeric-id',technology:'solar',
    capacity_mw:25,latitude:55.37,longitude:-4.20,geometry_status:'valid'},
  {repd_ref:'75',name:'SYNTHETIC-wind-not-solar',technology:'wind_onshore',
    capacity_mw:80,latitude:55.37,longitude:-4.20,geometry_status:'valid'},
  {repd_ref:'31',name:'SYNTHETIC-missing-location',technology:'solar',
    capacity_mw:30,latitude:null,longitude:-4.20,geometry_status:'missing'}
];
const eng=createLightningContextEngine({substations,solarProjects});
const c=eng.selectFlash(flash,{radiusKm:20,substationLimit:3});
eq(c.event.kind,'optical_lightning_flash','must not turn optical flash into ground strike');
eq(c.event.id,flash.id,'original source ID is retained exactly');
eq(c.event.time_utc,'2026-10-25T03:28:34.229Z','UTC exact');
eq(c.event.lon,-4.212,'source lon');
eq(c.event.lat,55.374302,'source lat');
eq(c.search.scanned_geolocated_substations,3,'unlocated excluded from denominator');
eq(eng.dataset_summary.locatable_repd_solar_projects,3,'only validated numeric genuine solar REPD entries');
eq(c.substations.length,2,'no-voltage sites are excluded by current nearest engine contract');
eq(c.substations[0].name,'SYNTHETIC-nearest','nearest based on actual existing engine');
eq(c.substations[0].km,distanceKm(-4.212,55.374302,-4.20,55.36),'matches existing geodesy exactly');
eq(c.nearby_solar.length,2,'radius and genuine REPD eligibility');
eq(c.nearby_solar[0].repd_ref,'6502','nearest solar project sorted');
const href=c.nearby_solar[0].gridatlas_project_url,u=new URL(href),parsed=parseDeepLink(href);
eq(u.origin,'https://ventusltd.github.io','canonical genuine GridAtlas receiver');
eq(u.pathname,'/gridatlas/atlas/','correct MAP target');
eq(parsed.repd_ref,'6502','never pass flash id as fake REPD identity');
eq(parsed.technology,'solar','valid tech bucket');
eq(parsed.layer_exists,true,'project layer actually exists');
eq(parsed.latitude,55.37,'coordinates are from selected solar, not the flash');
eq(parsed.longitude,-4.22,'coordinates are from selected solar');
eq(u.searchParams.get('capacity_mw'),'373','deployed Pipeline News advisory capacity preserved');
eq(u.searchParams.get('project'),'SYNTHETIC-near-solar','human-readable name preserved');
yes(c.nearby_solar[0].marker_radius_px>c.nearby_solar[1].marker_radius_px,'capacity size ordering');
yes(c.nearby_solar[0].marker_radius_px<=16,'size clamped, not false geographic radius');
eq(lightningMarker.touch_target_diameter_css_px,44,'mobile hit target contract');
yes(/NOT a confirmed ground strike/.test(caveat),'caveat explicit');
eq(eng.selectFlash(flash,{minimumKv:300}).substations.length,1,'minimum voltage filter honest');
eq(eng.selectFlash(flash,{radiusKm:1}).nearby_solar.length,1,'radial search bounded');
refuses(()=>eng.selectFlash({...flash,id:null}),/id/,'reject missing true event identity');
refuses(()=>eng.selectFlash({...flash,geometry:{type:'Point',coordinates:[null,55]}}),/coordinates/,'reject malformed geo');
refuses(()=>eng.selectFlash({...flash,properties:{...flash.properties,observation_kind:'ground_strike'}}),/optical/,'reject mislabeled event');
refuses(()=>eng.selectFlash({...flash,properties:{...flash.properties,time_utc:'bad'}}),/UTC/,'reject invalid observed time');
refuses(()=>eng.selectFlash(flash,{solarLimit:999}),/bounded/,'reject unbounded lookup');
refuses(()=>createLightningContextEngine({solarProjects:{}}),/arrays/,'reject unbounded object input');
eq(solarMarkerRadiusPx(null),5,'missing source MW has neutral size, not fabricated capacity');
const study=lightningElectricalScenario(c,{
  acEarthing:'IT',dcReference:'floating',inverterIsolation:'transformerless',selectedRepdRef:'6502'
});
eq(study.solver_status,'NOT_RUN','no invented electrical solution');
eq(study.results,null,'no simulated numerical fault currents or voltages');
eq(study.causation_established,false,'no inferred strike-fault causation');
eq(study.assumed_configuration.acEarthing,'IT','ac electrical topology explicit');
eq(study.assumed_configuration.dcReference,'floating','dc topology explicit');
eq(study.candidate_scenarios.find(x=>x.id==='it_ac_first_second_fault').applicable,true,'both IT earth fault scenarios included');
eq(study.candidate_scenarios.find(x=>x.id==='floating_dc_string').applicable,true,'floating string scenario included');
yes(study.candidate_scenarios.find(x=>x.id==='earth_potential_rise').needs.some(x=>/attachment/i.test(x)),'hypothetical source must be declared');
eq(study.site.repd_ref,'6502','scenario bound to genuine selected REPD, not optical id');
const unknown=lightningElectricalScenario(c);
eq(unknown.candidate_scenarios.find(x=>x.id==='it_ac_first_second_fault').applicable,false,'IT not silently assumed');
eq(unknown.candidate_scenarios.find(x=>x.id==='floating_dc_string').applicable,false,'floating DC not silently assumed');
refuses(()=>lightningElectricalScenario(c,{acEarthing:'any'}),/acEarthing/,'unsupported topology not accepted');
refuses(()=>lightningElectricalScenario(c,{selectedRepdRef:'404'}),/genuine nearby/,'cannot assert nonexistent site');
yes(study.disclaimer.includes('NOT a measured strike'),'explicit not-an-event diagnosis');

// The real public Pipeline News solar-part-00X.geojson format nests REPD
// attributes inside Feature.properties. Regression: don't discard all farms.
const solarGeoJSON={
  type:'Feature',id:'GG2050-REPD-12588',
  geometry:{type:'Point',coordinates:[-4.213,55.374]},
  properties:{capacity_mw:840,name:'SYNTHETIC-GeoJSON-Solar',
    repd_ref:'12588',repd_technology:'Solar Photovoltaics',technology:'solar'}
};
const substationGeoJSON={
  type:'Feature',id:'OSM-MOCK-400',
  geometry:{type:'Point',coordinates:[-4.210,55.374]},
  properties:{name:'SYNTHETIC-GeoJSON-Substation',voltage:'400000'}
};
const geoEngine=createLightningContextEngine({
  substations:[substationGeoJSON],
  solarProjects:[solarGeoJSON]
});
const geoResult=geoEngine.selectFlash(flash);
eq(geoResult.nearby_solar.length,1,'real Pipeline News Feature.properties schema is accepted');
eq(geoResult.nearby_solar[0].repd_ref,'12588','real REPD ID retained from GeoJSON');
eq(geoResult.nearby_solar[0].capacity_mw,840,'MW available for marker styling');
eq(geoResult.substations[0].voltages_kv[0],400,'OSM voltage volts converted to kV');
eq(geoResult.substations[0].source_site_id,'OSM-MOCK-400','feature id retained as source identity');
eq(geoResult.nearby_solar[0].gridatlas_project_url.includes('repd_ref=12588'),true,'canonical MAP link for GeoJSON record');


// The real original GridAtlas OSM layer can contain polygonal substations.
// Use the EXISTING representativePoint algorithm, not a new haversine.
const polygon={
  type:'Feature',id:'OSM-POLYGON',
  geometry:{type:'Polygon',coordinates:[[
    [-4.213,55.374],[-4.211,55.374],[-4.211,55.376],
    [-4.213,55.376],[-4.213,55.374]
  ]]},
  properties:{name:'SYNTHETIC-polygon-substation',voltage:'400000'}
};
const multi={
  type:'Feature',id:'OSM-MULTIPOLYGON',
  geometry:{type:'MultiPolygon',coordinates:[[
    [[-4.215,55.374],[-4.213,55.374],[-4.213,55.376],
     [-4.215,55.376],[-4.215,55.374]]
  ]]},
  properties:{name:'SYNTHETIC-multipolygon-substation',kv:'275'}
};
const line={
  type:'Feature',id:'OSM-LINE-NOT-SUBSTATION',
  geometry:{type:'LineString',coordinates:[[-4.21,55.374],[-4.20,55.375]]},
  properties:{name:'SYNTHETIC-line',voltage:'400000'}
};
const polyEngine=createLightningContextEngine({substations:[polygon,multi,line]});
const polyCtx=polyEngine.selectFlash(flash,{minimumKv:132});
eq(polyEngine.dataset_summary.located_substations,2,'polygon and multipolygon located; line excluded');
eq(polyCtx.substations.length,2,'existing geodesy returns both real polygon shapes');
eq(polyCtx.substations[0].source_site_id,'OSM-POLYGON','polygon source identity preserved');
eq(polyCtx.substations[0].voltages_kv[0],400,'OSM volts not misread as kV');
eq(polyCtx.substations[1].voltages_kv[0],275,'explicit kV preserved');
const diligence=postEventDiligence(geoResult,{selectedRepdRef:'12588'});
eq(diligence.site.repd_ref,'12588','diligence selected genuine source REPD');
eq(diligence.solver_status,'NOT_RUN','no electrical solver or fault current');
eq(diligence.causation_established,false,'no optical flash to fault causality');
yes(diligence.disclaimer.includes('NOT necessarily a ground strike'),'mandatory optical warning');
yes(diligence.disclaimer.includes('Other sources'),'other causes acknowledged');
yes(diligence.disclaimer.includes('diligence recommendation'),'inspection not diagnosis');
yes(diligence.actions.some(x=>x.includes('IMD')),'IMD alarm review');
yes(diligence.actions.some(x=>x.includes('RCMU')),'inverter RCMU review');
yes(diligence.actions.some(x=>x.includes('SPD')),'SPD status and counters');
yes(diligence.actions.some(x=>x.includes('insulation-resistance testing')),'AC/DC insulation testing');
yes(diligence.actions.some(x=>x.includes('bonding continuity')),'earthing and bonding checks');
yes(diligence.actions.some(x=>x.includes('thermography')),'cable/connector inspection');
yes(diligence.actions.some(x=>x.includes('weather')),'weather and capacitance context');
yes(diligence.overhead_note.includes('UNKNOWN'),'no invented pylon proximity');
yes(diligence.weather_note.includes('not established'),'no invented wet weather');
const informed=postEventDiligence(geoResult,{overheadLineProximity:'nearby',wetWeather:'wet'});
yes(informed.overhead_note.includes('explicitly supplied'),'line proximity is user-provided');
yes(informed.weather_note.includes('site-specific'),'no universal wet-array multiplier');
refuses(()=>postEventDiligence(geoResult,{wetWeather:'rainy probably'}),/wetWeather/,'reject unverified weather class');
refuses(()=>postEventDiligence(geoResult,{selectedRepdRef:'fake'}),/genuine nearby/,'no invented site identity');
refuses(()=>postEventDiligence(null),/actual selected/,'requires authentic optical context');

console.log('PASS — '+checks+' checks');
