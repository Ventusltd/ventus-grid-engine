/**
 * Lightning -> real-grid and solar-project context, proof-of-concept engine seam.
 *
 * Source optical flash != confirmed ground strike. Nearby != connected/affected.
 * Reuses Grid Engine's actual geodesy, nearest search and MAP deep-link contract.
 * No DOM/network, no solver, no attempt to modify GridAtlas or Pipeline News.
 */
import { distanceKm, voltagesKv, representativePoint } from './v9-geodesy.js';
import { index as indexSubstations } from './v9-nearest-search.js';
import { buildDeepLink } from '../deeplink/contract.js';

export const schema = 'ventus-grid-engine.lightning-click-context.v1';
export const caveat = 'Satellite optical lightning detection, NOT a confirmed ground strike. Proximity does not establish a strike, electrical coupling, physical fault, network connectivity or solar-farm damage.';

const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const validPoint = (lon,lat) => finite(lon) && finite(lat)
  && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90;
const optical = f => {
  if (f?.type !== 'Feature' || f?.geometry?.type !== 'Point'
     || !Array.isArray(f.geometry.coordinates)) throw new Error('Expected optical-flash GeoJSON Point');
  const [lon,lat] = f.geometry.coordinates;
  if (!validPoint(lon,lat) || f.geometry.coordinates.length < 2)
    throw new Error('Invalid optical-flash coordinates');
  if (f.properties?.observation_kind !== 'optical_lightning_flash')
    throw new Error('Not an optical lightning flash');
  if (f.id === undefined || f.id === null || !String(f.id).trim())
    throw new Error('Missing authentic optical flash id');
  const timeMs=Date.parse(f.properties?.time_utc);
  if (!Number.isFinite(timeMs)) throw new Error('Missing genuine optical UTC time');
  return {id:String(f.id),lon,lat,time_utc:new Date(timeMs).toISOString(),
    kind:'optical_lightning_flash',source:'EUMETSAT MTG LI L2-LFL'};
};
const rowLocation = (row) => {
  const p=row?.location, geom=row?.geometry;
  // Reuse the estate's existing polygon/MultiPolygon representative-point
  // contract. The original GridAtlas OSM substation layer is GeoJSON and
  // cannot be presumed to consist entirely of Point features.
  const centre=representativePoint(geom);
  const lon=p?.lon ?? p?.longitude ?? centre?.[0] ?? row?.longitude;
  const lat=p?.lat ?? p?.latitude ?? centre?.[1] ?? row?.latitude;
  return validPoint(lon,lat)?{lon,lat}:null;
};
const positive = n => finite(n) && n>0;
const capacityOf = project => {
  if (project?.capacity_mw == null || project?.capacity_mw === '') return null;
  const n=Number(project.capacity_mw);
  return positive(n)?n:null;
};
const solarProject = (project) => {
  // Real Pipeline News solar-part-00X.geojson has source fields inside
  // Feature.properties; the compact project index has them at the root.
  // Both are allowed, but identity and coordinates must genuinely exist.
  const p=project?.type==='Feature' ? project.properties : project;
  const t=String(p?.technology||p?.repd_technology||'').toLowerCase();
  if(!t.includes('solar'))return null;
  const location=rowLocation(project);
  if(!location || (p?.geometry_status && p.geometry_status!=='valid'))return null;
  const repdRef=String(p?.repd_ref??'').trim();
  if(!/^[0-9]+$/.test(repdRef))return null;
  const mw=capacityOf(p);
  return {repd_ref:repdRef,name:String(p.name||'Unnamed REPD solar project'),
    location,capacity_mw:mw,technology:'solar'};
};
/**
 * Size represents registered capacity (MW), NOT real hectares, lightning intensity
 * or electrical susceptibility. Minimum touch target must be supplied by the UI.
 */
