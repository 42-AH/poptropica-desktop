// Explicitly reviewed silent classic islands. Unknown islands and all AS3
// destinations stay with their existing audio. These are curated archive tracks,
// not a claim that every island originally shipped with this soundtrack.
export const CLASSIC_ISLAND_AUDIO=Object.freeze({
  astro:{name:'Astro Knights',music:'DaVinci_Theme.mp3',ambient:'light_wind_01_loop.mp3'},
  bignate:{name:'Big Nate',music:'sunny_day.mp3',ambient:'sunny_clear_day_02_loop.mp3'},
  boardwalk:{name:'Wimpy Boardwalk',music:'Tropical_Island_Party.mp3',ambient:'beach_waves_loop.mp3'},
  charlie:{name:'Charlie and the Chocolate Factory',music:'smorgasbord.mp3',ambient:'production_factory_muffled.mp3'},
  early:{name:'Early Poptropica',music:'PoptropicaTheme.mp3',ambient:'sunny_clear_day_02_loop.mp3'},
  japan:{name:'Red Dragon',music:'ancient_temple.mp3',ambient:'light_wind_01_loop.mp3'},
  moon:{name:'Lunar Colony',music:'space_quest.mp3',ambient:'futuristic_drone_01_loop.mp3'},
  reality:{name:'Reality TV',music:'tropical_beach.mp3',ambient:'light_wind_01_loop.mp3'},
  shark:{name:'Shark Tooth',music:'tropical_beach.mp3',ambient:'beach_waves_loop.mp3'},
  shipwreck:{name:'S.O.S.',music:'calm_seas.mp3',ambient:'lapping_water_loop.mp3'},
  spy:{name:'Spy Island',music:'Spy_Main_Theme.mp3',ambient:'city_night_time.mp3'},
  trade:{name:'Skullduggery',music:'calm_seas.mp3',ambient:'lapping_water_loop.mp3'},
  tribal:{name:'Poptropolis Games (Classic)',music:'Poptropolis_Main_Theme_Full.mp3',ambient:'arena_crowd_01_L.mp3'},
  villain:{name:'Super Villain',music:'Villain_Theme.mp3',ambient:'futuristic_drone_01_loop.mp3'},
  west:{name:'Wild West',music:'wild_west_main_theme.mp3',ambient:'ghost_town.mp3'},
  wimpy:{name:'Wimpy Wonderland',music:'Cabin_Fever.mp3',ambient:'winter_wind_01_loop.mp3'},
  woodland:{name:'Twisted Thicket',music:'Twisted_Old_Forest.mp3',ambient:'forest_loop.mp3'},
});

export function selectClassicAudio(island,room) {
  if(typeof island!=='string'||typeof room!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(room)||/^(Global|Ad)/i.test(room))return null;
  const key=island.toLowerCase();
  if(!Object.hasOwn(CLASSIC_ISLAND_AUDIO,key))return null;
  const result={...CLASSIC_ISLAND_AUDIO[key]};
  if(/House|Shop|Store|Office|School|Library|Museum|Gallery|Hotel|Diner|Cafe|Apartment|Motel|Room|Interior|Castle|Mill|Bunker/i.test(room))result.ambient='room_tone_01_loop.mp3';
  if(/Cave|Cavern|Tunnel|Sewer|Underground|Mine\d*$/i.test(room))result.ambient='sewers_or_cave_01_loop.mp3';
  if(key==='astro'&&/^(Asteroid|Astrozone|Rocket|Planetarium|Fire|Ice|Jungle|Mordred)/.test(room)){
    result.music='space_quest.mp3';result.ambient='futuristic_drone_01_loop.mp3';
  }
  return result;
}
