import d3 from 'd3';

/** Parameters: The parameters for the visualizer. */
export class Parameters {
    // For the semantic graph
    /** LinkMinimumDistance: The minimum distance to create links between codes. */
    public LinkMinimumDistance: number = 0.65;
    /** LinkMaximumDistance: The maximum distance to create links between codes. */
    public LinkMaximumDistance: number = 0.9;
    /** ClosestNeighbors: The number of closest neighbors to guarantee links regardless of the threshold. */
    public ClosestNeighbors: number = 3;
    /** UseNearOwners: Whether to visualize the near-owners in place of owners. */
    public UseNearOwners: boolean = true;
}

/** Lerp: Linearly interpolate between two values. */
export function InverseLerp(a: number, b: number, t: number, clamp: boolean = true): number {
    var result = (t - a) / (b - a)
    if (clamp) return Math.min(1, Math.max(0, result));
    return result;
}

/** GetCodebookColor: Get the color of a codebook. */
export function GetCodebookColor(Number: number, Codebooks: number): string {
    if (Codebooks <= 10)
        return d3.schemeTableau10[Number];
    else return d3.interpolateSinebow(Number / Codebooks);
}