import { SwimStyle, Gender, RecordType } from './types';
import type { SwimEvent, SwimRecord, FormattableEvent, Entry, Heat, LaneAssignment } from './types';

// FIX: Add explicit types for better type inference across the app.
export const SWIM_STYLE_OPTIONS: SwimStyle[] = Object.values(SwimStyle);
export const GENDER_OPTIONS: Gender[] = Object.values(Gender);
export const AGE_GROUP_OPTIONS: string[] = ['KU Senior', 'KU 1', 'KU 2', 'KU 3', 'KU 4', 'KU 5'];

// --- Translations ---

export const GENDER_TRANSLATIONS: Record<Gender, string> = {
    [Gender.MALE]: "Putra",
    [Gender.FEMALE]: "Putri",
    [Gender.MIXED]: "Campuran",
};

export const SWIM_STYLE_TRANSLATIONS: Record<SwimStyle, string> = {
    [SwimStyle.FREESTYLE]: "Gaya Bebas",
    [SwimStyle.BACKSTROKE]: "Gaya Punggung",
    [SwimStyle.BREASTSTROKE]: "Gaya Dada",
    [SwimStyle.BUTTERFLY]: "Gaya Kupu-kupu",
    [SwimStyle.MEDLEY]: "Gaya Ganti Perorangan",
    [SwimStyle.PAPAN_LUNCUR]: "Papan Luncur / Kickboard",
};

export const translateGender = (gender: Gender): string => GENDER_TRANSLATIONS[gender] || gender;
export const translateSwimStyle = (style: SwimStyle): string => SWIM_STYLE_TRANSLATIONS[style] || style;

export const formatEventName = (event: FormattableEvent): string => {
    let style = translateSwimStyle(event.style);
    const gender = translateGender(event.gender);
    const category = event.category ? `${event.category} ` : '';

    if (event.relayLegs && event.relayLegs > 1) {
        if (event.style === SwimStyle.MEDLEY) {
            style = "Gaya Ganti"; // For relays, just "Gaya Ganti"
        }
        return `${event.relayLegs} x ${event.distance}m Estafet ${style} ${category}${gender}`;
    }
    
    // For individual events, the default translation is now "Gaya Ganti Perorangan", which is correct.
    return `${event.distance}m ${style} ${category}${gender}`;
};

export const formatTime = (ms: number): string => {
    if (ms === -1) return 'DQ';
    if (ms === -2) return 'NS';
    if (ms < 0) return 'DQ'; // Fallback for any other negative value
    if (ms === 0) return '99:99.99';
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const milliseconds = ms % 1000;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0').slice(0, 2)}`;
};

export const parseMsToTimeParts = (ms: number): { min: string, sec: string, ms: string } => {
    if (ms <= 0) return { min: '0', sec: '0', ms: '000' };
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const milliseconds = ms % 1000;
    return {
        min: String(minutes),
        sec: String(seconds),
        ms: String(milliseconds).padStart(3, '0'),
    };
};

export const romanize = (num: number): string => {
    if (isNaN(num) || num <= 0) return '';
    const lookup: {[key: string]: number} = {M:1000,CM:900,D:500,CD:400,C:100,XC:90,L:50,XL:40,X:10,IX:9,V:5,IV:4,I:1};
    let roman = '';
    for (let i in lookup ) {
        while ( num >= lookup[i] ) {
            roman += i;
            num -= lookup[i];
        }
    }
    return roman;
};

export const toTitleCase = (str: string): string => {
    if (!str) return '';
    return str.toUpperCase();
};

export const generateHeats = (entries: Entry[], lanesPerHeat: number): Heat[] => {
    if (!entries || entries.length === 0 || lanesPerHeat <= 0) {
        return [];
    }

    const MIN_SWIMMERS_PER_HEAT = 3;

    // Sort all swimmers by seedTime, slowest to fastest. NT (0) is slowest.
    const sortedSwimmers = [...entries].sort((a, b) => {
        // Treat NT (seedTime = 0) as infinitely slow.
        const timeA = a.seedTime === 0 ? Infinity : a.seedTime;
        const timeB = b.seedTime === 0 ? Infinity : b.seedTime;
        // Sort descending by time (slower times first) to get an array from slowest to fastest.
        return timeB - timeA;
    });


    const numSwimmers = sortedSwimmers.length;
    let numHeats = Math.ceil(numSwimmers / lanesPerHeat);

    if (numHeats === 0) return [];
    
    // Determine the size of each heat, trying to fill the fastest heats first.
    let heatSizes = new Array(numHeats).fill(0);
    let swimmersToAssign = numSwimmers;
    // This loop just determines the raw number of swimmers per heat if we fill from the back
    for (let i = numHeats - 1; i >= 0; i--) {
        const size = Math.min(swimmersToAssign, lanesPerHeat);
        heatSizes[i] = size;
        swimmersToAssign -= size;
    }
    
    // Re-balance heats to meet the minimum swimmers rule if necessary.
    // This is applied if the first heat has too few swimmers.
    if (numHeats > 1) {
        for (let i = 0; i < numHeats - 1; i++) {
            if (heatSizes[i] < MIN_SWIMMERS_PER_HEAT) {
                const needed = MIN_SWIMMERS_PER_HEAT - heatSizes[i];
                let borrowed = 0;
                // Borrow from subsequent (faster) heats
                for (let j = i + 1; j < numHeats; j++) {
                    const canGive = heatSizes[j] - MIN_SWIMMERS_PER_HEAT;
                    if (canGive > 0) {
                        const amountToTake = Math.min(needed - borrowed, canGive);
                        heatSizes[i] += amountToTake;
                        heatSizes[j] -= amountToTake;
                        borrowed += amountToTake;
                        if (borrowed >= needed) break;
                    }
                }
            }
        }
    }
    
    // Remove heats that became empty after rebalancing (unlikely but safe)
    heatSizes = heatSizes.filter(size => size > 0);
    numHeats = heatSizes.length;

    const getLaneOrder = (numLanesForPool: number): number[] => {
        const order: number[] = [];
        let center = Math.ceil(numLanesForPool / 2);
        let left = center;
        let right = center + 1;
        for (let i = 0; i < numLanesForPool; i++) {
            order.push(i % 2 === 0 ? left-- : right++);
        }
        return order;
    };
    
    const finalHeats: Heat[] = [];
    let swimmerIndex = 0;

    for (let i = 0; i < numHeats; i++) {
        const currentHeatSize = heatSizes[i];
        // Take swimmers for the current heat from the sorted list (slowest first)
        const heatEntries = sortedSwimmers.slice(swimmerIndex, swimmerIndex + currentHeatSize);
        
        // Sort the swimmers within this specific heat to assign lanes (fastest in center)
        const entriesForLaneSeeding = [...heatEntries].sort((a, b) => {
            if (a.seedTime === 0) return 1; // NT is slowest
            if (b.seedTime === 0) return -1;
            return a.seedTime - b.seedTime; // Faster times (smaller numbers) first
        });

        const assignments: LaneAssignment[] = [];
        const laneOrderPattern = getLaneOrder(lanesPerHeat);
        
        for(let k = 0; k < currentHeatSize; k++){
            assignments.push({
                lane: laneOrderPattern[k],
                entry: entriesForLaneSeeding[k]
            });
        }

        assignments.sort((a, b) => a.lane - b.lane);

        finalHeats.push({
            heatNumber: i + 1,
            assignments: assignments,
        });

        swimmerIndex += currentHeatSize;
    }
    
    return finalHeats.map((heat, index) => ({...heat, heatNumber: index + 1}));
};