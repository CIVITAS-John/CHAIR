/** Generate a seeded random number. */
const seededRand = (seed: number) => {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
};

/**
 * Shuffle an array using a seed.
 * @see https://stackoverflow.com/questions/16801687/javascript-random-ordering-with-seed
 */
export const seededShuffle = <T>(array: T[], seed: number) => {
    let m = array.length,
        t,
        i;
    // While there remain elements to shuffle...
    while (m) {
        // Pick a remaining element...
        i = Math.floor(seededRand(seed) * m--);
        // And swap it with the current element.
        t = array[m];
        array[m] = array[i];
        array[i] = t;
        ++seed;
    }
    return array;
};
