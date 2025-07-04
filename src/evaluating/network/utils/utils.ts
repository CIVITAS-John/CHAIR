import d3 from "d3";

/** The parameters for the visualizer. */
export class Parameters {
    // For the semantic graph
    /** The minimum distance to create links between codes. */
    linkMinDist = 0.6;
    /** The maximum distance to create links between codes. */
    linkMaxDist = 0.9;
    /** The number of closest neighbors to guarantee links regardless of the threshold. */
    closestNeighbors = 3;
    /** Whether to visualize the near-owners in place of owners. */
    useNearOwners = true;
    /** Whether to consider the extended part of data chunks when filtering. */
    useExtendedChunk = false;
}

/** Linearly interpolate between two values. */
export const inverseLerp = (a: number, b: number, t: number, clamp = true) => {
    const result = (t - a) / (b - a);
    if (clamp) {
        return Math.min(1, Math.max(0, result));
    }
    return result;
};

// Helper function to calculate the KL divergence
const KLD = (P: number[], Q: number[]) =>
    P.reduce((sum, p, i) => {
        if (p === 0) {
            return sum;
        }
        if (Q[i] === 0) {
            throw new Error("KL Divergence is not defined when Q[i] is 0 and P[i] is non-zero");
        }
        return sum + p * Math.log(p / Q[i]);
    }, 0);

/** Calculate the Jensen-Shannon Divergence between two distributions. */
export const calculateJSD = (P: number[], Q: number[]) => {
    // Normalize the distributions to make them probability distributions
    const sumP = P.reduce((a, b) => a + b, 0);
    const sumQ = Q.reduce((a, b) => a + b, 0);
    const normalizedP = P.map((p) => p / sumP);
    const normalizedQ = Q.map((q) => q / sumQ);

    // Calculate the average distribution
    const M = normalizedP.map((p, i) => (p + normalizedQ[i]) / 2);

    // Calculate the Jensen-Shannon Divergence
    const jsd = (KLD(normalizedP, M) + KLD(normalizedQ, M)) / 2;

    return jsd;
};

/** Calculate the KL Divergence between two distributions. */
export const calculateKL = (P: number[], Q: number[]) => {
    // Normalize the distributions to make them probability distributions
    const sumP = P.reduce((a, b) => a + b, 0);
    const sumQ = Q.reduce((a, b) => a + b, 0);
    const normalizedP = P.map((p) => p / sumP);
    const normalizedQ = Q.map((q) => q / sumQ);

    // Calculate the KL Divergence
    return KLD(normalizedP, normalizedQ);
};

/** Calculate the Weighted Absolute Difference % (value / maximum) between observed values from a codebook & the aggregation (baseline) of its peers. */
export const calculateWAD = (W: number[], B: number[], O: number[]) => {
    let value = 0;
    let maximum = 0;
    for (let i = 0; i < O.length; i++) {
        const w = W[i];
        const b = B[i];
        const o = O[i];
        value += w * Math.abs(b - o);
        maximum += w;
    }
    return value / maximum;
};

/** Calculate the Weighted Squared Difference % (value / maximum) between observed values from a codebook & the aggregation (baseline) of its peers. */
export const calculateWSD = (W: number[], B: number[], O: number[]) => {
    let value = 0;
    let maximum = 0;
    for (let i = 0; i < O.length; i++) {
        const w = W[i];
        const b = B[i];
        const o = O[i];
        value += w * Math.abs(b - o) * Math.abs(b - o);
        maximum += w;
    }
    return value / maximum;
};

/** Get the color of a codebook. */
export const getCodebookColor = (num: number, codebooks: number) => {
    if (codebooks <= 10) {
        return d3.schemeTableau10[num];
    }
    return d3.interpolateSinebow(num / codebooks);
};

/** Format a date. */
export const formatDate = (date: Date) => {
    if (!(date instanceof Date)) {
        return "(Unknown)";
    }
    return date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        hour12: false,
    });
};

/** Post data to a URL in the browser context. */
export const postData = (url: string, data: unknown) =>
    fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
    });
