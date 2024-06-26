/** Shuffle: Shuffle an array using a seed. */
// Source: https://stackoverflow.com/questions/16801687/javascript-random-ordering-with-seed
export function Shuffle<T> (Array: T[], Seed: number) {
    var m = Array.length,
        t,
        i;
    // While there remain elements to shuffle…
    while (m) {
        // Pick a remaining element…
        i = Math.floor(SimpleSeededRandom(Seed) * m--)
        // And swap it with the current element.
        t = Array[m];
        Array[m] = Array[i];
        Array[i] = t;
        ++Seed;
    }
    return Array;
}

/** SimpleSeededRandom: Generate a seeded random number. */
export function SimpleSeededRandom (Seed: number) {
    var x = Math.sin(Seed++) * 10000
    return x - Math.floor(x)
}