export function solarMarkerRadiusPx(capacityMw) {
  return positive(capacityMw)?Math.min(16,Math.max(5,5+2*Math.sqrt(capacityMw/10))):5;
}
export const lightningMarker = Object.freeze({
  visible_radius_px:7,touch_target_diameter_css_px:44,
  note:'Draw a larger invisible hit layer; never change the real lon/lat.'
});
/** Index genuine available data ONCE; never download a 35.7MB register to handle click. */
export function createLightningContextEngine({substations=[],solarProjects=[]}={}) {
  if(!Array.isArray(substations)||!Array.isArray(solarProjects))
    throw new TypeError('Expected bounded arrays of actual data');
  const locatedSubstations=substations.map(p=>{
    // Accept the existing GridAtlas substation GeoJSON as well as the
    // normalised Grid Engine point contract. Do not infer kV from magnitude.
    const location=rowLocation(p);
    if(!location)return null;
    const meta=p.type==='Feature'?p.properties||{}:p;
    const kv=Array.isArray(meta.voltages_kv)?meta.voltages_kv:voltagesKv(meta);
    return {...meta,name:meta.name||p.name||null,code:meta.code||p.id||null,
      location,voltages_kv:kv};
  }).filter(Boolean);
  const subIndex=indexSubstations(locatedSubstations);
  const solar=solarProjects.map(solarProject).filter(Boolean);
  return Object.freeze({
    dataset_summary:Object.freeze({
      total_substations:substations.length,located_substations:subIndex.located,
      total_solar_records:solarProjects.length,locatable_repd_solar_projects:solar.length
    }),
    selectFlash(feature,{radiusKm=20,substationLimit=5,solarLimit=15,minimumKv=0}={}) {
      const event=optical(feature);
      if(!positive(radiusKm)||radiusKm>500||!Number.isInteger(substationLimit)||substationLimit<1
         ||substationLimit>25||!Number.isInteger(solarLimit)||solarLimit<1||solarLimit>50
         ||!finite(minimumKv)||minimumKv<0)
        throw new RangeError('Invalid bounded location search options');
      const nearest=subIndex.nearest(event.lon,event.lat,{minimumKv,limit:substationLimit});
      const matches=(Array.isArray(nearest)?nearest:(nearest?[nearest]:[])).map(x=>({
        name:x.point.name||null,
        source_site_id:x.point.code||x.point.site_code||null,
        voltages_kv:x.point.voltages_kv,
        km:x.km,
        location:x.point.location,
        note:'Straight-line proximity only; no known electrical connection, protection path or risk.'
      }));
      const nearby=solar.map(p=>({...p,km:distanceKm(event.lon,event.lat,p.location.lon,p.location.lat)}))
        .filter(p=>p.km<=radiusKm)
        .sort((a,b)=>a.km-b.km||a.repd_ref.localeCompare(b.repd_ref))
        .slice(0,solarLimit)
        .map(p=>{
          // The established GridAtlas receiver knows these genuine project
          // parameters; repd_ref remains the identity, never a flash ID.
          const url=new URL(buildDeepLink({
            repd_ref:p.repd_ref,technology:p.technology,
            latitude:p.location.lat,longitude:p.location.lon,zoom:12
          }));
          url.searchParams.set('project',p.name);
          if(p.capacity_mw!==null)url.searchParams.set('capacity_mw',String(p.capacity_mw));
          return {...p,marker_radius_px:solarMarkerRadiusPx(p.capacity_mw),
            gridatlas_project_url:url.href,
            note:'Registered project centroid/point; distance does not establish a strike or fault.'};
        });
      return {schema,event,substations:matches,nearby_solar:nearby,
        search:{radius_km:radiusKm,minimum_substation_kv:minimumKv,
          scanned_geolocated_substations:subIndex.located,
          scanned_repd_solar_projects:solar.length},
        status:'GEOGRAPHICAL_CONTEXT_ONLY',warning:caveat};
    }
  });
}
/**
 * Post-event diligence prompt, NOT evidence of damage or a diagnosed fault.
 * Works only with a real optical observation and actually located source
 * records. No site topology, overhead line or weather is inferred from pixels.
 */
