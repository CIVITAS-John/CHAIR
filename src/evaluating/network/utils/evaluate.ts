import type {
    Code,
    CodebookComparison,
    CodebookEvaluation,
    DataChunk,
    DataItem,
} from "../../../schema.js";

import { getConsolidatedSize } from "./dataset.js";
import { buildSemanticGraph } from "./graph.js";
import type { Component, Graph } from "./schema.js";
import type { Parameters } from "./utils.js";
import { calculateJSD, calculateKL } from "./utils.js";

/** Evaluate all codebooks based on the network structure. */
export const evaluateCodebooks = (
    dataset: CodebookComparison<DataChunk<DataItem>>,
    parameters: Parameters,
): Record<string, CodebookEvaluation> => {
    const results: Record<string, CodebookEvaluation> = {};
    const observations: number[][] = [[]];
    const baselines: number[][] = [[]];
    const ndWeights: number[] = [];
    const cbWeights: number[] = [0];
    // Prepare for the results
    const codebooks = dataset.codebooks;
    const names = dataset.names;
    for (let i = 1; i < codebooks.length; i++) {
        results[names[i]] = {
            coverage: 0,
            density: 0,
            overlap: 0,
            novelty: 0,
            divergence: 0,
            contributions: 0,
        };
        observations.push([]);
        baselines.push([]);
        cbWeights.push(dataset.weights?.[i] ?? 1);
    }
    // Calculate weights per node
    const graph = buildSemanticGraph(dataset, parameters);
    let totalWeight = 0,
        totalNovelty = 0;
    for (const node of graph.nodes) {
        totalWeight += node.totalWeight;
        totalNovelty += (node.novelty ?? 0) * node.totalWeight;
        ndWeights.push(node.totalWeight);
    }
    // The expectations are made based on (consolidate codes in each codebook) / (codes in the baseline)
    const consolidated = codebooks.map((codebook, i) => {
        if (i === 0) {
            return Object.keys(codebooks[0]).length;
        }
        return getConsolidatedSize(codebooks[0], codebook);
    });
    // Check if each node is covered by the codebooks
    for (const node of graph.nodes) {
        const nodeWeight = node.totalWeight;
        // Calculate on each codebook
        for (let i = 1; i < codebooks.length; i++) {
            const result = results[names[i]];
            const observed = node.weights[i];
            const weighted = nodeWeight * observed;
            result.density += observed;
            result.coverage += weighted;
            result.novelty += weighted * (node.novelty ?? 0);
            // For overlap, we reduce the code's own weight from the total weight, thus ignoring its own contribution
            // For grouped codebooks, we sum the weight of its component codebooks
            let contribution = observed * cbWeights[i];
            let potential = dataset.totalWeight ?? NaN;
            if (dataset.groups && (dataset.groups[i]?.length ?? 0) > 0) {
                contribution = 0;
                for (const j of dataset.groups[i]) {
                    contribution += node.weights[j] * cbWeights[j];
                    potential -= cbWeights[i];
                }
            } else potential -= cbWeights[i];
            const overlap = (nodeWeight - contribution) * observed;
            result.contributions += contribution;
            result.overlap += overlap;
            // for KL
            observations[i].push(nodeWeight * observed);
            baselines[i].push((nodeWeight * nodeWeight) / totalWeight);
            // for JSD
            // observations[i].push(nodeWeight * observed);
            // baselines[i].push(nodeWeight * (nodeWeight - contribution) / potential);
            // for WSD
            // observations[i].push(observed);
            // baselines[i].push((nodeWeight - contribution) / potential);
        }
    }
    // Finalize the results
    for (let i = 1; i < codebooks.length; i++) {
        const result = results[names[i]];
        result.coverage = result.coverage / totalWeight;
        result.overlap = result.overlap / (totalWeight - result.contributions);
        // 7/2 change: density should mean "how many codes did you use to get to that *unweighted* coverage? ie how interconnected your codes are?"
        result.density = consolidated[i] / result.density;
        // result.density = consolidated[i] / consolidated[0] / result.coverage;
        result.novelty = result.novelty / totalNovelty;
        result.divergence = calculateKL(observations[i], baselines[i]);
        // result.divergence = Math.sqrt(calculateJSD(baselines[i], observations[i]));
        // result.divergence = calculateWSD(ndWeights, baselines[i], observations[i]);
        result.count = Object.keys(codebooks[i]).length;
        result.consolidated = consolidated[i];
        delete result.contributions; // Remove weights as it is not needed in the final results
    }
    // Count the code numbers
    results["$$$ total"] = {
        consolidated: consolidated[0],
    };
    return results;
};

