/**
 * @typedef {'title'|'region'|'conditions'|'point'|'cast'|'bite'|'fight'|'result'|'card'} ScreenId
 *
 * @typedef {Object} AppState
 * @property {ScreenId} screen
 * @property {string} region
 * @property {string} point
 * @property {any|null} catchData
 */

/**
 * @typedef {Object} FishSpecies
 * @property {string} id
 * @property {string} name_ja
 * @property {string} name_en
 * @property {'N'|'R'|'SR'|'UR'} rarity
 * @property {string[]} habitat
 * @property {number[]} season
 * @property {{min:number,typical:number,max:number}} size_cm
 * @property {{hp:number,pattern:'run'|'dive'|'slack',power:number}} fight
 * @property {string} real_note
 * @property {string} regulation_note
 * @property {string} art
 */

/**
 * @typedef {Object} DexEntry
 * @property {string} species_id
 * @property {{count:number,max_cm:number|null,first_at:string|null}} game
 * @property {{count:number,max_cm:number|null,first_at:string|null,photo_ref:string|null}} real
 * @property {string[]} badges
 */

export {};