export function postEventDiligence(context,{
  selectedRepdRef=null,overheadLineProximity='unknown',wetWeather='unknown'
}={}) {
  if(!context?.event||context.event.kind!=='optical_lightning_flash')
    throw new Error('Diligence requires actual selected optical-flash context');
  if(!['unknown','nearby','not_reported_nearby'].includes(overheadLineProximity))
    throw new RangeError('overheadLineProximity');
  if(!['unknown','wet','dry'].includes(wetWeather))throw new RangeError('wetWeather');
  const site=selectedRepdRef==null?null:context.nearby_solar
    .find(p=>p.repd_ref===String(selectedRepdRef));
  if(selectedRepdRef!=null&&!site)throw new Error('Select a genuine nearby REPD project');
  const actions=[
    'Review IMD alarm/event logs and insulation-resistance trend, where an IMD is installed.',
    'Review inverter RCMU/residual-current and protection-trip logs around the observation time.',
    'Check SPD status indicators and surge counters; inspect and replace operated units under site procedures.',
    'Consider safe, suitably authorised insulation-resistance testing of DC strings and AC feeders.',
    'Check earthing and bonding continuity, especially long AC runs and known overhead-line interfaces.',
    'Inspect connectors and cable terminations; use thermography where appropriate.',
    'Record weather and moisture conditions and compare with site-specific PV-to-earth leakage/capacitance history.'
  ];
  return {
    schema:'ventus-grid-engine.post-event-diligence.v1',
    observation:context.event,
    site:site?{repd_ref:site.repd_ref,name:site.name,distance_km:site.km}:null,
    assumed_inputs:{overheadLineProximity,wetWeather},
    actions,
    recommendation:'Observed lightning activity near a mapped asset: consider a post-event inspection as engineering diligence, not as a diagnosis.',
    overhead_note:overheadLineProximity==='nearby'
      ?'Overhead line/pylon proximity was explicitly supplied; consider earth-potential rise and conducted surge paths.'
      :'Overhead line/pylon proximity UNKNOWN or not reported; it is NOT inferred from the optical flash.',
    weather_note:wetWeather==='wet'
      ?'Wet conditions explicitly supplied; review site-specific leakage and capacitance, not a universal multiplier.'
      :'Weather not established by the optical observation; do not infer moisture or PV-to-earth capacitance.',
    solver_status:'NOT_RUN',
    causation_established:false,
    other_possible_causes:['Grid switching transients','Equipment failure',
      'Insulation ageing/degradation','Moisture ingress','Second IT earth fault'],
    disclaimer:'EUMETSAT optical flash, NOT necessarily a ground strike or evidence any asset was hit. Other sources may cause surges, currents or damage. Inspection is a diligence recommendation, NOT a fault diagnosis.'
  };
}

/**
 * Scenario SETUP, not an electrical calculation. A user must specify the actual
 * inverter earthing topology and hypothetical surge. Never infer from LI pixels.
 */
export function lightningElectricalScenario(context,{
  acEarthing='unspecified',dcReference='unspecified',
  inverterIsolation='unspecified',selectedRepdRef=null
}={}) {
  if(!context?.event||context.event.kind!=='optical_lightning_flash')
    throw new Error('Scenario requires actual selected optical-flash context');
  if(!['IT','TN','TT','unspecified'].includes(acEarthing))throw new RangeError('acEarthing');
  if(!['floating','functional_earthed','unspecified'].includes(dcReference))
    throw new RangeError('dcReference');
  if(!['transformerless','isolated','unspecified'].includes(inverterIsolation))
    throw new RangeError('inverterIsolation');
  const selected=selectedRepdRef==null?null:context.nearby_solar
    .find(p=>p.repd_ref===String(selectedRepdRef));
  if(selectedRepdRef!=null&&!selected)throw new Error('Select a genuine nearby REPD project');
  const base=['Actual installation SLD, voltage classes, inverter manufacturer/model and galvanic isolation',
    'Cable circuit lengths/geometry, sheath/screen/PE connections, insulation withstand and locations',
    'Transformer windings, earth electrode/bonding impedances incl. impulse/frequency dependence',
    'SPD types, placement, protective ratings and equipment withstand curves',
    'Assumed surge injection point, waveform/current magnitude and return path — NOT from satellite data'];
  const scenarios=[
    {id:'induced_surge',label:'Hypothetical nearby induced surge',needs:[
      'Mutual electromagnetic coupling, conductor loop areas and cable/shield transients',...base]},
    {id:'earth_potential_rise',label:'Assumed attachment and earth potential rise',needs:[
      'Manually defined hypothetical attachment location and soil/earth-grid impedance',...base]},
    {id:'it_ac_first_second_fault',label:'IT AC first and second earth fault',applicable:acEarthing==='IT',
      needs:['IMD function and setpoints, first-fault current return paths, second independent earth fault',
        'Isolation/disconnection protection, anti-PID functional earthing interactions',...base]},
    {id:'floating_dc_string',label:'Floating DC string-to-earth and second fault',
      applicable:dcReference==='floating',
      needs:['DC polarity-to-PE leakage/capacitance, module frame/structures and combiner protection',
        'Arc/insulation monitoring; inverter common-mode model when actually available',...base]},
    {id:'ac_dc_coupled',label:'Hypothetical AC/inverter/DC/PE transient coupling',
      needs:['Manufacturer-validated inverter common-mode and DC/AC isolation equivalent circuits',...base]}
  ];
  return {schema:'ventus-grid-engine.lightning-electrical-scenario.v1',
    source_observation:context.event,
    site:selected?{repd_ref:selected.repd_ref,name:selected.name,capacity_mw:selected.capacity_mw}:null,
    assumed_configuration:{acEarthing,dcReference,inverterIsolation},
    candidate_scenarios:scenarios,
    solver_status:'NOT_RUN',results:null,causation_established:false,
    disclaimer:'Parametric thought experiment only: NOT a measured strike, diagnosed site fault, protection study, safety/compliance assessment or asset risk score.'};
}