/** Evaluate all users based on the network structure. */
export const evaluateUsers = (
    dataset: CodebookComparison<DataChunk<DataItem>>,
    parameters: Parameters,
): Record<string, CodebookEvaluation> => {
    const results: Record<string, CodebookEvaluation> = {};
    const observations: number[][] = [[]];
    // Prepare for the results
    const users = Array.from(dataset.uidToNicknames?.keys() ?? []);
    users.unshift("# Everyone");
    for (let i = 1; i < users.length; i++) {
        results[users[i]] = { coverage: 0, novelty: 0, divergence: 0, count: 0 };
        observations.push([]);
    }
    // Prepare for the examples
    const examples: Map<string, number> = new Map<string, number>();
    Object.values(dataset.source.data)
        .flatMap((chunk) => Object.entries(chunk))
        .flatMap(([, value]) => value.items)
        .forEach((item) => {
            // TODO: Support subchunks
            if (!("uid" in item)) {
                return;
            }
            examples.set(item.id, users.indexOf(item.uid));
            results[item.uid].count += 1;
        });
    // Calculate weights per user
    const weights = new Array<number>(users.length).fill(1);
    weights[0] = 0;
    // Calculate weights per node
    const graph = buildSemanticGraph(
        dataset,
        parameters,
        users.length,
        (code) => {
            const owners = new Set<number>();
            owners.add(0);
            for (let example of code.examples ?? []) {
                example = example.split("|||")[0];
                if (examples.has(example)) {
                    const user = examples.get(example) ?? NaN;
                    if (!owners.has(user)) {
                        owners.add(examples.get(example) ?? NaN);
                    }
                }
            }
            return owners;
        },
        weights,
    );
    let totalWeight = 0,
        totalNovelty = 0;
    for (const node of graph.nodes) {
        observations[0].push(node.totalWeight);
        totalWeight += node.totalWeight;
        totalNovelty += node.novelty ?? 0;
    }
    // Check if each node is covered by the codebooks
    for (const node of graph.nodes) {
        const weight = node.totalWeight;
        // Calculate on each user
        for (let i = 1; i < users.length; i++) {
            const result = results[users[i]];
            const observed = node.weights[i];
            result.coverage += weight * observed;
            result.novelty += observed * (node.novelty ?? 0);
            observations[i].push(weight * observed);
        }
    }
    // Finalize the results
    for (let i = 1; i < users.length; i++) {
        const result = results[users[i]];
        result.coverage = result.coverage / totalWeight;
        result.novelty = result.novelty / totalNovelty;
        result.divergence = Math.sqrt(calculateJSD(observations[0], observations[i]));
    }
    return results;
};

/** Evaluate all codebooks per cluster, based on the network structure. */
export const evaluatePerCluster = (
    dataset: CodebookComparison<DataChunk<DataItem>>,
    graph: Graph<Code>,
    _parameters: Parameters,
): { component: Component<Code>; coverages: number[]; differences: number[] }[] => {
    const results: { component: Component<Code>; coverages: number[]; differences: number[] }[] =
        [];
    // Prepare for the results
    const codebooks = dataset.codebooks;
    let totalCoverages = dataset.names.map(() => 0);
    // Calculate weights per cluster
    for (const cluster of graph.components ?? []) {
        let totalWeight = 0;
        let coverages = dataset.names.map(() => 0);
        // Check if each node is covered by the codebooks
        for (const node of cluster.nodes) {
            const weight = node.totalWeight;
            totalWeight += weight;
            // Calculate on each codebook
            for (let i = 0; i < codebooks.length; i++) {
                const observed = node.weights[i];
                coverages[i] += weight * observed;
                totalCoverages[i] += weight * observed;
            }
        }
        coverages = coverages.map((coverage) => coverage / totalWeight);
        // Put it back to the results
        results.push({ component: cluster, coverages: coverages.slice(1), differences: [] });
    }
    // Calculate the total coverage and relative difference
    totalCoverages = totalCoverages.map((Coverage) => Coverage / totalCoverages[0]);
    for (const result of results) {
        result.differences = result.coverages.map(
            (coverage, i) => coverage / totalCoverages[i + 1] - 1,
        );
    }
    return results;
};
