import d3 from "d3";

/** Parameters: The parameters for the visualizer. */
export class Parameters {
    // For the semantic graph
    /** LinkMinimumDistance: The minimum distance to create links between codes. */
    public LinkMinimumDistance = 0.6;
    /** LinkMaximumDistance: The maximum distance to create links between codes. */
    public LinkMaximumDistance = 0.9;
    /** ClosestNeighbors: The number of closest neighbors to guarantee links regardless of the threshold. */
    public ClosestNeighbors = 3;
    /** UseNearOwners: Whether to visualize the near-owners in place of owners. */
    public UseNearOwners = true;
    /** UseExtendedChunk: Whether to consider the extended part of data chunks when filtering. */
    public UseExtendedChunk = false;
}

/** Lerp: Linearly interpolate between two values. */
export function InverseLerp(a: number, b: number, t: number, clamp = true): number {
    const result = (t - a) / (b - a);
    if (clamp) {
        return Math.min(1, Math.max(0, result));
    }
    return result;
}

/** CalculateJSD: Calculate the Jensen-Shannon Divergence between two distributions. */
export function CalculateJSD(P: number[], Q: number[]): number {
    // Helper function to calculate the KL divergence
    function KLD(P: number[], Q: number[]): number {
        return P.reduce((sum, p, i) => {
            if (p === 0) {
                return sum;
            }
            if (Q[i] === 0) {
                throw new Error("KL Divergence is not defined when Q[i] is 0 and P[i] is non-zero");
            }
            return sum + p * Math.log(p / Q[i]);
        }, 0);
    }

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
}

/** GetCodebookColor: Get the color of a codebook. */
export function GetCodebookColor(Number: number, Codebooks: number): string {
    if (Codebooks <= 10) {
        return d3.schemeTableau10[Number];
    }
    return d3.interpolateSinebow(Number / Codebooks);
}

/** FormatDate: Format a date. */
export function FormatDate(Date?: Date) {
    if (!Date) {
        return "(Unknown)";
    }
    return Date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        hour12: false,
    });
}

/** PostData: Post data to a URL in the browser context. */
export function PostData(URL: string, Data: unknown) {
    return fetch(URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(Data),
    });
}
